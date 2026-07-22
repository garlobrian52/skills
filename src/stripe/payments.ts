import type Stripe from "stripe"
import { getCurrency, getBaseUrl, getStripe } from "./client.js"
import {
  findSellerById,
  newId,
  upsertCheckout,
} from "./store.js"
import type { CheckoutPayment } from "./types.js"

export interface CreateCheckoutSessionInput {
  sellerId?: string
  stripeAccountId?: string
  /** Product display name on the Checkout line item. */
  productName?: string
  /** Amount in the smallest currency unit (e.g. cents). Default 100000. */
  unitAmount?: number
  /** Platform application fee in smallest currency unit. Default 123. */
  applicationFeeAmount?: number
  successUrl?: string
  currency?: string
}

/**
 * Create a Checkout Session on the connected account (direct charge)
 * with an application fee transferred to the platform.
 */
export async function createCheckoutSession(
  input: CreateCheckoutSessionInput = {},
): Promise<{
  checkout: CheckoutPayment
  session: Stripe.Checkout.Session
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

  if (!sellerId) {
    sellerId = stripeAccountId
  }

  const currency = (input.currency ?? getCurrency()).toLowerCase()
  const unitAmount = input.unitAmount ?? 100_000
  const applicationFeeAmount = input.applicationFeeAmount ?? 123
  const productName = input.productName ?? "Cookie"
  const successUrl =
    input.successUrl ??
    `${getBaseUrl()}/checkout/success?session_id={CHECKOUT_SESSION_ID}`

  const session = await stripe.checkout.sessions.create(
    {
      success_url: successUrl,
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency,
            unit_amount: unitAmount,
            product_data: {
              name: productName,
            },
          },
        },
      ],
      payment_intent_data: {
        application_fee_amount: applicationFeeAmount,
      },
    },
    {
      stripeAccount: stripeAccountId,
    },
  )

  const now = new Date().toISOString()
  const checkout: CheckoutPayment = {
    id: newId("checkout"),
    sellerId,
    stripeCheckoutSessionId: session.id,
    url: session.url,
    status: session.status ?? "open",
    applicationFeeAmount,
    createdAt: now,
    updatedAt: now,
  }
  await upsertCheckout(checkout)

  return { checkout, session }
}
