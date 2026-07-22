import type Stripe from "stripe"
import { getStripeClient } from "./client.js"
import { getWebhookSecret } from "./config.js"
import { PaymentsStore } from "./store.js"

export interface WebhookHandleResult {
  type: string
  handled: boolean
  sellerId?: string
  paymentId?: string
  detail?: string
}

function relatedAccountId(event: Stripe.Event | Record<string, unknown>): string | null {
  const data = (event as Stripe.Event).data
  const obj = data?.object as unknown as Record<string, unknown> | undefined
  if (obj) {
    if (typeof obj.account === "string") return obj.account
    if (typeof obj.customer_account === "string") return obj.customer_account
    if (typeof obj.id === "string" && obj.id.startsWith("acct_")) return obj.id
  }

  // Thin v2 events may nest related_object
  const related = (event as { related_object?: { id?: string } }).related_object
  if (related?.id?.startsWith("acct_")) return related.id

  return null
}

/**
 * Process Stripe webhook / event-destination payloads for the Accounts v2
 * embedded payments + subscriptions flow.
 */
export async function handlePaymentsWebhook(
  payload: string | Buffer,
  signature: string | undefined,
  deps: {
    stripe?: Stripe
    store?: PaymentsStore
    webhookSecret?: string
  } = {},
): Promise<WebhookHandleResult> {
  const stripe = deps.stripe ?? getStripeClient()
  const store = deps.store ?? new PaymentsStore()
  const secret = deps.webhookSecret ?? getWebhookSecret()

  let event: Stripe.Event | { type: string; data?: { object?: unknown } }

  if (secret && signature) {
    event = stripe.webhooks.constructEvent(payload, signature, secret)
  } else {
    const raw =
      typeof payload === "string" ? payload : payload.toString("utf8")
    event = JSON.parse(raw) as { type: string; data?: { object?: unknown } }
  }

  const type = String(event.type)

  if (
    type === "v2.core.account[configuration.merchant].capability_status_updated" ||
    type.startsWith("v2.core.account")
  ) {
    const accountId = relatedAccountId(event)
    if (accountId) {
      const seller = await store.getSellerByStripeAccountId(accountId)
      if (seller) {
        await store.updateSeller(seller.id, { onboardingStatus: "complete" })
        return {
          type,
          handled: true,
          sellerId: seller.id,
          detail: "Marked seller onboarding complete",
        }
      }
    }
    return { type, handled: false, detail: "No matching seller for account event" }
  }

  if (type === "checkout.session.completed") {
    const session = (event as Stripe.Event).data.object as Stripe.Checkout.Session
    const sellers = await store.listSellers()
    const seller = sellers.find((s) => s.checkoutSessionId === session.id)
    if (seller) {
      await store.updateSeller(seller.id, {
        lastCheckoutSessionStatus: session.status ?? "complete",
        checkoutUrl: session.url ?? seller.checkoutUrl,
      })
      return {
        type,
        handled: true,
        sellerId: seller.id,
        detail: "Recorded checkout.session.completed",
      }
    }
    return { type, handled: false, detail: "No seller matched checkout session" }
  }

  if (
    type === "payment_intent.succeeded" ||
    type === "payment_intent.payment_failed"
  ) {
    const paymentIntent = (event as Stripe.Event).data
      .object as Stripe.PaymentIntent

    let paymentId: string | undefined
    const payment = await store.getPaymentByPaymentIntentId(paymentIntent.id)
    if (payment) {
      await store.updatePayment(payment.id, {
        status: paymentIntent.status,
      })
      paymentId = payment.id
    }

    let sellerId: string | undefined
    const sellers = await store.listSellers()
    const seller = sellers.find((s) => s.paymentIntentId === paymentIntent.id)
    if (seller) {
      await store.updateSeller(seller.id, {
        paymentIntentStatus: paymentIntent.status,
        lastPaymentIntentStatus: paymentIntent.status,
      })
      sellerId = seller.id
    }

    if (paymentId || sellerId) {
      return {
        type,
        handled: true,
        paymentId,
        sellerId,
        detail: `Recorded ${type}`,
      }
    }

    return {
      type,
      handled: false,
      detail: "No payment or seller matched payment intent",
    }
  }

  if (type === "invoice.payment_succeeded") {
    const invoice = (event as Stripe.Event).data.object as Stripe.Invoice & {
      subscription?: string | { id?: string } | null
    }
    const parentSub = invoice.parent?.subscription_details?.subscription
    const legacySub = invoice.subscription
    const subscriptionId =
      (typeof parentSub === "string"
        ? parentSub
        : parentSub && typeof parentSub === "object" && "id" in parentSub
          ? String(parentSub.id)
          : undefined) ||
      (typeof legacySub === "string"
        ? legacySub
        : legacySub && typeof legacySub === "object" && "id" in legacySub
          ? String(legacySub.id)
          : undefined)
    const customerAccount = invoice.customer_account ?? undefined

    let seller =
      (subscriptionId &&
        (await store.listSellers()).find(
          (s) => s.subscriptionId === subscriptionId,
        )) ||
      null

    if (!seller && customerAccount) {
      seller = await store.getSellerByStripeAccountId(customerAccount)
    }

    if (seller) {
      await store.updateSeller(seller.id, {
        subscriptionStatus: "active",
        subscriptionId: subscriptionId ?? seller.subscriptionId,
      })
      return {
        type,
        handled: true,
        sellerId: seller.id,
        detail: "Recorded invoice.payment_succeeded",
      }
    }
    return { type, handled: false, detail: "No seller matched invoice" }
  }

  return { type, handled: false, detail: "Event type ignored" }
}
