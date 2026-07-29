import type Stripe from "stripe"
import { getStripeClient } from "./client.js"
import { optionalEnv } from "./env.js"
import {
  createEmptyRecord,
  getAccount,
  upsertAccount,
  type ConnectedAccountRecord,
} from "./store.js"

export interface CreateProductInput {
  sellerId: string
  name?: string
  unitAmount?: number
  currency?: string
  storePath?: string
}

/**
 * Create a platform product with a one-time default price for Checkout.
 */
export async function createProduct(
  input: CreateProductInput,
  stripe: Stripe = getStripeClient(),
): Promise<{
  product: Stripe.Product
  priceId: string
  record: ConnectedAccountRecord
}> {
  let record = await getAccount(input.sellerId, input.storePath)
  if (!record) {
    record = createEmptyRecord(input.sellerId, input.sellerId, "")
    await upsertAccount(record, input.storePath)
  }

  const currency = (
    input.currency ?? optionalEnv("CURRENCY", "usd")
  ).toLowerCase()
  const name = input.name ?? "Example Product"
  const unitAmount = input.unitAmount ?? 2000

  const product = await stripe.products.create(
    {
      name,
      default_price_data: {
        currency,
        unit_amount: unitAmount,
      },
    },
    {
      idempotencyKey: `product:${input.sellerId}:${name}:${unitAmount}:${currency}`,
    },
  )

  const priceId =
    typeof product.default_price === "string"
      ? product.default_price
      : product.default_price?.id
  if (!priceId) {
    throw new Error("Product was created without a default_price id")
  }

  record.checkoutProductId = product.id
  record.checkoutPriceId = priceId
  const saved = await upsertAccount(record, input.storePath)
  return { product, priceId, record: saved }
}
