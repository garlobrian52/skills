import type Stripe from "stripe"
import type { CreateAccountLinkInput, ConnectedMerchant } from "./types.js"
import { defaultStorePath, requireMerchant, upsertMerchant } from "./store.js"

export interface CreateAccountLinkResult {
  accountLink: Stripe.V2.Core.AccountLink
  merchant: ConnectedMerchant
}

/**
 * Create an Account Link for Stripe-hosted KYC / onboarding (merchant + customer).
 */
export async function createAccountLink(
  stripe: Stripe,
  input: CreateAccountLinkInput = {},
  storePath: string = defaultStorePath(),
): Promise<CreateAccountLinkResult> {
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

  const returnUrl =
    input.returnUrl ??
    process.env.STRIPE_RETURN_URL ??
    "https://example.com/onboarding/return"
  const refreshUrl =
    input.refreshUrl ??
    process.env.STRIPE_REFRESH_URL ??
    "https://example.com/onboarding/refresh"

  const accountLink = await stripe.v2.core.accountLinks.create({
    account: accountId,
    use_case: {
      type: "account_onboarding",
      account_onboarding: {
        configurations: ["merchant", "customer"],
        refresh_url: refreshUrl,
        return_url: returnUrl,
      },
    },
  })

  const updated = await upsertMerchant(merchant, storePath)
  return { accountLink, merchant: updated }
}
