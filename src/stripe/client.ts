import Stripe from "stripe"

/**
 * Stripe client for Accounts v2 embedded payments and platform subscriptions.
 * API version is left unset so the SDK default is used (do not hard-code a version).
 */
export function createStripeClient(
  secretKey: string = process.env.STRIPE_SECRET_KEY ?? "",
): Stripe {
  if (!secretKey) {
    throw new Error(
      "STRIPE_SECRET_KEY is required. Obtain it from the Stripe Dashboard (Developers → API keys).",
    )
  }
  return new Stripe(secretKey)
}

export type { Stripe }
