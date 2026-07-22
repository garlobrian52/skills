import type Stripe from "stripe"
import type { CreateProductInput, ConnectedMerchant } from "./types.js"
import {
  defaultStorePath,
  findMerchantById,
  loadStore,
  upsertMerchant,
} from "./store.js"

export interface CreateProductResult {
  product: Stripe.Product
  priceId: string
  merchant: ConnectedMerchant | null
}

/**
 * Create a platform subscription product with a recurring default price.
 */
export async function createProduct(
  stripe: Stripe,
  input: CreateProductInput = {},
  storePath: string = defaultStorePath(),
): Promise<CreateProductResult> {
  const currency =
    (input.currency ?? process.env.CURRENCY ?? "usd").toLowerCase()
  const unitAmount = input.unitAmount ?? 1000
  const interval = input.interval ?? "month"
  const name = input.name ?? "Platform subscription"

  const product = await stripe.products.create({
    name,
    default_price_data: {
      currency,
      recurring: { interval },
      unit_amount: unitAmount,
    },
  })

  const priceId =
    typeof product.default_price === "string"
      ? product.default_price
      : product.default_price?.id

  if (!priceId) {
    throw new Error("Product was created without a default_price.")
  }

  let merchant: ConnectedMerchant | null = null
  if (input.merchantId) {
    merchant = await findMerchantById(input.merchantId, storePath)
  } else {
    const store = await loadStore(storePath)
    if (store.merchants.length === 1) merchant = store.merchants[0]
  }

  if (merchant) {
    merchant = await upsertMerchant(
      {
        ...merchant,
        stripeProductId: product.id,
        stripePriceId: priceId,
      },
      storePath,
    )
  }

  return { product, priceId, merchant }
}
