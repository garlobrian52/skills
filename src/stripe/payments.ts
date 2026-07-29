import type Stripe from "stripe"
import { getStripeClient } from "./client.js"
import { optionalEnv } from "./env.js"
import {
  requireAccount,
  upsertAccount,
  type ConnectedAccountRecord,
} from "./store.js"

/** Default PaymentIntent amount (minor units) — $20.00 when currency is usd. */
export const DEFAULT_PAYMENT_INTENT_AMOUNT = 2000
/** Default application fee (minor units) taken on connected-account charges. */
export const DEFAULT_APPLICATION_FEE_AMOUNT = 123

export interface CreatePaymentIntentInput {
  /** Amount in minor units (default 2000). Must be a positive integer. */
  amount?: number
  currency?: string
  /**
   * Optional local seller id. When set, the PaymentIntent is created as a
   * direct charge on the connected account with an application fee.
   */
  sellerId?: string
  applicationFeeAmount?: number
  storePath?: string
}

export interface CreatePaymentIntentResult {
  paymentIntent: Stripe.PaymentIntent
  /** Only present for direct charges (when a seller is provided). */
  record?: ConnectedAccountRecord
  /**
   * Returned to the caller/frontend for confirming the payment. It is
   * intentionally never persisted to the local store (Stripe requires the
   * client_secret not be logged or stored).
   */
  clientSecret: string | null
}

/**
 * Create a PaymentIntent with automatic payment methods for the embedded
 * PaymentElement flow.
 *
 * Keys come from STRIPE_SECRET_KEY (Stripe Dashboard → Developers → API keys).
 * Never hard-code secret keys — https://docs.stripe.com/keys-best-practices.
 *
 * When `sellerId` is provided, the PaymentIntent is created as a direct charge
 * on the connected account with an application fee to the platform.
 */
export async function createPaymentIntent(
  input: CreatePaymentIntentInput = {},
  stripe: Stripe = getStripeClient(),
): Promise<CreatePaymentIntentResult> {
  const amount = input.amount ?? DEFAULT_PAYMENT_INTENT_AMOUNT
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error(
      `amount must be a positive integer (minor units), got: ${amount}`,
    )
  }

  const currency = (
    input.currency ?? optionalEnv("CURRENCY", "usd")
  ).toLowerCase()

  const params: Stripe.PaymentIntentCreateParams = {
    amount,
    currency,
    automatic_payment_methods: { enabled: true },
  }

  let record: ConnectedAccountRecord | undefined
  let requestOptions: Stripe.RequestOptions | undefined

  if (input.sellerId) {
    record = await requireAccount(input.sellerId, input.storePath)
    if (!record.accountId) {
      throw new Error(
        `Seller "${input.sellerId}" has no Stripe account id. Run create-account first.`,
      )
    }
    const applicationFeeAmount =
      input.applicationFeeAmount ?? DEFAULT_APPLICATION_FEE_AMOUNT
    if (
      !Number.isInteger(applicationFeeAmount) ||
      applicationFeeAmount < 0 ||
      applicationFeeAmount >= amount
    ) {
      throw new Error(
        `application fee (${applicationFeeAmount}) must be a non-negative integer less than the charge amount (${amount})`,
      )
    }
    params.application_fee_amount = applicationFeeAmount
    requestOptions = { stripeAccount: record.accountId }
  }

  const paymentIntent = await stripe.paymentIntents.create(
    params,
    requestOptions,
  )

  if (record) {
    record.paymentIntentId = paymentIntent.id
    record.paymentIntentStatus = paymentIntent.status
    // Note: paymentIntent.client_secret is deliberately NOT persisted.
    record = await upsertAccount(record, input.storePath)
  }

  return {
    paymentIntent,
    record,
    clientSecret: paymentIntent.client_secret,
  }
}
