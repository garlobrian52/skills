import type Stripe from "stripe"
import { getStripeClient } from "./client.js"
import { requireEnv } from "./env.js"
import {
  findAccountByCheckoutSession,
  findAccountByStripeId,
  findAccountBySubscription,
  upsertAccount,
  type ConnectedAccountRecord,
} from "./store.js"

export const MERCHANT_CAPABILITY_EVENT =
  "v2.core.account[configuration.merchant].capability_status_updated"
export const CHECKOUT_COMPLETED_EVENT = "checkout.session.completed"
export const INVOICE_PAYMENT_SUCCEEDED_EVENT = "invoice.payment_succeeded"

export interface WebhookHandleResult {
  type: string
  handled: boolean
  sellerId: string | null
  detail: string
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function extractAccountId(event: { type?: string; data?: unknown; account?: unknown; related_object?: unknown }): string | null {
  const anyEvent = event as unknown as Record<string, unknown>
  const data = anyEvent.data
  if (isObject(data)) {
    if (typeof data.id === "string" && data.id.startsWith("acct_")) {
      return data.id
    }
    const object = data.object
    if (isObject(object) && typeof object.id === "string" && object.id.startsWith("acct_")) {
      return object.id
    }
    if (typeof data.account === "string") return data.account
  }
  if (typeof anyEvent.account === "string") return anyEvent.account
  if (typeof anyEvent.related_object === "object" && anyEvent.related_object) {
    const related = anyEvent.related_object as Record<string, unknown>
    if (typeof related.id === "string" && related.id.startsWith("acct_")) {
      return related.id
    }
  }
  return null
}

/**
 * Apply a verified Stripe webhook event to the local connected-account store.
 */
export async function handleStripeWebhookEvent(
  event: Stripe.Event | { type: string; data?: unknown; id?: string },
  storePath?: string,
): Promise<WebhookHandleResult> {
  const type = event.type

  if (type === MERCHANT_CAPABILITY_EVENT || type.includes("capability_status_updated")) {
    const accountId = extractAccountId(event as Stripe.Event)
    if (!accountId) {
      return {
        type,
        handled: false,
        sellerId: null,
        detail: "No account id found on capability event",
      }
    }
    const record = await findAccountByStripeId(accountId, storePath)
    if (!record) {
      return {
        type,
        handled: false,
        sellerId: null,
        detail: `No local seller mapped to ${accountId}`,
      }
    }
    record.merchantOnboarded = true
    await upsertAccount(record, storePath)
    return {
      type,
      handled: true,
      sellerId: record.sellerId,
      detail: "Marked merchant onboarding complete",
    }
  }

  if (type === CHECKOUT_COMPLETED_EVENT) {
    const dataObject = (event as Stripe.Event).data?.object as
      | Stripe.Checkout.Session
      | undefined
    const sessionId = dataObject?.id
    if (!sessionId) {
      return {
        type,
        handled: false,
        sellerId: null,
        detail: "Checkout session id missing",
      }
    }
    const record = await findAccountByCheckoutSession(sessionId, storePath)
    if (!record) {
      return {
        type,
        handled: false,
        sellerId: null,
        detail: `No local seller mapped to checkout session ${sessionId}`,
      }
    }
    record.checkoutCompleted = true
    await upsertAccount(record, storePath)
    return {
      type,
      handled: true,
      sellerId: record.sellerId,
      detail: "Marked checkout payment complete",
    }
  }

  if (type === INVOICE_PAYMENT_SUCCEEDED_EVENT) {
    const invoice = (event as Stripe.Event).data?.object as Stripe.Invoice | undefined
    const subscriptionRef = (
      invoice as Stripe.Invoice & {
        subscription?: string | { id: string } | null
      }
    )?.subscription
    const subscriptionId =
      typeof subscriptionRef === "string"
        ? subscriptionRef
        : subscriptionRef?.id ?? null

    let record: ConnectedAccountRecord | null = null
    if (subscriptionId) {
      record = await findAccountBySubscription(subscriptionId, storePath)
    }
    if (!record) {
      const customerAccount = (
        invoice as Stripe.Invoice & { customer_account?: string | null }
      )?.customer_account
      if (customerAccount) {
        record = await findAccountByStripeId(customerAccount, storePath)
      }
    }
    if (!record) {
      return {
        type,
        handled: false,
        sellerId: null,
        detail: "No local seller mapped to invoice subscription/account",
      }
    }
    record.subscriptionPaid = true
    if (subscriptionId && !record.subscriptionId) {
      record.subscriptionId = subscriptionId
    }
    await upsertAccount(record, storePath)
    return {
      type,
      handled: true,
      sellerId: record.sellerId,
      detail: "Marked subscription invoice paid",
    }
  }

  return {
    type,
    handled: false,
    sellerId: null,
    detail: "Event type ignored",
  }
}

/**
 * Verify a webhook payload and return the constructed event.
 * Supports both classic v1 snapshot events and thin v2 events.
 */
export function constructWebhookEvent(
  payload: string | Buffer,
  signature: string,
  webhookSecret?: string,
  stripe: Stripe = getStripeClient(),
): Stripe.Event {
  const secret = webhookSecret ?? requireEnv("STRIPE_WEBHOOK_SECRET")
  return stripe.webhooks.constructEvent(payload, signature, secret)
}
