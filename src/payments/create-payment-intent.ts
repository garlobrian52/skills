import type Stripe from "stripe"
import { getStripeClient } from "./client.js"
import {
  DEFAULT_APPLICATION_FEE_AMOUNT,
  DEFAULT_PAYMENT_INTENT_AMOUNT,
  getCurrency,
} from "./config.js"
import { PaymentsStore } from "./store.js"
import type { CreatePaymentIntentInput, SellerRecord } from "./types.js"

export interface CreatePaymentIntentResult {
  seller: SellerRecord
  paymentIntent: Stripe.PaymentIntent
}

/**
 * Create a PaymentIntent on the connected account (direct charge) so the
 * frontend can confirm with Elements using `client_secret`.
 *
 * Uses the platform secret from `STRIPE_SECRET_KEY` (never hard-code keys)
 * and the Stripe-Account header for the seller's Accounts v2 merchant ID.
 */
export async function createPaymentIntent(
  input: CreatePaymentIntentInput,
  deps: {
    stripe?: Stripe
    store?: PaymentsStore
  } = {},
): Promise<CreatePaymentIntentResult> {
  const stripe = deps.stripe ?? getStripeClient()
  const store = deps.store ?? new PaymentsStore()

  const seller = await store.getSeller(input.sellerId)
  if (!seller) {
    throw new Error(`Seller not found: ${input.sellerId}`)
  }

  const currency = (input.currency?.trim() || getCurrency()).toLowerCase()
  const amount = input.amount ?? DEFAULT_PAYMENT_INTENT_AMOUNT
  const applicationFeeAmount =
    input.applicationFeeAmount ?? DEFAULT_APPLICATION_FEE_AMOUNT

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(`amount must be a positive integer (minor units), got: ${amount}`)
  }
  if (
    !Number.isFinite(applicationFeeAmount) ||
    applicationFeeAmount < 0 ||
    applicationFeeAmount > amount
  ) {
    throw new Error(
      `applicationFeeAmount must be between 0 and amount (${amount}), got: ${applicationFeeAmount}`,
    )
  }

  const paymentIntent = await stripe.paymentIntents.create(
    {
      amount,
      currency,
      automatic_payment_methods: {
        enabled: true,
      },
      application_fee_amount: applicationFeeAmount,
    },
    {
      stripeAccount: seller.stripeAccountId,
    },
  )

  const updated = await store.updateSeller(seller.id, {
    paymentIntentId: paymentIntent.id,
    paymentIntentClientSecret: paymentIntent.client_secret ?? undefined,
    lastPaymentIntentStatus: paymentIntent.status,
  })

  return { seller: updated, paymentIntent }
}
