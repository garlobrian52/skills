import type Stripe from "stripe"
import { getStripeClient } from "./client.js"
import { requireEnv } from "./env.js"
import {
  findRecordByCheckoutSession,
  findRecordByStripeId,
  findRecordBySubscription,
  mutateStore,
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

/**
 * Restrict the onboarding-complete branch to the *merchant* capability event.
 * Other `*.capability_status_updated` events (e.g. recipient configuration)
 * must not flip a seller to onboarded.
 */
function isMerchantCapabilityEvent(type: string): boolean {
  if (type === MERCHANT_CAPABILITY_EVENT) return true
  return (
    type.includes("capability_status_updated") && type.includes("merchant")
  )
}

/** Best-effort extraction of a capability status from a webhook event. */
function extractCapabilityStatus(event: {
  data?: unknown
}): string | null {
  const data = (event as Record<string, unknown>).data
  if (isObject(data)) {
    if (typeof data.status === "string") return data.status
    const object = data.object
    if (isObject(object) && typeof object.status === "string") {
      return object.status
    }
  }
  return null
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

  if (isMerchantCapabilityEvent(type)) {
    const accountId = extractAccountId(event as Stripe.Event)
    if (!accountId) {
      return {
        type,
        handled: false,
        sellerId: null,
        detail: "No account id found on capability event",
      }
    }
    // Only treat an explicitly non-active capability status as "not ready".
    // When no status is present (e.g. thin v2 events) preserve the prior
    // behaviour of marking onboarding complete.
    const status = extractCapabilityStatus(event)
    if (status !== null && status !== "active") {
      return {
        type,
        handled: true,
        sellerId: null,
        detail: `Merchant capability status is "${status}", not marking onboarding complete`,
      }
    }
    return mutateStore((store) => {
      const record = findRecordByStripeId(store, accountId)
      if (!record) {
        return {
          type,
          handled: false,
          sellerId: null,
          detail: `No local seller mapped to ${accountId}`,
        }
      }
      record.merchantOnboarded = true
      record.updatedAt = new Date().toISOString()
      return {
        type,
        handled: true,
        sellerId: record.sellerId,
        detail: "Marked merchant onboarding complete",
      }
    }, storePath)
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
    return mutateStore((store) => {
      const record = findRecordByCheckoutSession(store, sessionId)
      if (!record) {
        return {
          type,
          handled: false,
          sellerId: null,
          detail: `No local seller mapped to checkout session ${sessionId}`,
        }
      }
      record.checkoutCompleted = true
      record.updatedAt = new Date().toISOString()
      return {
        type,
        handled: true,
        sellerId: record.sellerId,
        detail: "Marked checkout payment complete",
      }
    }, storePath)
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
    const customerAccount = (
      invoice as Stripe.Invoice & { customer_account?: string | null }
    )?.customer_account ?? null

    return mutateStore((store) => {
      let record: ConnectedAccountRecord | null = null
      if (subscriptionId) {
        record = findRecordBySubscription(store, subscriptionId)
      }
      if (!record && customerAccount) {
        record = findRecordByStripeId(store, customerAccount)
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
      record.updatedAt = new Date().toISOString()
      return {
        type,
        handled: true,
        sellerId: record.sellerId,
        detail: "Marked subscription invoice paid",
      }
    }, storePath)
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
