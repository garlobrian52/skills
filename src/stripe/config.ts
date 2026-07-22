export interface StripeConfig {
  secretKey: string
  publishableKey: string | undefined
  currency: string
  connectedAccountCountry: string
  successUrl: string
  refreshUrl: string
  returnUrl: string
}

export function loadStripeConfig(): StripeConfig {
  const secretKey = process.env.STRIPE_SECRET_KEY
  if (!secretKey) {
    throw new Error(
      "STRIPE_SECRET_KEY is required. Obtain it from the Stripe Dashboard.",
    )
  }

  return {
    secretKey,
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
    currency: process.env.STRIPE_CURRENCY ?? "usd",
    connectedAccountCountry:
      process.env.STRIPE_CONNECTED_ACCOUNT_COUNTRY ?? "us",
    successUrl:
      process.env.STRIPE_SUCCESS_URL ??
      "https://dashboard.stripe.com/workbench/blueprints/learn-accounts-v2/accept-embedded-payments-chapter?confirmation-redirect=create-checkout-session",
    refreshUrl:
      process.env.STRIPE_REFRESH_URL ??
      "https://dashboard.stripe.com/workbench/blueprints/learn-accounts-v2/create-account-chapter?confirmation-redirect=create-account-link",
    returnUrl:
      process.env.STRIPE_RETURN_URL ??
      "https://dashboard.stripe.com/workbench/blueprints/learn-accounts-v2/create-account-chapter?confirmation-redirect=create-account-link",
  }
}
