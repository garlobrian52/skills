import type Stripe from "stripe"
import { getStripeClient } from "./client.js"
import { optionalEnv } from "./env.js"
import { requireAccount, upsertAccount, type ConnectedAccountRecord } from "./store.js"

const DEFAULT_CHARGE_AMOUNT = 10_000
const DEFAULT_APPLICATION_FEE = 123
const DEFAULT_DESCRIPTION = "(created by Testing Blueprints)"
const DEFAULT_RETURN_URL = "https://example.com/return"

export interface CreateDestinationChargeInput {
  sellerId: string
  amount?: number
  applicationFeeAmount?: number
  currency?: string
  destination?: string
  paymentMethodId?: string
  description?: string
  returnUrl?: string
  storePath?: string
}

/**
 * Create a confirmed PaymentIntent on the platform with a destination charge
 * (transfer to a connected account plus an application fee).
 */
export async function createDestinationCharge(
  input: CreateDestinationChargeInput,
  stripe: Stripe = getStripeClient(),
): Promise<{
  record: ConnectedAccountRecord
  paymentIntent: Stripe.PaymentIntent
}> {
  const record = await requireAccount(input.sellerId, input.storePath)

  const destination =
    input.destination ??
    (optionalEnv("STRIPE_TRANSFER_DESTINATION", "") || record.accountId)
  if (!destination) {
    throw new Error(
      `Seller "${input.sellerId}" has no transfer destination. Run create-account first or pass --destination.`,
    )
  }

  const amount =
    input.amount ??
    Number(optionalEnv("STRIPE_CHARGE_AMOUNT", String(DEFAULT_CHARGE_AMOUNT)))
  const applicationFeeAmount =
    input.applicationFeeAmount ??
    Number(
      optionalEnv("STRIPE_APPLICATION_FEE", String(DEFAULT_APPLICATION_FEE)),
    )
  const currency = (
    input.currency ?? optionalEnv("CURRENCY", "usd")
  ).toLowerCase()
  const description = input.description ?? DEFAULT_DESCRIPTION
  const returnUrl =
    input.returnUrl ??
    optionalEnv("STRIPE_PAYMENT_RETURN_URL", DEFAULT_RETURN_URL)
  const paymentMethodId =
    input.paymentMethodId ?? optionalEnv("STRIPE_TEST_PAYMENT_METHOD", "")

  const params: Stripe.PaymentIntentCreateParams = {
    amount,
    currency,
    application_fee_amount: applicationFeeAmount,
    payment_method_types: ["card"],
    confirm: true,
    transfer_data: {
      destination,
    },
    description,
    return_url: returnUrl,
  }

  if (paymentMethodId) {
    params.payment_method = paymentMethodId
  }

  const paymentIntent = await stripe.paymentIntents.create(params)

  record.paymentIntentId = paymentIntent.id
  const saved = await upsertAccount(record, input.storePath)
  return { record: saved, paymentIntent }
}
