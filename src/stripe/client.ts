import Stripe from "stripe"
import type { StripeConfig } from "./config.js"

let cachedClient: Stripe | null = null
let cachedSecretKey: string | null = null

export function getStripeClient(config: Pick<StripeConfig, "secretKey">): Stripe {
  if (cachedClient && cachedSecretKey === config.secretKey) {
    return cachedClient
  }

  cachedClient = new Stripe(config.secretKey)
  cachedSecretKey = config.secretKey
  return cachedClient
}
