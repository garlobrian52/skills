import type Stripe from "stripe"
import type { CreateSetupIntentInput, ConnectedMerchant } from "./types.js"
import { defaultStorePath, requireMerchant, upsertMerchant } from "./store.js"

export interface CreateSetupIntentResult {
  setupIntent: Stripe.SetupIntent
  paymentMethodId: string
  merchant: ConnectedMerchant
}

/**
 * Attach the connected account's Stripe balance as its default payment method
 * for off-session platform subscription charges.
 */
export async function createSetupIntent(
  stripe: Stripe,
  input: CreateSetupIntentInput = {},
  storePath: string = defaultStorePath(),
): Promise<CreateSetupIntentResult> {
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

  // stripe_balance is the Accounts v2 SaaS-fee payment method; cast where SDK typings lag.
  const setupIntent = await stripe.setupIntents.create({
    payment_method_types: ["stripe_balance"] as unknown as string[],
    confirm: true,
    customer_account: accountId,
    usage: "off_session",
    payment_method_data: {
      type: "stripe_balance",
    } as unknown as Stripe.SetupIntentCreateParams.PaymentMethodData,
  })

  const paymentMethodId =
    typeof setupIntent.payment_method === "string"
      ? setupIntent.payment_method
      : setupIntent.payment_method?.id

  if (!paymentMethodId) {
    throw new Error(
      `SetupIntent ${setupIntent.id} succeeded without a payment_method.`,
    )
  }

  const updated = await upsertMerchant(
    {
      ...merchant,
      stripeDefaultPaymentMethodId: paymentMethodId,
    },
    storePath,
  )

  return { setupIntent, paymentMethodId, merchant: updated }
}
