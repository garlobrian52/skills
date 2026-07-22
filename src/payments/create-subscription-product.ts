import type Stripe from "stripe"
import { getStripeClient } from "./client.js"
import {
  DEFAULT_SUBSCRIPTION_UNIT_AMOUNT,
  getCurrency,
} from "./config.js"
import { PaymentsStore } from "./store.js"
import type { CreateSubscriptionProductInput, PlatformCatalog } from "./types.js"

export interface CreateSubscriptionProductResult {
  catalog: PlatformCatalog
  product: Stripe.Product
  priceId: string
}

/**
 * Create (or reuse) the platform subscription Product + recurring Price.
 */
export async function createSubscriptionProduct(
  input: CreateSubscriptionProductInput = {},
  deps: {
    stripe?: Stripe
    store?: PaymentsStore
  } = {},
): Promise<CreateSubscriptionProductResult> {
  const stripe = deps.stripe ?? getStripeClient()
  const store = deps.store ?? new PaymentsStore()

  const existing = await store.getCatalog()
  if (existing.productId && existing.priceId) {
    const product = await stripe.products.retrieve(existing.productId)
    return {
      catalog: existing,
      product,
      priceId: existing.priceId,
    }
  }

  const name = input.name?.trim() || "Platform subscription"
  const currency = (input.currency?.trim() || getCurrency()).toLowerCase()
  const unitAmount = input.unitAmount ?? DEFAULT_SUBSCRIPTION_UNIT_AMOUNT
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
    throw new Error(
      `Product ${product.id} was created without a default_price`,
    )
  }

  const catalog = await store.setCatalog({
    productId: product.id,
    priceId,
    productName: name,
  })

  return { catalog, product, priceId }
}
