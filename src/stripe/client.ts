import Stripe from "stripe"
import { requireEnv } from "./env.js"

let cached: Stripe | null = null

/**
 * Initialize the Stripe client. The API version is intentionally omitted so
 * the SDK uses its bundled default (do not hard-code a version unless the
 * integration blueprint specifies one).
 */
export function getStripeClient(secretKey?: string): Stripe {
  if (cached && !secretKey) return cached
  const key = secretKey ?? requireEnv("STRIPE_SECRET_KEY")
  const client = new Stripe(key)
  if (!secretKey) cached = client
  return client
}

/** Reset the cached client (used in tests). */
export function resetStripeClient(): void {
  cached = null
}

export type { Stripe }
