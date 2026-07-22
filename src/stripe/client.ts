import Stripe from "stripe"
import { loadStripeConfig } from "./config.js"

let stripeClient: Stripe | null = null

export function getStripeClient(): Stripe {
  if (!stripeClient) {
    const { secretKey } = loadStripeConfig()
    stripeClient = new Stripe(secretKey)
  }
  return stripeClient
}

export function resetStripeClient(): void {
  stripeClient = null
}
