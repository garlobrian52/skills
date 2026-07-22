import type Stripe from "stripe"
import { getStripeClient } from "./client.js"
import { getRefreshUrl, getReturnUrl } from "./config.js"
import { PaymentsStore } from "./store.js"
import type { CreateAccountLinkInput, SellerRecord } from "./types.js"

export interface CreateAccountLinkResult {
  seller: SellerRecord
  accountLink: Stripe.V2.Core.AccountLink
}

/**
 * Create a hosted Account Link for KYC / onboarding (merchant + customer).
 */
export async function createAccountLink(
  input: CreateAccountLinkInput,
  deps: {
    stripe?: Stripe
    store?: PaymentsStore
  } = {},
): Promise<CreateAccountLinkResult> {
  const stripe = deps.stripe ?? getStripeClient()
  const store = deps.store ?? new PaymentsStore()

  const seller = await store.getSeller(input.sellerId)
  if (!seller) {
    throw new Error(`Seller not found: ${input.sellerId}`)
  }
  if (!seller.stripeAccountId) {
    throw new Error(`Seller ${input.sellerId} has no stripeAccountId`)
  }

  const returnUrl = input.returnUrl?.trim() || getReturnUrl()
  const refreshUrl = input.refreshUrl?.trim() || getRefreshUrl()

  const accountLink = await stripe.v2.core.accountLinks.create({
    account: seller.stripeAccountId,
    use_case: {
      type: "account_onboarding",
      account_onboarding: {
        configurations: ["merchant", "customer"],
        refresh_url: refreshUrl,
        return_url: returnUrl,
      },
    },
  })

  const updated = await store.updateSeller(seller.id, {
    accountLinkUrl: accountLink.url,
  })

  return { seller: updated, accountLink }
}
