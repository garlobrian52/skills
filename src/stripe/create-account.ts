import type Stripe from "stripe"
import type { CreateAccountInput, ConnectedMerchant } from "./types.js"
import {
  createMerchantRecord,
  defaultStorePath,
  upsertMerchant,
} from "./store.js"

export interface CreateAccountResult {
  account: Stripe.V2.Core.Account
  merchant: ConnectedMerchant
}

/**
 * Create a connected Account (Accounts v2) configured as merchant + customer
 * so it can accept payments and be charged platform subscription fees.
 */
export async function createAccount(
  stripe: Stripe,
  input: CreateAccountInput = {},
  storePath: string = defaultStorePath(),
): Promise<CreateAccountResult> {
  const displayName = input.displayName ?? "Test account"
  const contactEmail = input.contactEmail ?? "testaccount@example.com"
  const country =
    input.country ?? process.env.CONNECTED_ACCOUNT_COUNTRY ?? "us"
  const phone = input.phone ?? "0000000000"

  // Blueprint uses configuration.merchant.simulate_accept_tos_obo for test/workbench flows.
  // That field is not always present in SDK typings; pass it via a typed assert.
  const merchantConfig = {
    simulate_accept_tos_obo: true,
  } as Stripe.V2.Core.AccountCreateParams.Configuration.Merchant

  const account = await stripe.v2.core.accounts.create({
    display_name: displayName,
    contact_email: contactEmail,
    configuration: {
      merchant: merchantConfig,
      // Enable customer so the account can be charged via customer_account.
      customer: {},
      recipient: {},
    },
    include: [
      "configuration.merchant",
      "configuration.recipient",
      "identity",
      "defaults",
      "configuration.customer",
    ],
    identity: {
      country,
      business_details: {
        phone,
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

  const merchant = await upsertMerchant(
    createMerchantRecord({
      id: input.merchantId,
      displayName,
      contactEmail,
      stripeAccountId: account.id,
    }),
    storePath,
  )

  return { account, merchant }
}
