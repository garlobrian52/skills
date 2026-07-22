import type Stripe from "stripe"
import type {
  CreateSubscriptionInput,
  ConnectedMerchant,
} from "./types.js"
import { defaultStorePath, requireMerchant, upsertMerchant } from "./store.js"

export interface CreateSubscriptionResult {
  subscription: Stripe.Subscription
  merchant: ConnectedMerchant
}

/**
 * Charge a platform subscription against the connected account's Stripe balance.
 */
export async function createSubscription(
  stripe: Stripe,
  input: CreateSubscriptionInput = {},
  storePath: string = defaultStorePath(),
): Promise<CreateSubscriptionResult> {
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

  const priceId = input.priceId ?? merchant.stripePriceId
  if (!priceId) {
    throw new Error(
      `No price ID. Run create-product first or pass --price-id.`,
    )
  }

  const paymentMethodId =
    input.paymentMethodId ?? merchant.stripeDefaultPaymentMethodId
  if (!paymentMethodId) {
    throw new Error(
      `No payment method. Run create-setup-intent first or pass --payment-method-id.`,
    )
  }

  const quantity = input.quantity ?? 1

  const subscription = await stripe.subscriptions.create({
    customer_account: accountId,
    default_payment_method: paymentMethodId,
    items: [{ price: priceId, quantity }],
    payment_settings: {
      payment_method_types: ["stripe_balance"] as unknown as Array<
        Stripe.SubscriptionCreateParams.PaymentSettings.PaymentMethodType
      >,
    },
  })

  const updated = await upsertMerchant(
    {
      ...merchant,
      stripeSubscriptionId: subscription.id,
      subscriptionStatus: subscription.status,
    },
    storePath,
  )

  return { subscription, merchant: updated }
}
