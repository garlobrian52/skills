import type Stripe from "stripe"
import type { StripeConfig } from "./config.js"
import { getStripeClient } from "./client.js"
import type { StripeStore } from "./store.js"

export interface CreateAccountLinkInput {
  accountId?: string
  refreshUrl?: string
  returnUrl?: string
}

export interface CreateAccountLinkResult {
  accountLink: Stripe.V2.Core.AccountLink
}

const DEFAULT_ONBOARDING_URL =
  "https://dashboard.stripe.com/workbench/blueprints/learn-accounts-v2/create-account-chapter?confirmation-redirect=create-account-link"

export async function createAccountLink(
  config: StripeConfig,
  store: StripeStore,
  input: CreateAccountLinkInput = {},
): Promise<CreateAccountLinkResult> {
  const stripe = getStripeClient(config)
  const accountId =
    input.accountId ?? (await store.require("accountId", "Connected account ID"))

  const refreshUrl = input.refreshUrl ?? DEFAULT_ONBOARDING_URL
  const returnUrl = input.returnUrl ?? DEFAULT_ONBOARDING_URL

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

  await store.update({ accountLinkUrl: accountLink.url })
  return { accountLink }
}
