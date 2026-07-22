import type Stripe from "stripe"
import type { StripeConfig } from "./config.js"
import { getStripeClient } from "./client.js"
import type { StripeStore } from "./store.js"

export interface CreateAccountInput {
  displayName?: string
  contactEmail?: string
}

export interface CreateAccountResult {
  account: Stripe.V2.Core.Account
}

export async function createAccount(
  config: StripeConfig,
  store: StripeStore,
  input: CreateAccountInput = {},
): Promise<CreateAccountResult> {
  const stripe = getStripeClient(config)

  const account = await stripe.v2.core.accounts.create({
    display_name: input.displayName ?? "Test account",
    contact_email: input.contactEmail ?? "testaccount@example.com",
    configuration: {
      merchant: {
        simulate_accept_tos_obo: true,
      } as Stripe.V2.Core.AccountCreateParams.Configuration.Merchant,
    },
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

  await store.update({ accountId: account.id })
  return { account }
}
