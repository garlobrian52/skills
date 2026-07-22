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
  paymentIntent: Stripe.PaymentIntent
  /** Present when the PaymentIntent was created on a connected account. */
  seller?: SellerRecord
  clientSecret: string | null
}

/**
 * Create a PaymentIntent with automatic payment methods.
 *
 * Keys come from STRIPE_SECRET_KEY (see Stripe Dashboard → API keys).
 * Never hard-code secret keys — https://docs.stripe.com/keys-best-practices
 *
 * When `sellerId` is provided, the PaymentIntent is created as a direct charge
 * on the connected account with an application fee to the platform.
 */
export async function createPaymentIntent(
  input: CreatePaymentIntentInput = {},
  deps: {
    stripe?: Stripe
    store?: PaymentsStore
  } = {},
): Promise<CreatePaymentIntentResult> {
  const stripe = deps.stripe ?? getStripeClient()
  const store = deps.store ?? new PaymentsStore()

  const amount = input.amount ?? DEFAULT_PAYMENT_INTENT_AMOUNT
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(`amount must be a positive integer (minor units), got: ${amount}`)
  }

  const currency = (input.currency?.trim() || getCurrency()).toLowerCase()
  const params: Stripe.PaymentIntentCreateParams = {
    amount: Math.trunc(amount),
    currency,
    automatic_payment_methods: {
      enabled: true,
    },
  }

  let seller: SellerRecord | undefined
  let requestOptions: Stripe.RequestOptions | undefined

  if (input.sellerId) {
    const found = await store.getSeller(input.sellerId)
    if (!found) {
      throw new Error(`Seller not found: ${input.sellerId}`)
    }
    seller = found
    params.application_fee_amount =
      input.applicationFeeAmount ?? DEFAULT_APPLICATION_FEE_AMOUNT
    requestOptions = { stripeAccount: seller.stripeAccountId }
  }

  const paymentIntent = await stripe.paymentIntents.create(params, requestOptions)

  if (seller) {
    seller = await store.updateSeller(seller.id, {
      paymentIntentId: paymentIntent.id,
      paymentIntentStatus: paymentIntent.status,
      paymentIntentClientSecret: paymentIntent.client_secret ?? undefined,
    })
  }

  return {
    paymentIntent,
    seller,
    clientSecret: paymentIntent.client_secret,
  }
}
