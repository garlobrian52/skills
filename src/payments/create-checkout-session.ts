import type Stripe from "stripe"
import { getStripeClient } from "./client.js"
import {
  DEFAULT_APPLICATION_FEE_AMOUNT,
  DEFAULT_CHECKOUT_UNIT_AMOUNT,
  getCurrency,
  getSuccessUrl,
} from "./config.js"
import { PaymentsStore } from "./store.js"
import type { CreateCheckoutSessionInput, SellerRecord } from "./types.js"

export interface CreateCheckoutSessionResult {
  seller: SellerRecord
  session: Stripe.Checkout.Session
}

/**
 * Create a Checkout Session on the connected account (direct charge)
 * with an application fee to the platform.
 */
export async function createCheckoutSession(
  input: CreateCheckoutSessionInput,
  deps: {
    stripe?: Stripe
    store?: PaymentsStore
  } = {},
): Promise<CreateCheckoutSessionResult> {
  const stripe = deps.stripe ?? getStripeClient()
  const store = deps.store ?? new PaymentsStore()

  const seller = await store.getSeller(input.sellerId)
  if (!seller) {
    throw new Error(`Seller not found: ${input.sellerId}`)
  }

  const currency = (input.currency?.trim() || getCurrency()).toLowerCase()
  const successUrl = input.successUrl?.trim() || getSuccessUrl()
  const unitAmount = input.unitAmount ?? DEFAULT_CHECKOUT_UNIT_AMOUNT
  const quantity = input.quantity ?? 1
  const applicationFeeAmount =
    input.applicationFeeAmount ?? DEFAULT_APPLICATION_FEE_AMOUNT
  const productName = input.productName?.trim() || "Cookie"

  const session = await stripe.checkout.sessions.create(
    {
      mode: "payment",
      success_url: successUrl,
      payment_method_types: ["card"],
      line_items: [
        {
          quantity,
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
      stripeAccount: seller.stripeAccountId,
    },
  )

  const updated = await store.updateSeller(seller.id, {
    checkoutSessionId: session.id,
    checkoutUrl: session.url ?? undefined,
    lastCheckoutSessionStatus: session.status ?? undefined,
  })

  return { seller: updated, session }
}
