import type Stripe from "stripe"
import { getStripeClient } from "./client.js"
import { optionalEnv, isStripeTestKey } from "./env.js"
import {
  createEmptyRecord,
  requireAccount,
  upsertAccount,
  type ConnectedAccountRecord,
} from "./store.js"

export interface CreateConnectedAccountInput {
  sellerId: string
  displayName?: string
  contactEmail?: string
  country?: string
  phone?: string
  storePath?: string
}

/**
 * Create an Accounts v2 connected account configured as both merchant
 * (accept payments) and customer (pay platform subscription fees).
 */
export async function createConnectedAccount(
  input: CreateConnectedAccountInput,
  stripe: Stripe = getStripeClient(),
): Promise<ConnectedAccountRecord> {
  const displayName = input.displayName ?? "Test account"
  const contactEmail = input.contactEmail ?? "testaccount@example.com"
  const country = (
    input.country ?? optionalEnv("CONNECTED_ACCOUNT_COUNTRY", "us")
  ).toLowerCase()
  const phone = input.phone ?? "0000000000"

  const merchantConfig: Stripe.V2.Core.AccountCreateParams.Configuration.Merchant =
    isStripeTestKey()
      ? ({
          // Test-only helper — rejected in live mode.
          simulate_accept_tos_obo: true,
        } as Stripe.V2.Core.AccountCreateParams.Configuration.Merchant)
      : {}

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
    defaults: {
      responsibilities: {
        losses_collector: "stripe",
        fees_collector: "stripe",
      },
    },
    configuration: {
      // Enable customer config so the account can be billed via customer_account.
      customer: {},
      merchant: merchantConfig,
    },
    include: [
      "configuration.merchant",
      "configuration.recipient",
      "identity",
      "defaults",
      "configuration.customer",
    ],
  })

  const record = createEmptyRecord(input.sellerId, displayName, contactEmail)
  record.accountId = account.id
  return upsertAccount(record, input.storePath)
}

export interface CreateAccountLinkInput {
  sellerId: string
  returnUrl?: string
  refreshUrl?: string
  storePath?: string
}

/**
 * Create a Stripe-hosted onboarding Account Link for KYC collection
 * (merchant + customer configurations).
 */
export async function createAccountOnboardingLink(
  input: CreateAccountLinkInput,
  stripe: Stripe = getStripeClient(),
): Promise<{ record: ConnectedAccountRecord; url: string }> {
  const record = await requireAccount(input.sellerId, input.storePath)
  if (!record.accountId) {
    throw new Error(
      `Seller "${input.sellerId}" has no Stripe account id. Run create-account first.`,
    )
  }

  const returnUrl =
    input.returnUrl ??
    optionalEnv(
      "STRIPE_RETURN_URL",
      "http://localhost:4242/onboarding/return",
    )
  const refreshUrl =
    input.refreshUrl ??
    optionalEnv(
      "STRIPE_REFRESH_URL",
      "http://localhost:4242/onboarding/refresh",
    )

  const link = await stripe.v2.core.accountLinks.create({
    account: record.accountId,
    use_case: {
      type: "account_onboarding",
      account_onboarding: {
        configurations: ["merchant", "customer"],
        refresh_url: refreshUrl,
        return_url: returnUrl,
      },
    },
  })

  record.accountLinkUrl = link.url
  const saved = await upsertAccount(record, input.storePath)
  return { record: saved, url: link.url }
}
