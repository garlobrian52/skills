import type Stripe from "stripe"
import type { StripeConfig } from "./config.js"
import { getStripeClient } from "./client.js"
import type { StripeStore } from "./store.js"

export interface WaitForCheckoutInput {
  accountId?: string
  sessionId?: string
  timeoutMs?: number
  pollIntervalMs?: number
}

export interface WaitForCheckoutResult {
  session: Stripe.Checkout.Session
}

export async function waitForCheckout(
  config: StripeConfig,
  store: StripeStore,
  input: WaitForCheckoutInput = {},
): Promise<WaitForCheckoutResult> {
  const stripe = getStripeClient(config)
  const accountId =
    input.accountId ?? (await store.require("accountId", "Connected account ID"))
  const sessionId =
    input.sessionId ??
    (await store.require("checkoutSessionId", "Checkout session ID"))
  const timeoutMs = input.timeoutMs ?? 300_000
  const pollIntervalMs = input.pollIntervalMs ?? 3_000
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    const session = await stripe.checkout.sessions.retrieve(sessionId, undefined, {
      stripeAccount: accountId,
    })

    if (session.payment_status === "paid" || session.status === "complete") {
      return { session }
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs))
  }

  throw new Error(
    `Timed out waiting for checkout session ${sessionId} to complete.`,
  )
}
