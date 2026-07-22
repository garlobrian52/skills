import Stripe from "stripe"

let stripeClient: Stripe | null = null

/**
 * Returns a singleton Stripe client.
 * API version is left unset so the SDK default is used (do not hardcode a version).
 */
export function getStripe(secretKey?: string): Stripe {
  if (stripeClient && !secretKey) {
    return stripeClient
  }
  const key = secretKey ?? process.env.STRIPE_SECRET_KEY
  if (!key) {
    throw new Error(
      "STRIPE_SECRET_KEY is not set. Obtain your secret key from the Stripe Dashboard (https://dashboard.stripe.com/apikeys) and set it in the environment or .env.",
    )
  }
  const client = new Stripe(key)
  if (!secretKey) {
    stripeClient = client
  }
  return client
}

/** Inject a Stripe client (or mock) for tests. */
export function setStripeClient(client: Stripe | null): void {
  stripeClient = client
}

/** Reset the cached client (for tests). */
export function resetStripeClient(): void {
  stripeClient = null
}

export function getCurrency(): string {
  return (process.env.CURRENCY || process.env.currency || "usd").toLowerCase()
}

export function getConnectedAccountCountry(): string {
  return (
    process.env.CONNECTED_ACCOUNT_COUNTRY ||
    process.env.connectedAccountCountry ||
    "US"
  ).toUpperCase()
}

export function getBaseUrl(): string {
  return (process.env.BASE_URL || "http://localhost:4242").replace(/\/$/, "")
}
