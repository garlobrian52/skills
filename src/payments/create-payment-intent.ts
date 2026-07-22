import type Stripe from "stripe"
import { getStripeClient } from "./client.js"
import { DEFAULT_PAYMENT_INTENT_AMOUNT, getCurrency } from "./config.js"
import { PaymentsStore } from "./store.js"
import type { CreatePaymentIntentInput, PaymentRecord } from "./types.js"

export interface CreatePaymentIntentResult {
  payment: PaymentRecord
  paymentIntent: Stripe.PaymentIntent
}

/**
 * Create a platform PaymentIntent with automatic payment methods enabled.
 * Returns client_secret for initializing PaymentElement on the client.
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

  const currency = (input.currency?.trim() || getCurrency()).toLowerCase()
  const amount = input.amount ?? DEFAULT_PAYMENT_INTENT_AMOUNT

  const paymentIntent = await stripe.paymentIntents.create({
    amount,
    currency,
    automatic_payment_methods: {
      enabled: true,
    },
  })

  const payment = await store.createPayment({
    paymentIntentId: paymentIntent.id,
    amount,
    currency,
    status: paymentIntent.status,
  })

  return { payment, paymentIntent }
}
