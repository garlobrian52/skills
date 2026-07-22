import type Stripe from "stripe"
import {
  defaultStorePath,
  findMerchantByStripeAccountId,
  upsertMerchant,
} from "./store.js"

export const HANDLED_EVENT_TYPES = [
  "v2.core.account[configuration.merchant].capability_status_updated",
  "checkout.session.completed",
  "invoice.payment_succeeded",
] as const

export type HandledEventType = (typeof HANDLED_EVENT_TYPES)[number]

export interface WebhookHandleResult {
  handled: boolean
  eventType: string
  merchantId?: string
  detail?: string
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null
}

function extractAccountId(payload: unknown): string | null {
  const obj = asRecord(payload)
  if (!obj) return null
  if (typeof obj.id === "string" && obj.id.startsWith("acct_")) return obj.id
  if (typeof obj.account === "string") return obj.account
  const data = asRecord(obj.data)
  if (data) {
    if (typeof data.id === "string" && data.id.startsWith("acct_")) return data.id
    if (typeof data.account === "string") return data.account
    const nested = asRecord(data.object)
    if (nested) {
      if (typeof nested.id === "string" && nested.id.startsWith("acct_")) {
        return nested.id
      }
      if (typeof nested.customer_account === "string") {
        return nested.customer_account
      }
    }
  }
  if (typeof obj.customer_account === "string") return obj.customer_account
  const related = asRecord(obj.related_object)
  if (related && typeof related.id === "string" && related.id.startsWith("acct_")) {
    return related.id
  }
  return null
}

/**
 * Verify and parse a Stripe webhook payload (snapshot or thin events).
 */
export function constructWebhookEvent(
  stripe: Stripe,
  payload: string | Buffer,
  signature: string,
  secret: string = process.env.STRIPE_WEBHOOK_SECRET ?? "",
): Stripe.Event | Stripe.V2.Core.Event {
  if (!secret) {
    throw new Error(
      "STRIPE_WEBHOOK_SECRET is required. Obtain it from the Stripe Dashboard or `stripe listen`.",
    )
  }
  return stripe.webhooks.constructEvent(payload, signature, secret)
}

/**
 * Persist relevant Stripe webhook outcomes onto the local merchant record.
 */
export async function handleStripeEvent(
  event: { type: string; data?: { object?: unknown }; related_object?: unknown },
  storePath: string = defaultStorePath(),
): Promise<WebhookHandleResult> {
  const type = event.type

  if (type === "v2.core.account[configuration.merchant].capability_status_updated") {
    const accountId =
      extractAccountId(event) ??
      extractAccountId(event.related_object) ??
      extractAccountId(event.data?.object)
    if (!accountId) {
      return {
        handled: false,
        eventType: type,
        detail: "Could not resolve account id from thin event payload",
      }
    }
    const merchant = await findMerchantByStripeAccountId(accountId, storePath)
    if (!merchant) {
      return {
        handled: false,
        eventType: type,
        detail: `No local merchant for ${accountId}`,
      }
    }
    const obj = asRecord(event.data?.object) ?? asRecord(event.related_object)
    const merchantConfig = asRecord(asRecord(obj?.configuration)?.merchant)
    const caps = asRecord(merchantConfig?.capabilities)
    const cardPayments = asRecord(caps?.card_payments)
    const status =
      (typeof cardPayments?.status === "string" && cardPayments.status) ||
      "updated"
    await upsertMerchant(
      {
        ...merchant,
        merchantCapabilityStatus: status,
        onboardedAt:
          status === "active"
            ? merchant.onboardedAt ?? new Date().toISOString()
            : merchant.onboardedAt,
      },
      storePath,
    )
    return {
      handled: true,
      eventType: type,
      merchantId: merchant.id,
      detail: `merchantCapabilityStatus=${status}`,
    }
  }

  if (type === "checkout.session.completed") {
    const session = asRecord(event.data?.object)
    const sessionId = typeof session?.id === "string" ? session.id : null
    const accountId =
      (typeof session?.stripe_account === "string" && session.stripe_account) ||
      extractAccountId(session)
    // Prefer lookup by stored checkout session id when Stripe-Account header context is absent.
    const { loadStore } = await import("./store.js")
    const store = await loadStore(storePath)
    let merchant =
      (sessionId &&
        store.merchants.find((m) => m.stripeCheckoutSessionId === sessionId)) ||
      (accountId
        ? await findMerchantByStripeAccountId(accountId, storePath)
        : null)
    if (!merchant) {
      return {
        handled: false,
        eventType: type,
        detail: "No local merchant matched checkout session",
      }
    }
    await upsertMerchant(
      {
        ...merchant,
        stripeCheckoutSessionId: sessionId ?? merchant.stripeCheckoutSessionId,
        stripeCheckoutSessionUrl:
          typeof session?.url === "string"
            ? session.url
            : merchant.stripeCheckoutSessionUrl,
      },
      storePath,
    )
    return {
      handled: true,
      eventType: type,
      merchantId: merchant.id,
      detail: `checkoutSession=${sessionId}`,
    }
  }

  if (type === "invoice.payment_succeeded") {
    const invoice = asRecord(event.data?.object)
    const accountId =
      (typeof invoice?.customer_account === "string" &&
        invoice.customer_account) ||
      extractAccountId(invoice)
    const subscriptionId =
      typeof invoice?.subscription === "string"
        ? invoice.subscription
        : asRecord(invoice?.subscription)?.id
    const { loadStore } = await import("./store.js")
    const store = await loadStore(storePath)
    let merchant =
      (typeof subscriptionId === "string" &&
        store.merchants.find((m) => m.stripeSubscriptionId === subscriptionId)) ||
      (accountId
        ? await findMerchantByStripeAccountId(accountId, storePath)
        : null)
    if (!merchant) {
      return {
        handled: false,
        eventType: type,
        detail: "No local merchant matched invoice",
      }
    }
    await upsertMerchant(
      {
        ...merchant,
        stripeSubscriptionId:
          (typeof subscriptionId === "string" && subscriptionId) ||
          merchant.stripeSubscriptionId,
        subscriptionStatus: "active",
      },
      storePath,
    )
    return {
      handled: true,
      eventType: type,
      merchantId: merchant.id,
      detail: `subscription=${subscriptionId ?? merchant.stripeSubscriptionId}`,
    }
  }

  return { handled: false, eventType: type, detail: "Unhandled event type" }
}
