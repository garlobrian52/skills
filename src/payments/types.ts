/**
 * Local domain model for a platform seller (connected Account v2).
 * Stripe resource IDs are persisted so later steps can reuse them.
 */
export interface SellerRecord {
  id: string
  displayName: string
  contactEmail: string
  /** Stripe Accounts v2 ID (acct_...) */
  stripeAccountId: string
  accountLinkUrl?: string
  onboardingStatus: "pending" | "complete"
  checkoutSessionId?: string
  checkoutUrl?: string
  /** Latest PaymentIntent created for this seller (pi_...) */
  paymentIntentId?: string
  paymentIntentStatus?: string
  /** client_secret for confirming the PaymentIntent on the client */
  paymentIntentClientSecret?: string
  /** Default payment method for platform subscription fees (pm_...) */
  paymentMethodId?: string
  setupIntentId?: string
  productId?: string
  /** Recurring price used for the platform subscription (price_...) */
  priceId?: string
  subscriptionId?: string
  subscriptionStatus?: string
  lastCheckoutSessionStatus?: string
  createdAt: string
  updatedAt: string
}

export interface PlatformCatalog {
  productId?: string
  priceId?: string
  productName?: string
  updatedAt?: string
}

export interface PaymentsStoreData {
  sellers: Record<string, SellerRecord>
  catalog: PlatformCatalog
}

export interface CreateAccountInput {
  displayName?: string
  contactEmail?: string
  country?: string
  phone?: string
  sellerId?: string
}

export interface CreateAccountLinkInput {
  sellerId: string
  returnUrl?: string
  refreshUrl?: string
}

export interface CreateCheckoutSessionInput {
  sellerId: string
  successUrl?: string
  productName?: string
  unitAmount?: number
  currency?: string
  applicationFeeAmount?: number
  quantity?: number
}

export interface CreatePaymentIntentInput {
  /** Amount in minor units (default 2000). */
  amount?: number
  currency?: string
  /**
   * Optional local seller ID. When set, creates a direct-charge PaymentIntent
   * on the connected account with an application fee.
   */
  sellerId?: string
  applicationFeeAmount?: number
}

export interface CreateSubscriptionProductInput {
  name?: string
  currency?: string
  unitAmount?: number
  interval?: "day" | "week" | "month" | "year"
}

export interface AttachBalancePaymentMethodInput {
  sellerId: string
}

export interface CreateSubscriptionInput {
  sellerId: string
  priceId?: string
  quantity?: number
}
