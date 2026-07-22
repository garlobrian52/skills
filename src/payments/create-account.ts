import type Stripe from "stripe"
import { getStripeClient } from "./client.js"
import {
  getConnectedAccountCountry,
} from "./config.js"
import { PaymentsStore, newSellerId } from "./store.js"
import type { CreateAccountInput, SellerRecord } from "./types.js"

export interface CreateAccountResult {
  seller: SellerRecord
  account: Stripe.V2.Core.Account
}

/**
 * Create a connected Account (v2) configured as merchant + customer so it can
 * accept payments and be charged platform subscription fees.
 */
export async function createAccount(
  input: CreateAccountInput = {},
  deps: {
    stripe?: Stripe
    store?: PaymentsStore
  } = {},
): Promise<CreateAccountResult> {
  const stripe = deps.stripe ?? getStripeClient()
  const store = deps.store ?? new PaymentsStore()

  const displayName = input.displayName?.trim() || "Test account"
  const contactEmail =
    input.contactEmail?.trim() || "testaccount@example.com"
  const country = (
    input.country?.trim() || getConnectedAccountCountry()
  ).toLowerCase()
  const phone = input.phone?.trim() || "0000000000"

  // Blueprint includes simulate_accept_tos_obo for test/workbench onboarding.
  // Cast: field is accepted by the API but not yet in SDK typings.
  const account = await stripe.v2.core.accounts.create({
    display_name: displayName,
    contact_email: contactEmail,
    dashboard: "full",
    identity: {
      country,
      business_details: {
        phone,
      },
    },
    configuration: {
      merchant: {
        simulate_accept_tos_obo: true,
      } as Stripe.V2.Core.AccountCreateParams.Configuration.Merchant,
      customer: {},
    },
    defaults: {
      responsibilities: {
        losses_collector: "stripe",
        fees_collector: "stripe",
      },
    },
    include: [
      "configuration.merchant",
      "configuration.recipient",
      "identity",
      "defaults",
      "configuration.customer",
    ],
  })

  const sellerId = input.sellerId?.trim() || newSellerId()
  const seller = await store.upsertSeller({
    id: sellerId,
    displayName,
    contactEmail,
    stripeAccountId: account.id,
    onboardingStatus: "pending",
  })

  return { seller, account }
}
