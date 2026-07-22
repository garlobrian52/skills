import path from "node:path"
import os from "node:os"

/**
 * Runtime config for the Stripe Accounts v2 payments flow.
 * API keys must come from the Stripe Dashboard (Developers → API keys).
 */
export function getStripeSecretKey(): string {
  const key = process.env.STRIPE_SECRET_KEY?.trim()
  if (!key) {
    throw new Error(
      "STRIPE_SECRET_KEY is required. Obtain it from the Stripe Dashboard (Developers → API keys) and set it in your environment or .env file.",
    )
  }
  return key
}

export function getStripePublishableKey(): string | undefined {
  return process.env.STRIPE_PUBLISHABLE_KEY?.trim() || undefined
}

export function getConnectedAccountCountry(): string {
  return (
    process.env.CONNECTED_ACCOUNT_COUNTRY?.trim() ||
    process.env.connectedAccountCountry?.trim() ||
    "US"
  )
}

export function getCurrency(): string {
  return (
    process.env.STRIPE_CURRENCY?.trim() ||
    process.env.currency?.trim() ||
    "usd"
  ).toLowerCase()
}

export function getReturnUrl(): string {
  return (
    process.env.STRIPE_RETURN_URL?.trim() ||
    "http://localhost:4242/return"
  )
}

export function getRefreshUrl(): string {
  return (
    process.env.STRIPE_REFRESH_URL?.trim() ||
    "http://localhost:4242/refresh"
  )
}

export function getSuccessUrl(): string {
  return (
    process.env.STRIPE_SUCCESS_URL?.trim() ||
    "http://localhost:4242/success"
  )
}

export function getWebhookSecret(): string | undefined {
  return process.env.STRIPE_WEBHOOK_SECRET?.trim() || undefined
}

export function getPaymentsStorePath(): string {
  if (process.env.PAYMENTS_STORE_PATH?.trim()) {
    return path.resolve(process.env.PAYMENTS_STORE_PATH.trim())
  }
  return path.join(os.homedir(), ".cubic-plugin", "payments-store.json")
}

/** Default application fee (minor units) taken on connected-account checkouts. */
export const DEFAULT_APPLICATION_FEE_AMOUNT = 123

/** Default one-time checkout amount for a "Cookie" line item (minor units). */
export const DEFAULT_CHECKOUT_UNIT_AMOUNT = 100_000

/** Default monthly platform subscription fee (minor units). */
export const DEFAULT_SUBSCRIPTION_UNIT_AMOUNT = 1000
