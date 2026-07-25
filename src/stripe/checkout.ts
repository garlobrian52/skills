import type Stripe from "stripe"
import { getStripeClient } from "./client.js"
import { optionalEnv } from "./env.js"
import {
  getCatalog,
  requireAccount,
  setOneTimeCheckout,
  upsertAccount,
  type ConnectedAccountRecord,
  type OneTimeCheckoutRecord,
} from "./store.js"

export interface CreateCheckoutSessionInput {
  /** Price id override; defaults to the catalog price from create-product. */
  priceId?: string
  quantity?: number
  successUrl?: string
  cancelUrl?: string
  storePath?: string
}

/**
 * Create a platform Checkout Session for a one-time payment.
 * Uses the catalog default_price from create-product when priceId is omitted.
 */
export async function createCheckoutSession(
  input: CreateCheckoutSessionInput = {},
  stripe: Stripe = getStripeClient(),
): Promise<{
  session: Stripe.Checkout.Session
  checkout: OneTimeCheckoutRecord
  priceId: string
}> {
  const catalog = await getCatalog(input.storePath)
  const priceId = input.priceId ?? catalog.priceId
  if (!priceId) {
    throw new Error(
      "No price id available. Run create-product first, or pass --price.",
    )
  }

  const quantity = input.quantity ?? 1
  const successUrl =
    input.successUrl ??
    optionalEnv(
      "STRIPE_CHECKOUT_SUCCESS_URL",
      "http://localhost:4242/checkout/success",
    )
  const cancelUrl =
    input.cancelUrl ??
    optionalEnv(
      "STRIPE_CHECKOUT_CANCEL_URL",
      "http://localhost:4242/checkout/cancel",
    )

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    success_url: successUrl,
    cancel_url: cancelUrl,
    line_items: [
      {
        price: priceId,
        quantity,
      },
    ],
  })

  const checkout = await setOneTimeCheckout(
    {
      checkoutSessionId: session.id,
      checkoutSessionUrl: session.url,
      checkoutCompleted: false,
      priceId,
    },
    input.storePath,
  )

  return { session, checkout, priceId }
}

export interface CreateEmbeddedCheckoutSessionInput {
  sellerId: string
  successUrl?: string
  productName?: string
  unitAmount?: number
  applicationFeeAmount?: number
  currency?: string
  storePath?: string
}

/**
 * Create a Checkout Session on the connected account (direct charge) with an
 * application fee transferred to the platform.
 */
export async function createEmbeddedCheckoutSession(
  input: CreateEmbeddedCheckoutSessionInput,
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
