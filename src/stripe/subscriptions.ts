import type Stripe from "stripe"
import { getCurrency, getStripe } from "./client.js"
import {
  findSellerById,
  getLatestPlan,
  newId,
  upsertPlan,
  upsertSubscription,
} from "./store.js"
import type { SellerSubscription, SubscriptionPlan } from "./types.js"

export interface CreateSubscriptionProductInput {
  name?: string
  currency?: string
  unitAmount?: number
  interval?: "month" | "year" | "week" | "day"
}

/**
 * Create a platform subscription product with a recurring default price.
 */
export async function createSubscriptionProduct(
  input: CreateSubscriptionProductInput = {},
): Promise<{ plan: SubscriptionPlan; product: Stripe.Product }> {
  const stripe = getStripe()
  const name = input.name ?? "Platform subscription"
  const currency = (input.currency ?? getCurrency()).toLowerCase()
  const unitAmount = input.unitAmount ?? 1000
  const interval = input.interval ?? "month"

  const product = await stripe.products.create({
    name,
    default_price_data: {
      currency,
      unit_amount: unitAmount,
      recurring: {
        interval,
      },
    },
  })

  const defaultPrice =
    typeof product.default_price === "string"
      ? product.default_price
      : product.default_price?.id

  if (!defaultPrice) {
    throw new Error("Product was created without a default_price")
  }

  const plan: SubscriptionPlan = {
    id: newId("plan"),
    name,
    stripeProductId: product.id,
    stripePriceId: defaultPrice,
    currency,
    unitAmount,
    interval,
    createdAt: new Date().toISOString(),
  }
  await upsertPlan(plan)

  return { plan, product }
}

export interface AttachBalancePaymentMethodInput {
  sellerId?: string
  stripeAccountId?: string
}

/**
 * Attach the connected account's Stripe balance as an off-session payment method
 * so the platform can charge subscription fees from that balance.
 */
export async function attachBalancePaymentMethod(
  input: AttachBalancePaymentMethodInput = {},
): Promise<{
  setupIntent: Stripe.SetupIntent
  paymentMethodId: string
  stripeAccountId: string
}> {
  const stripe = getStripe()
  let stripeAccountId = input.stripeAccountId

  if (!stripeAccountId && input.sellerId) {
    const seller = await findSellerById(input.sellerId)
    if (!seller) throw new Error(`Seller not found: ${input.sellerId}`)
    stripeAccountId = seller.stripeAccountId
  }

  if (!stripeAccountId) {
    throw new Error(
      "Provide sellerId or stripeAccountId (create an account first).",
    )
  }

  const setupIntent = await stripe.setupIntents.create({
    payment_method_types: ["stripe_balance"],
    confirm: true,
    customer_account: stripeAccountId,
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
    throw new Error("SetupIntent did not return a payment_method")
  }

  return { setupIntent, paymentMethodId, stripeAccountId }
}

export interface CreateSellerSubscriptionInput {
  sellerId?: string
  stripeAccountId?: string
  paymentMethodId?: string
  priceId?: string
  planId?: string
}

/**
 * Charge a platform subscription against the connected account using stripe_balance.
 */
export async function createSellerSubscription(
  input: CreateSellerSubscriptionInput = {},
): Promise<{
  subscription: SellerSubscription
  stripeSubscription: Stripe.Subscription
}> {
  const stripe = getStripe()
  let stripeAccountId = input.stripeAccountId
  let sellerId = input.sellerId

  if (!stripeAccountId && sellerId) {
    const seller = await findSellerById(sellerId)
    if (!seller) throw new Error(`Seller not found: ${sellerId}`)
    stripeAccountId = seller.stripeAccountId
  }

  if (!stripeAccountId) {
    throw new Error(
      "Provide sellerId or stripeAccountId (create an account first).",
    )
  }

  if (!sellerId) sellerId = stripeAccountId

  let paymentMethodId = input.paymentMethodId
  if (!paymentMethodId) {
    const attached = await attachBalancePaymentMethod({ stripeAccountId })
    paymentMethodId = attached.paymentMethodId
  }

  let priceId = input.priceId
  let planId = input.planId
  if (!priceId) {
    const plan = await getLatestPlan()
    if (!plan) {
      const created = await createSubscriptionProduct()
      priceId = created.plan.stripePriceId
      planId = created.plan.id
    } else {
      priceId = plan.stripePriceId
      planId = plan.id
    }
  }

  const stripeSubscription = await stripe.subscriptions.create({
    customer_account: stripeAccountId,
    default_payment_method: paymentMethodId,
    items: [{ price: priceId, quantity: 1 }],
    payment_settings: {
      payment_method_types: ["stripe_balance"],
    },
  } as unknown as Stripe.SubscriptionCreateParams)

  const now = new Date().toISOString()
  const subscription: SellerSubscription = {
    id: newId("sub"),
    sellerId,
    planId: planId ?? "unknown",
    stripeSubscriptionId: stripeSubscription.id,
    stripePaymentMethodId: paymentMethodId,
    status: stripeSubscription.status,
    createdAt: now,
    updatedAt: now,
  }
  await upsertSubscription(subscription)

  return { subscription, stripeSubscription }
}
