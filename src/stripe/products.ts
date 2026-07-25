import type Stripe from "stripe"
import { getStripeClient } from "./client.js"
import { optionalEnv } from "./env.js"
import {
  getCatalog,
  setCatalog,
  type PlatformCatalog,
} from "./store.js"

export interface CreateProductInput {
  name?: string
  unitAmount?: number
  currency?: string
  /** When true, reuse an existing catalog product/price if present. */
  reuseExisting?: boolean
  storePath?: string
}

/**
 * Create a product with a one-time default price for Checkout payments.
 * Persists productId / priceId in the platform catalog for later steps.
 */
export async function createProduct(
  input: CreateProductInput = {},
  stripe: Stripe = getStripeClient(),
): Promise<{
  product: Stripe.Product
  priceId: string
  catalog: PlatformCatalog
}> {
  const reuseExisting = input.reuseExisting !== false
  if (reuseExisting) {
    const existing = await getCatalog(input.storePath)
    if (existing.productId && existing.priceId) {
      const product = await stripe.products.retrieve(existing.productId)
      return {
        product,
        priceId: existing.priceId,
        catalog: existing,
      }
    }
  }

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

  const catalog = await setCatalog(
    {
      productId: product.id,
      priceId,
      productName: name,
    },
    input.storePath,
  )

  return { product, priceId, catalog }
}
