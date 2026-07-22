import type Stripe from "stripe"
import {
  getConnectedAccountCountry,
  getBaseUrl,
  getStripe,
} from "./client.js"
import {
  findSellerById,
  newId,
  upsertSeller,
} from "./store.js"
import type { Seller } from "./types.js"

export interface CreateAccountInput {
  displayName?: string
  contactEmail?: string
  country?: string
  phone?: string
}

/**
 * Create a connected Account (v2) configured as both merchant and customer.
 * Merchant can accept payments; customer config lets the platform charge subscription fees.
 */
export async function createAccount(
  input: CreateAccountInput = {},
): Promise<{ seller: Seller; account: Stripe.V2.Core.Account }> {
  const stripe = getStripe()
  const displayName = input.displayName ?? "Test account"
  const contactEmail = input.contactEmail ?? "testaccount@example.com"
  const country = (input.country ?? getConnectedAccountCountry()).toUpperCase()
  const phone = input.phone ?? "0000000000"

  // simulate_accept_tos_obo is a test/workbench helper not yet in SDK types.
  const merchantConfig = {
    simulate_accept_tos_obo: true,
  } as Stripe.V2.Core.AccountCreateParams.Configuration.Merchant

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
      merchant: merchantConfig,
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
  })

  const now = new Date().toISOString()
  const seller: Seller = {
    id: newId("seller"),
    displayName,
    contactEmail,
    country,
    stripeAccountId: account.id,
    onboardingStatus: "pending",
    merchantCapabilityStatus: "pending",
    createdAt: now,
    updatedAt: now,
  }
  await upsertSeller(seller)

  return { seller, account }
}

export interface CreateAccountLinkInput {
  sellerId?: string
  stripeAccountId?: string
  refreshUrl?: string
  returnUrl?: string
}

/**
 * Create an Account Link for KYC / hosted onboarding (merchant + customer configs).
 */
export async function createAccountLink(
  input: CreateAccountLinkInput = {},
): Promise<{
  url: string
  accountLink: Stripe.V2.Core.AccountLink
  stripeAccountId: string
}> {
  const stripe = getStripe()
  let stripeAccountId = input.stripeAccountId

  if (!stripeAccountId && input.sellerId) {
    const seller = await findSellerById(input.sellerId)
    if (!seller) throw new Error(`Seller not found: ${input.sellerId}`)
    stripeAccountId = seller.stripeAccountId
  }

  if (!stripeAccountId) {
    throw new Error(
      "Provide sellerId or stripeAccountId (create an account first).",
    )
  }

  const base = getBaseUrl()
  const refreshUrl =
    input.refreshUrl ?? `${base}/onboard/refresh?account=${stripeAccountId}`
  const returnUrl =
    input.returnUrl ?? `${base}/onboard/return?account=${stripeAccountId}`

  const accountLink = await stripe.v2.core.accountLinks.create({
    account: stripeAccountId,
    use_case: {
      type: "account_onboarding",
      account_onboarding: {
        configurations: ["merchant", "customer"],
        refresh_url: refreshUrl,
        return_url: returnUrl,
      },
    },
  })

  return {
    url: accountLink.url,
    accountLink,
    stripeAccountId,
  }
}
