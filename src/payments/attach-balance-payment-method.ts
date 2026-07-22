import type Stripe from "stripe"
import { getStripeClient } from "./client.js"
import { PaymentsStore } from "./store.js"
import type { AttachBalancePaymentMethodInput, SellerRecord } from "./types.js"

export interface AttachBalancePaymentMethodResult {
  seller: SellerRecord
  setupIntent: Stripe.SetupIntent
  paymentMethodId: string
}

/**
 * Attach the connected account's Stripe balance as an off-session payment
 * method so the platform can collect subscription fees from that balance.
 */
export async function attachBalancePaymentMethod(
  input: AttachBalancePaymentMethodInput,
  deps: {
    stripe?: Stripe
    store?: PaymentsStore
  } = {},
): Promise<AttachBalancePaymentMethodResult> {
  const stripe = deps.stripe ?? getStripeClient()
  const store = deps.store ?? new PaymentsStore()

  const seller = await store.getSeller(input.sellerId)
  if (!seller) {
    throw new Error(`Seller not found: ${input.sellerId}`)
  }

  // stripe_balance is a Connect preview payment method type (not yet in SDK enums).
  const setupIntent = await stripe.setupIntents.create({
    payment_method_types: ["stripe_balance"],
    confirm: true,
    customer_account: seller.stripeAccountId,
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
    throw new Error(
      `SetupIntent ${setupIntent.id} did not return a payment_method`,
    )
  }

  const updated = await store.updateSeller(seller.id, {
    setupIntentId: setupIntent.id,
    paymentMethodId,
  })

  return { seller: updated, setupIntent, paymentMethodId }
}
