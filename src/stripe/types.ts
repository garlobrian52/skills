/** Domain model for a seller (connected account) on the platform. */
export interface Seller {
  id: string
  displayName: string
  contactEmail: string
  country: string
  /** Stripe Accounts v2 ID (acct_...). */
  stripeAccountId: string
  onboardingStatus: "pending" | "complete"
  merchantCapabilityStatus: "unknown" | "pending" | "active" | "inactive" | "unavailable"
  createdAt: string
  updatedAt: string
}

/** Platform subscription plan (product + default price). */
export interface SubscriptionPlan {
  id: string
  name: string
  stripeProductId: string
  stripePriceId: string
  currency: string
  unitAmount: number
  interval: "month" | "year" | "week" | "day"
  createdAt: string
}

/** A seller's platform subscription. */
export interface SellerSubscription {
  id: string
  sellerId: string
  planId: string
  stripeSubscriptionId: string
  stripePaymentMethodId: string
  status: string
  createdAt: string
  updatedAt: string
}

/** Record of an embedded Checkout Session charged on a connected account. */
export interface CheckoutPayment {
  id: string
  sellerId: string
  stripeCheckoutSessionId: string
  url: string | null
  status: string
  applicationFeeAmount: number
  createdAt: string
  updatedAt: string
}

export interface StripeStoreData {
  sellers: Seller[]
  plans: SubscriptionPlan[]
  subscriptions: SellerSubscription[]
  checkouts: CheckoutPayment[]
}
