import type Stripe from "stripe"
import type { StripeConfig } from "./config.js"
import { getStripeClient } from "./client.js"
import type { StripeStore } from "./store.js"

export interface WaitForAccountOnboardInput {
  accountId?: string
  timeoutMs?: number
  pollIntervalMs?: number
}

export interface WaitForAccountOnboardResult {
  account: Stripe.V2.Core.Account
}

function isMerchantReady(account: Stripe.V2.Core.Account): boolean {
  const status =
    account.configuration?.merchant?.capabilities?.card_payments?.status
  return status === "active"
}

export async function waitForAccountOnboard(
  config: StripeConfig,
  store: StripeStore,
  input: WaitForAccountOnboardInput = {},
): Promise<WaitForAccountOnboardResult> {
  const stripe = getStripeClient(config)
  const accountId =
    input.accountId ?? (await store.require("accountId", "Connected account ID"))
  const timeoutMs = input.timeoutMs ?? 120_000
  const pollIntervalMs = input.pollIntervalMs ?? 3_000
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    const account = await stripe.v2.core.accounts.retrieve(accountId, {
      include: ["configuration.merchant"],
    })

    if (isMerchantReady(account)) {
      return { account }
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs))
  }

  throw new Error(
    `Timed out waiting for connected account ${accountId} to finish onboarding.`,
  )
}
