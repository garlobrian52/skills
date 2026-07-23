import type Stripe from "stripe"
import { getStripeClient } from "./client.js"
import {
  DEFAULT_APPLICATION_FEE_AMOUNT,
  DEFAULT_PAYMENT_INTENT_AMOUNT,
  getCurrency,
} from "./config.js"
import { PaymentsStore } from "./store.js"
import type {
  CreatePaymentIntentInput,
  PaymentRecord,
  SellerRecord,
} from "./types.js"

export interface CreatePaymentIntentResult {
  seller?: SellerRecord
  payment?: PaymentRecord
  paymentIntent: Stripe.PaymentIntent
}

/**
 * Create a PaymentIntent with automatic payment methods enabled.
 * If sellerId is provided, creates a direct charge on the connected account.
 * Otherwise, creates a platform PaymentIntent.
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

  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error(`amount must be a positive integer (minor units), got: ${amount}`)
  }

  if (input.sellerId) {
    const seller = await store.getSeller(input.sellerId)
    if (!seller) {
      throw new Error(`Seller not found: ${input.sellerId}`)
    }

    const applicationFeeAmount =
      input.applicationFeeAmount ?? DEFAULT_APPLICATION_FEE_AMOUNT

    if (
      !Number.isInteger(applicationFeeAmount) ||
      applicationFeeAmount < 0 ||
      applicationFeeAmount > amount
    ) {
      throw new Error(
        `applicationFeeAmount must be an integer between 0 and amount (${amount}), got: ${applicationFeeAmount}`,
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
      lastPaymentIntentStatus: paymentIntent.status,
    })

    return { seller: updated, paymentIntent }
  }

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
