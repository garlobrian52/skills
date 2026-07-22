import type Stripe from "stripe"
import { getStripeClient } from "./client.js"
import { optionalEnv } from "./env.js"
import { requireAccount, upsertAccount, type ConnectedAccountRecord } from "./store.js"

export interface CreateCheckoutSessionInput {
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
  input: CreateCheckoutSessionInput,
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
