export interface StripeConfig {
  secretKey: string
  publishableKey: string | undefined
  currency: string
  connectedAccountCountry: string
  storePath: string
}

export function loadStripeConfig(overrides?: Partial<StripeConfig>): StripeConfig {
  const secretKey = overrides?.secretKey ?? process.env.STRIPE_SECRET_KEY
  if (!secretKey) {
    throw new Error(
      "STRIPE_SECRET_KEY is required. Obtain it from the Stripe Dashboard: https://dashboard.stripe.com/apikeys",
    )
  }

  return {
    secretKey,
    publishableKey:
      overrides?.publishableKey ?? process.env.STRIPE_PUBLISHABLE_KEY,
    currency: overrides?.currency ?? process.env.CURRENCY ?? "usd",
    connectedAccountCountry:
      overrides?.connectedAccountCountry ??
      process.env.CONNECTED_ACCOUNT_COUNTRY ??
      "us",
    storePath:
      overrides?.storePath ??
      process.env.STRIPE_STORE_PATH ??
      ".stripe-store.json",
  }
}
