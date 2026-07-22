import type Stripe from "stripe"
import { getStripeClient } from "./client.js"
import { PaymentsStore } from "./store.js"
import { createSubscriptionProduct } from "./create-subscription-product.js"
import type { CreateSubscriptionInput, SellerRecord } from "./types.js"

export interface CreateSubscriptionResult {
  seller: SellerRecord
  subscription: Stripe.Subscription
}

/**
 * Charge the connected account a platform subscription from its Stripe balance.
 */
export async function createSubscription(
  input: CreateSubscriptionInput,
  deps: {
    stripe?: Stripe
    store?: PaymentsStore
  } = {},
): Promise<CreateSubscriptionResult> {
  const stripe = deps.stripe ?? getStripeClient()
  const store = deps.store ?? new PaymentsStore()

  const seller = await store.getSeller(input.sellerId)
  if (!seller) {
    throw new Error(`Seller not found: ${input.sellerId}`)
  }
  if (!seller.paymentMethodId) {
    throw new Error(
      `Seller ${seller.id} has no paymentMethodId. Run attach-balance-payment-method first.`,
    )
  }

  let priceId = input.priceId?.trim()
  if (!priceId) {
    const catalog = await store.getCatalog()
    priceId = catalog.priceId
  }
  if (!priceId) {
    const created = await createSubscriptionProduct({}, { stripe, store })
    priceId = created.priceId
  }

  const quantity = input.quantity ?? 1

  const subscription = await stripe.subscriptions.create({
    customer_account: seller.stripeAccountId,
    default_payment_method: seller.paymentMethodId,
    items: [{ price: priceId, quantity }],
    payment_settings: {
      payment_method_types: ["stripe_balance"],
    },
  } as unknown as Stripe.SubscriptionCreateParams)

  const updated = await store.updateSeller(seller.id, {
    subscriptionId: subscription.id,
    subscriptionStatus: subscription.status,
    priceId,
    productId: (await store.getCatalog()).productId,
  })

  return { seller: updated, subscription }
}
