/** Local domain record for a connected seller/merchant on the platform. */
export interface ConnectedMerchant {
  /** Local identifier (not a Stripe ID). */
  id: string
  displayName: string
  contactEmail: string
  /** Stripe Accounts v2 ID (`acct_...`). */
  stripeAccountId: string | null
  /** Default payment method for platform subscription fees. */
  stripeDefaultPaymentMethodId: string | null
  stripeProductId: string | null
  stripePriceId: string | null
  stripeSubscriptionId: string | null
  stripeCheckoutSessionId: string | null
  stripeCheckoutSessionUrl: string | null
  merchantCapabilityStatus: string | null
  subscriptionStatus: string | null
  onboardedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface StripeStoreData {
  version: 1
  merchants: ConnectedMerchant[]
}

export interface CreateAccountInput {
  displayName?: string
  contactEmail?: string
  country?: string
  phone?: string
  merchantId?: string
}

export interface CreateAccountLinkInput {
  merchantId?: string
  accountId?: string
  returnUrl?: string
  refreshUrl?: string
}

export interface CreateCheckoutSessionInput {
  merchantId?: string
  accountId?: string
  successUrl?: string
  productName?: string
  unitAmount?: number
  currency?: string
  applicationFeeAmount?: number
  quantity?: number
}

export interface CreateProductInput {
  name?: string
  currency?: string
  unitAmount?: number
  interval?: "day" | "week" | "month" | "year"
  merchantId?: string
}

export interface CreateSetupIntentInput {
  merchantId?: string
  accountId?: string
}

export interface CreateSubscriptionInput {
  merchantId?: string
  accountId?: string
  priceId?: string
  paymentMethodId?: string
  quantity?: number
}
