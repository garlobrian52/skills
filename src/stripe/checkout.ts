import type Stripe from "stripe"
import { getStripeClient } from "./client.js"
import { optionalEnv } from "./env.js"
import {
  createEmptyRecord,
  getAccount,
  requireAccount,
  upsertAccount,
  type ConnectedAccountRecord,
} from "./store.js"

export interface CreateProductInput {
  /** Optional local seller id to persist product/price ids against. */
  sellerId?: string
  name?: string
  unitAmount?: number
  currency?: string
  storePath?: string
}

/**
 * Create a product with a one-time default price (Checkout payment mode).
 * Returns and optionally persists `default_price` for later Checkout Sessions.
 */
export async function createProduct(
  input: CreateProductInput = {},
  stripe: Stripe = getStripeClient(),
): Promise<{
  product: Stripe.Product
  priceId: string
  record: ConnectedAccountRecord | null
}> {
  const currency = (
    input.currency ?? optionalEnv("CURRENCY", "usd")
  ).toLowerCase()
  const name = input.name ?? "Example Product"
  const unitAmount = input.unitAmount ?? 2000

  const product = await stripe.products.create({
    name,
    default_price_data: {
      currency,
      unit_amount: unitAmount,
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
    record =
      (await getAccount(input.sellerId, input.storePath)) ??
      createEmptyRecord(input.sellerId, input.sellerId, "")
    record.productId = product.id
    record.priceId = priceId
    record = await upsertAccount(record, input.storePath)
  }

  return { product, priceId, record }
}

export interface CreateCheckoutSessionInput {
  sellerId: string
  /** Price id override (defaults to the seller's stored price from create-product). */
  priceId?: string
  quantity?: number
  successUrl?: string
  cancelUrl?: string
  storePath?: string
}

/**
 * Create a Checkout Session for a one-time payment using a previously created
 * product price (`mode: payment`).
 */
export async function createCheckoutSession(
  input: CreateCheckoutSessionInput,
  stripe: Stripe = getStripeClient(),
): Promise<{ record: ConnectedAccountRecord; session: Stripe.Checkout.Session }> {
  const record = await requireAccount(input.sellerId, input.storePath)

  const priceId = input.priceId ?? record.priceId
  if (!priceId) {
    throw new Error(
      `Seller "${input.sellerId}" has no price id. Run create-product first.`,
    )
  }

  const quantity = input.quantity ?? 1
  const successUrl =
    input.successUrl ??
    optionalEnv(
      "STRIPE_CHECKOUT_SUCCESS_URL",
      "http://localhost:4242/checkout/success",
    )
  const cancelUrl =
    input.cancelUrl ??
    optionalEnv(
      "STRIPE_CHECKOUT_CANCEL_URL",
      "http://localhost:4242/checkout/cancel",
    )

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [
      {
        price: priceId,
        quantity,
      },
    ],
    success_url: successUrl,
    cancel_url: cancelUrl,
  })

  record.checkoutSessionId = session.id
  record.checkoutSessionUrl = session.url
  record.checkoutCompleted = false
  const saved = await upsertAccount(record, input.storePath)
  return { record: saved, session }
}
