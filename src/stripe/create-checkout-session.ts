import type Stripe from "stripe"
import type {
  CreateCheckoutSessionInput,
  ConnectedMerchant,
} from "./types.js"
import { defaultStorePath, requireMerchant, upsertMerchant } from "./store.js"

export interface CreateCheckoutSessionResult {
  session: Stripe.Checkout.Session
  merchant: ConnectedMerchant
}

/**
 * Create a Checkout Session on the connected account (direct charge)
 * with an application fee transferred to the platform.
 */
export async function createCheckoutSession(
  stripe: Stripe,
  input: CreateCheckoutSessionInput = {},
  storePath: string = defaultStorePath(),
): Promise<CreateCheckoutSessionResult> {
  const merchant = await requireMerchant(
    { merchantId: input.merchantId, accountId: input.accountId },
    storePath,
  )
  const accountId = input.accountId ?? merchant.stripeAccountId
  if (!accountId) {
    throw new Error(
      `Merchant ${merchant.id} has no stripeAccountId. Run create-account first.`,
    )
  }

  const currency =
    (input.currency ?? process.env.CURRENCY ?? "usd").toLowerCase()
  const successUrl =
    input.successUrl ??
    process.env.STRIPE_CHECKOUT_SUCCESS_URL ??
    "https://example.com/checkout/success"
  const unitAmount = input.unitAmount ?? 100_000
  const applicationFeeAmount = input.applicationFeeAmount ?? 123
  const quantity = input.quantity ?? 1
  const productName = input.productName ?? "Cookie"

  const session = await stripe.checkout.sessions.create(
    {
      success_url: successUrl,
      line_items: [
        {
          price_data: {
            currency,
            product_data: { name: productName },
            unit_amount: unitAmount,
          },
          quantity,
        },
      ],
      mode: "payment",
      payment_method_types: ["card"],
      payment_intent_data: {
        application_fee_amount: applicationFeeAmount,
      },
    },
    {
      stripeAccount: accountId,
    },
  )

  const updated = await upsertMerchant(
    {
      ...merchant,
      stripeCheckoutSessionId: session.id,
      stripeCheckoutSessionUrl: session.url,
    },
    storePath,
  )

  return { session, merchant: updated }
}
