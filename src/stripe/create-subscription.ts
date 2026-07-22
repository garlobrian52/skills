import type Stripe from "stripe"
import type { StripeConfig } from "./config.js"
import { getStripeClient } from "./client.js"
import type { StripeStore } from "./store.js"

export interface CreateSubscriptionInput {
  accountId?: string
  defaultPaymentMethodId?: string
  priceId?: string
}

export interface CreateSubscriptionResult {
  subscription: Stripe.Subscription
}

export async function createSubscription(
  config: StripeConfig,
  store: StripeStore,
  input: CreateSubscriptionInput = {},
): Promise<CreateSubscriptionResult> {
  const stripe = getStripeClient(config)
  const accountId =
    input.accountId ?? (await store.require("accountId", "Connected account ID"))
  const defaultPaymentMethodId =
    input.defaultPaymentMethodId ??
    (await store.require("defaultPaymentMethodId", "Default payment method ID"))
  const priceId =
    input.priceId ?? (await store.require("defaultPriceId", "Default price ID"))

  const subscription = await stripe.subscriptions.create({
    customer_account: accountId,
    default_payment_method: defaultPaymentMethodId,
    items: [{ price: priceId, quantity: 1 }],
    payment_settings: {
      payment_method_types: ["stripe_balance"],
    },
  } as unknown as Stripe.SubscriptionCreateParams)

  await store.update({ subscriptionId: subscription.id })
  return { subscription }
}
