import Stripe from "stripe"
import { getStripeSecretKey } from "./config.js"

let cached: Stripe | null = null

/**
 * Lazily create a Stripe client.
 * API version is left unset so the SDK uses its pinned default
 * (do not hard-code a version unless a blueprint requires it).
 */
export function getStripeClient(secretKey?: string): Stripe {
  if (secretKey) {
    return new Stripe(secretKey)
  }
  if (!cached) {
    cached = new Stripe(getStripeSecretKey())
  }
  return cached
}

/** Reset the cached client (tests). */
export function resetStripeClient(): void {
  cached = null
}

export type { Stripe }
