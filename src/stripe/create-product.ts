import type Stripe from "stripe"
import type { StripeConfig } from "./config.js"
import { getStripeClient } from "./client.js"
import type { StripeStore } from "./store.js"

export interface CreateProductInput {
  name?: string
  unitAmount?: number
  interval?: Stripe.PriceCreateParams.Recurring.Interval
}

export interface CreateProductResult {
  product: Stripe.Product
}

export async function createProduct(
  config: StripeConfig,
  store: StripeStore,
  input: CreateProductInput = {},
): Promise<CreateProductResult> {
  const stripe = getStripeClient(config)

  const product = await stripe.products.create({
    name: input.name ?? "Platform subscription",
    default_price_data: {
      currency: config.currency,
      recurring: {
        interval: input.interval ?? "month",
      },
      unit_amount: input.unitAmount ?? 1000,
    },
  })

  const defaultPriceId =
    typeof product.default_price === "string"
      ? product.default_price
      : product.default_price?.id

  if (!defaultPriceId) {
    throw new Error("Stripe did not return a default price for the product.")
  }

  await store.update({
    productId: product.id,
    defaultPriceId,
  })

  return { product }
}
