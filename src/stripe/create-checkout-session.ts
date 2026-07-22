import type Stripe from "stripe"
import type { StripeConfig } from "./config.js"
import { getStripeClient } from "./client.js"
import type { StripeStore } from "./store.js"

export interface CreateCheckoutSessionInput {
  accountId?: string
  successUrl?: string
  unitAmount?: number
  productName?: string
  applicationFeeAmount?: number
}

export interface CreateCheckoutSessionResult {
  session: Stripe.Checkout.Session
}

const DEFAULT_SUCCESS_URL =
  "https://dashboard.stripe.com/workbench/blueprints/learn-accounts-v2/accept-embedded-payments-chapter?confirmation-redirect=create-checkout-session"

export async function createCheckoutSession(
  config: StripeConfig,
  store: StripeStore,
  input: CreateCheckoutSessionInput = {},
): Promise<CreateCheckoutSessionResult> {
  const stripe = getStripeClient(config)
  const accountId =
    input.accountId ?? (await store.require("accountId", "Connected account ID"))

  const session = await stripe.checkout.sessions.create(
    {
      success_url: input.successUrl ?? DEFAULT_SUCCESS_URL,
      line_items: [
        {
          price_data: {
            currency: config.currency,
            product_data: {
              name: input.productName ?? "Cookie",
            },
            unit_amount: input.unitAmount ?? 100_000,
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      payment_method_types: ["card"],
      payment_intent_data: {
        application_fee_amount: input.applicationFeeAmount ?? 123,
      },
    },
    { stripeAccount: accountId },
  )

  await store.update({
    checkoutSessionId: session.id,
    checkoutSessionUrl: session.url ?? undefined,
  })

  return { session }
}
