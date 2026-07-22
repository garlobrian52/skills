import type Stripe from "stripe"
import { getStripe } from "./client.js"
import {
  findCheckoutBySessionId,
  findSellerByStripeAccountId,
  findSubscriptionByStripeId,
  upsertCheckout,
  upsertSeller,
  upsertSubscription,
} from "./store.js"

export type HandledEvent =
  | { type: "merchant_capability_updated"; sellerId?: string; status?: string }
  | { type: "checkout_completed"; checkoutId?: string; sessionId: string }
  | { type: "invoice_payment_succeeded"; subscriptionId?: string }
  | { type: "ignored"; eventType: string }

/**
 * Handle Stripe webhook events from the Accounts v2 embedded payments blueprint:
 * - v2.core.account[configuration.merchant].capability_status_updated
 * - checkout.session.completed
 * - invoice.payment_succeeded
 */
export async function handleStripeEvent(
  event: Stripe.Event | Stripe.V2.Core.Event,
): Promise<HandledEvent> {
  const type = event.type

  if (
    type ===
    "v2.core.account[configuration.merchant].capability_status_updated"
  ) {
    return handleMerchantCapabilityUpdated(event as Stripe.V2.Core.Event)
  }

  if (type === "checkout.session.completed") {
    return handleCheckoutCompleted(event as Stripe.Event)
  }

  if (type === "invoice.payment_succeeded") {
    return handleInvoicePaymentSucceeded(event as Stripe.Event)
  }

  return { type: "ignored", eventType: type }
}

async function handleMerchantCapabilityUpdated(
  event: Stripe.V2.Core.Event,
): Promise<HandledEvent> {
  const related =
    (event as { related_object?: { id?: string } }).related_object?.id ??
    (event as { data?: { object?: { id?: string } } }).data?.object?.id

  if (!related) {
    return { type: "merchant_capability_updated" }
  }

  const seller = await findSellerByStripeAccountId(related)
  if (!seller) {
    return { type: "merchant_capability_updated" }
  }

  seller.merchantCapabilityStatus = "active"
  seller.onboardingStatus = "complete"
  seller.updatedAt = new Date().toISOString()
  await upsertSeller(seller)

  return {
    type: "merchant_capability_updated",
    sellerId: seller.id,
    status: "active",
  }
}

async function handleCheckoutCompleted(
  event: Stripe.Event,
): Promise<HandledEvent> {
  const session = event.data.object as Stripe.Checkout.Session
  const existing = await findCheckoutBySessionId(session.id)
  if (existing) {
    existing.status = session.status ?? "complete"
    existing.updatedAt = new Date().toISOString()
    await upsertCheckout(existing)
    return {
      type: "checkout_completed",
      checkoutId: existing.id,
      sessionId: session.id,
    }
  }

  return { type: "checkout_completed", sessionId: session.id }
}

function subscriptionIdFromInvoice(invoice: Stripe.Invoice): string | undefined {
  const parent = invoice.parent
  const details = parent?.subscription_details
  if (!details?.subscription) return undefined
  return typeof details.subscription === "string"
    ? details.subscription
    : details.subscription.id
}

async function handleInvoicePaymentSucceeded(
  event: Stripe.Event,
): Promise<HandledEvent> {
  const invoice = event.data.object as Stripe.Invoice
  // Prefer parent.subscription_details (current Invoice shape); fall back to legacy field.
  const legacy = (invoice as { subscription?: string | { id: string } | null })
    .subscription
  const subscriptionRef =
    subscriptionIdFromInvoice(invoice) ??
    (typeof legacy === "string" ? legacy : legacy?.id)

  if (!subscriptionRef) {
    return { type: "invoice_payment_succeeded" }
  }

  const existing = await findSubscriptionByStripeId(subscriptionRef)
  if (existing) {
    existing.status = "active"
    existing.updatedAt = new Date().toISOString()
    await upsertSubscription(existing)
    return {
      type: "invoice_payment_succeeded",
      subscriptionId: existing.id,
    }
  }

  return { type: "invoice_payment_succeeded", subscriptionId: subscriptionRef }
}

/**
 * Verify and parse a webhook payload.
 * Supports classic snapshot events via constructEvent when STRIPE_WEBHOOK_SECRET is set.
 */
export function constructWebhookEvent(
  payload: string | Buffer,
  signature: string | undefined,
  webhookSecret = process.env.STRIPE_WEBHOOK_SECRET,
): Stripe.Event {
  if (webhookSecret && signature) {
    const stripe = getStripe()
    return stripe.webhooks.constructEvent(payload, signature, webhookSecret)
  }
  // Dev fallback when no signing secret is configured.
  const raw = typeof payload === "string" ? payload : payload.toString("utf8")
  return JSON.parse(raw) as Stripe.Event
}
