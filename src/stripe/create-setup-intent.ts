import type Stripe from "stripe"
import type { StripeConfig } from "./config.js"
import { getStripeClient } from "./client.js"
import type { StripeStore } from "./store.js"

export interface CreateSetupIntentInput {
  accountId?: string
}

export interface CreateSetupIntentResult {
  setupIntent: Stripe.SetupIntent
}

export async function createSetupIntent(
  config: StripeConfig,
  store: StripeStore,
  input: CreateSetupIntentInput = {},
): Promise<CreateSetupIntentResult> {
  const stripe = getStripeClient(config)
  const accountId =
    input.accountId ?? (await store.require("accountId", "Connected account ID"))

  const setupIntent = await stripe.setupIntents.create({
    payment_method_types: ["stripe_balance"],
    confirm: true,
    customer_account: accountId,
    usage: "off_session",
    payment_method_data: {
      type: "stripe_balance",
    },
  } as unknown as Stripe.SetupIntentCreateParams)

  const paymentMethodId =
    typeof setupIntent.payment_method === "string"
      ? setupIntent.payment_method
      : setupIntent.payment_method?.id

  if (!paymentMethodId) {
    throw new Error("SetupIntent did not return a payment method.")
  }

  await store.update({
    setupIntentId: setupIntent.id,
    defaultPaymentMethodId: paymentMethodId,
  })

  return { setupIntent }
}
