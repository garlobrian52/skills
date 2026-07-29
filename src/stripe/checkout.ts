import type Stripe from "stripe"
import { getStripeClient } from "./client.js"
import { optionalEnv } from "./env.js"
import { requireAccount, upsertAccount, type ConnectedAccountRecord } from "./store.js"

const DEFAULT_CHECKOUT_SUCCESS_URL =
  "https://dashboard.stripe.com/workbench/blueprints/one-time-payment/checkout-chapter?confirmation-redirect=create-checkout-session"
const DEFAULT_CHECKOUT_CANCEL_URL = DEFAULT_CHECKOUT_SUCCESS_URL

export interface CreateCheckoutSessionInput {
  sellerId: string
  priceId?: string
  successUrl?: string
  cancelUrl?: string
  storePath?: string
}

export interface CreateDirectChargeCheckoutSessionInput {
  sellerId: string
  successUrl?: string
  productName?: string
  unitAmount?: number
  applicationFeeAmount?: number
  currency?: string
  storePath?: string
}

/**
 * Create a Checkout Session on the platform account for a one-time payment
 * using a pre-created price id.
 */
export async function createCheckoutSession(
  input: CreateCheckoutSessionInput,
  stripe: Stripe = getStripeClient(),
): Promise<{ record: ConnectedAccountRecord; session: Stripe.Checkout.Session }> {
  const record = await requireAccount(input.sellerId, input.storePath)

  const priceId = input.priceId ?? record.checkoutPriceId
  if (!priceId) {
    throw new Error(
      `Seller "${input.sellerId}" has no checkout price id. Run create-product first.`,
    )
  }

  const successUrl =
    input.successUrl ??
    optionalEnv("STRIPE_CHECKOUT_SUCCESS_URL", DEFAULT_CHECKOUT_SUCCESS_URL)
  const cancelUrl =
    input.cancelUrl ??
    optionalEnv("STRIPE_CHECKOUT_CANCEL_URL", DEFAULT_CHECKOUT_CANCEL_URL)

  const session = await stripe.checkout.sessions.create({
    line_items: [{ price: priceId, quantity: 1 }],
    mode: "payment",
    success_url: successUrl,
    cancel_url: cancelUrl,
  })

  record.checkoutSessionId = session.id
  record.checkoutSessionUrl = session.url
  record.checkoutCompleted = false
  const saved = await upsertAccount(record, input.storePath)
  return { record: saved, session }
}

/**
 * Create a Checkout Session on the connected account (direct charge) with an
 * application fee transferred to the platform.
 */
export async function createDirectChargeCheckoutSession(
  input: CreateDirectChargeCheckoutSessionInput,
  stripe: Stripe = getStripeClient(),
): Promise<{ record: ConnectedAccountRecord; session: Stripe.Checkout.Session }> {
  const record = await requireAccount(input.sellerId, input.storePath)
  if (!record.accountId) {
    throw new Error(
      `Seller "${input.sellerId}" has no Stripe account id. Run create-account first.`,
    )
  }

  const currency = (
    input.currency ?? optionalEnv("CURRENCY", "usd")
  ).toLowerCase()
  const successUrl =
    input.successUrl ??
    optionalEnv(
      "STRIPE_CHECKOUT_SUCCESS_URL",
      "http://localhost:4242/checkout/success",
    )
  const productName = input.productName ?? "Cookie"
  const unitAmount = input.unitAmount ?? 100_000
  const applicationFeeAmount = input.applicationFeeAmount ?? 123

  if (!Number.isInteger(unitAmount) || unitAmount <= 0) {
    throw new Error(
      `unit amount must be a positive integer (minor units), got: ${unitAmount}`,
    )
  }
  if (
    !Number.isInteger(applicationFeeAmount) ||
    applicationFeeAmount < 0 ||
    applicationFeeAmount >= unitAmount
  ) {
    throw new Error(
      `application fee (${applicationFeeAmount}) must be a non-negative integer less than the charge amount (${unitAmount})`,
    )
  }

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
      stripeAccount: record.accountId,
    },
  )

  record.checkoutSessionId = session.id
  record.checkoutSessionUrl = session.url
  record.checkoutCompleted = false
  const saved = await upsertAccount(record, input.storePath)
  return { record: saved, session }
}

/** @deprecated Use createDirectChargeCheckoutSession */
export const createEmbeddedCheckoutSession = createDirectChargeCheckoutSession
