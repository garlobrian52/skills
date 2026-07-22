import type Stripe from "stripe"
import { getStripeClient } from "./client.js"
import { loadStripeConfig } from "./config.js"
import {
  loadStripeState,
  requireAccountId,
  requireDefaultPaymentMethodId,
  requireDefaultPriceId,
  updateStripeState,
  type StripeState,
} from "./store.js"

export interface CreateProductResult {
  productId: string
  defaultPriceId: string
  state: StripeState
}

export async function createProduct(
  statePath?: string,
): Promise<CreateProductResult> {
  const stripe = getStripeClient()
  const config = loadStripeConfig()

  const product = await stripe.products.create({
    name: "Platform subscription",
    default_price_data: {
      currency: config.currency,
      recurring: {
        interval: "month",
      },
      unit_amount: 1_000,
    },
  })

  const defaultPriceId =
    typeof product.default_price === "string"
      ? product.default_price
      : product.default_price?.id

  if (!defaultPriceId) {
    throw new Error("Product was created without a default price.")
  }

  const state = await updateStripeState(
    {
      productId: product.id,
      defaultPriceId,
    },
    statePath,
  )

  return {
    productId: product.id,
    defaultPriceId,
    state,
  }
}

export interface CreateSetupIntentResult {
  setupIntentId: string
  paymentMethodId: string
  state: StripeState
}

export async function createSetupIntent(
  statePath?: string,
): Promise<CreateSetupIntentResult> {
  const stripe = getStripeClient()
  const state = await loadStripeState(statePath)
  const accountId = requireAccountId(state)

  const setupIntent = await stripe.setupIntents.create({
    payment_method_types: ["stripe_balance"],
    confirm: true,
    customer_account: accountId,
    usage: "off_session",
    payment_method_data: {
      type: "stripe_balance",
    },
  } as unknown as Stripe.SetupIntentCreateParams)

  const paymentMethodId =
    typeof setupIntent.payment_method === "string"
      ? setupIntent.payment_method
      : setupIntent.payment_method?.id

  if (!paymentMethodId) {
    throw new Error("SetupIntent did not return a payment method.")
  }

  const nextState = await updateStripeState(
    {
      setupIntentId: setupIntent.id,
      defaultPaymentMethodId: paymentMethodId,
    },
    statePath,
  )

  return {
    setupIntentId: setupIntent.id,
    paymentMethodId,
    state: nextState,
  }
}

export interface CreateSubscriptionResult {
  subscriptionId: string
  state: StripeState
}

export async function createSubscription(
  statePath?: string,
): Promise<CreateSubscriptionResult> {
  const stripe = getStripeClient()
  const state = await loadStripeState(statePath)
  const accountId = requireAccountId(state)
  const defaultPriceId = requireDefaultPriceId(state)
  const defaultPaymentMethodId = requireDefaultPaymentMethodId(state)

  const subscription = await stripe.subscriptions.create({
    customer_account: accountId,
    default_payment_method: defaultPaymentMethodId,
    items: [{ price: defaultPriceId, quantity: 1 }],
    payment_settings: {
      payment_method_types: ["stripe_balance"],
    },
  } as unknown as Stripe.SubscriptionCreateParams)

  const nextState = await updateStripeState(
    { subscriptionId: subscription.id },
    statePath,
  )

  return {
    subscriptionId: subscription.id,
    state: nextState,
  }
}

export async function waitForSubscriptionPaid(
  statePath?: string,
  timeoutMs = 300_000,
): Promise<StripeState> {
  const state = await loadStripeState(statePath)
  if (state.subscriptionPaid) {
    return state
  }

  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    const current = await loadStripeState(statePath)
    if (current.subscriptionPaid) {
      return current
    }
    await sleep(2_000)
  }

  throw new Error(
    "Timed out waiting for invoice.payment_succeeded. Forward webhooks to the webhook server.",
  )
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
