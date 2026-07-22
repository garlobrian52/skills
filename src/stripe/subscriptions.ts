import type Stripe from "stripe"
import { getStripeClient } from "./client.js"
import { optionalEnv } from "./env.js"
import { requireAccount, upsertAccount, type ConnectedAccountRecord } from "./store.js"

export interface CreateSubscriptionPlanInput {
  sellerId?: string
  name?: string
  unitAmount?: number
  currency?: string
  interval?: Stripe.PriceCreateParams.Recurring.Interval
  storePath?: string
}

/**
 * Create a platform subscription product with a default recurring price.
 * When sellerId is provided, the product/price ids are stored on that record.
 */
export async function createSubscriptionPlan(
  input: CreateSubscriptionPlanInput = {},
  stripe: Stripe = getStripeClient(),
): Promise<{
  product: Stripe.Product
  priceId: string
  record: ConnectedAccountRecord | null
}> {
  const currency = (
    input.currency ?? optionalEnv("CURRENCY", "usd")
  ).toLowerCase()
  const name = input.name ?? "Platform subscription"
  const unitAmount = input.unitAmount ?? 1000
  const interval = input.interval ?? "month"

  const product = await stripe.products.create({
    name,
    default_price_data: {
      currency,
      unit_amount: unitAmount,
      recurring: { interval },
    },
  })

  const priceId =
    typeof product.default_price === "string"
      ? product.default_price
      : product.default_price?.id
  if (!priceId) {
    throw new Error("Product was created without a default_price id")
  }

  let record: ConnectedAccountRecord | null = null
  if (input.sellerId) {
    record = await requireAccount(input.sellerId, input.storePath)
    record.productId = product.id
    record.priceId = priceId
    record = await upsertAccount(record, input.storePath)
  }

  return { product, priceId, record }
}

export interface AttachBalancePaymentMethodInput {
  sellerId: string
  storePath?: string
}

/**
 * Attach a stripe_balance payment method to the connected account via
 * SetupIntent so subscription fees can be collected from the account balance.
 */
export async function attachBalancePaymentMethod(
  input: AttachBalancePaymentMethodInput,
  stripe: Stripe = getStripeClient(),
): Promise<{
  setupIntent: Stripe.SetupIntent
  paymentMethodId: string
  record: ConnectedAccountRecord
}> {
  const record = await requireAccount(input.sellerId, input.storePath)
  if (!record.accountId) {
    throw new Error(
      `Seller "${input.sellerId}" has no Stripe account id. Run create-account first.`,
    )
  }

  // stripe_balance is used by Accounts v2 billing-from-balance flows; cast
  // where public SDK typings lag the blueprint API.
  const setupIntent = await stripe.setupIntents.create({
    payment_method_types: ["stripe_balance"],
    confirm: true,
    customer_account: record.accountId,
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
    throw new Error("SetupIntent completed without a payment_method id")
  }

  record.paymentMethodId = paymentMethodId
  const saved = await upsertAccount(record, input.storePath)
  return { setupIntent, paymentMethodId, record: saved }
}

export interface CreatePlatformSubscriptionInput {
  sellerId: string
  priceId?: string
  paymentMethodId?: string
  storePath?: string
}

/**
 * Charge the connected account a platform subscription using stripe_balance.
 */
export async function createPlatformSubscription(
  input: CreatePlatformSubscriptionInput,
  stripe: Stripe = getStripeClient(),
): Promise<{
  subscription: Stripe.Subscription
  record: ConnectedAccountRecord
}> {
  const record = await requireAccount(input.sellerId, input.storePath)
  if (!record.accountId) {
    throw new Error(
      `Seller "${input.sellerId}" has no Stripe account id. Run create-account first.`,
    )
  }

  const priceId = input.priceId ?? record.priceId
  if (!priceId) {
    throw new Error(
      `Seller "${input.sellerId}" has no price id. Run create-subscription-plan first.`,
    )
  }

  const paymentMethodId = input.paymentMethodId ?? record.paymentMethodId
  if (!paymentMethodId) {
    throw new Error(
      `Seller "${input.sellerId}" has no payment method. Run attach-balance-payment-method first.`,
    )
  }

  const subscription = await stripe.subscriptions.create({
    customer_account: record.accountId,
    default_payment_method: paymentMethodId,
    items: [{ price: priceId, quantity: 1 }],
    payment_settings: {
      payment_method_types: ["stripe_balance"],
    },
  } as unknown as Stripe.SubscriptionCreateParams)

  record.subscriptionId = subscription.id
  record.subscriptionPaid = false
  const saved = await upsertAccount(record, input.storePath)
  return { subscription, record: saved }
}
