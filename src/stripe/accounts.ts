import type Stripe from "stripe"
import { getStripeClient } from "./client.js"
import { loadStripeConfig } from "./config.js"
import {
  loadStripeState,
  requireAccountId,
  updateStripeState,
  type StripeState,
} from "./store.js"

export interface CreateAccountResult {
  accountId: string
  state: StripeState
}

export async function createAccount(
  statePath?: string,
): Promise<CreateAccountResult> {
  const stripe = getStripeClient()
  const config = loadStripeConfig()

  const account = await stripe.v2.core.accounts.create({
    display_name: "Test account",
    contact_email: "testaccount@example.com",
    configuration: {
      merchant: {
        simulate_accept_tos_obo: true,
      },
    } as Stripe.V2.Core.AccountCreateParams.Configuration,
    include: [
      "configuration.merchant",
      "configuration.recipient",
      "identity",
      "defaults",
      "configuration.customer",
    ],
    identity: {
      country: config.connectedAccountCountry,
      business_details: {
        phone: "0000000000",
      },
    },
    dashboard: "full",
    defaults: {
      responsibilities: {
        losses_collector: "stripe",
        fees_collector: "stripe",
      },
    },
  })

  const state = await updateStripeState(
    { accountId: account.id },
    statePath,
  )

  return { accountId: account.id, state }
}

export interface CreateAccountLinkResult {
  accountLinkUrl: string
  state: StripeState
}

export async function createAccountLink(
  statePath?: string,
): Promise<CreateAccountLinkResult> {
  const stripe = getStripeClient()
  const config = loadStripeConfig()
  const state = await loadStripeState(statePath)
  const accountId = requireAccountId(state)

  const accountLink = await stripe.v2.core.accountLinks.create({
    account: accountId,
    use_case: {
      type: "account_onboarding",
      account_onboarding: {
        configurations: ["merchant", "customer"],
        refresh_url: config.refreshUrl,
        return_url: config.returnUrl,
      },
    },
  })

  const nextState = await updateStripeState(
    { accountLinkUrl: accountLink.url },
    statePath,
  )

  return { accountLinkUrl: accountLink.url, state: nextState }
}

export async function waitForAccountOnboard(
  statePath?: string,
  timeoutMs = 300_000,
): Promise<StripeState> {
  const state = await loadStripeState(statePath)
  const accountId = requireAccountId(state)
  const stripe = getStripeClient()
  const started = Date.now()

  while (Date.now() - started < timeoutMs) {
    const account = await stripe.v2.core.accounts.retrieve(accountId, {
      include: ["configuration.merchant"],
    })

    const merchant = account.configuration?.merchant
    const cardPayments =
      merchant?.capabilities?.card_payments?.status === "active"
    const stripeBalance = merchant?.capabilities?.stripe_balance as
      | { status?: string }
      | undefined
    const transfers = stripeBalance?.status === "active"

    if (cardPayments || transfers || state.merchantCapabilityReady) {
      return updateStripeState({ merchantCapabilityReady: true }, statePath)
    }

    await sleep(2_000)
  }

  throw new Error(
    `Timed out waiting for connected account ${accountId} to finish onboarding.`,
  )
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
