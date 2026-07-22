import type Stripe from "stripe"
import type { StripeConfig } from "./config.js"
import { getStripeClient } from "./client.js"
import type { StripeStore } from "./store.js"

export interface WaitForSubscriptionInput {
  subscriptionId?: string
  timeoutMs?: number
  pollIntervalMs?: number
}

export interface WaitForSubscriptionResult {
  subscription: Stripe.Subscription
  invoice: Stripe.Invoice | null
}

export async function waitForSubscription(
  config: StripeConfig,
  store: StripeStore,
  input: WaitForSubscriptionInput = {},
): Promise<WaitForSubscriptionResult> {
  const stripe = getStripeClient(config)
  const subscriptionId =
    input.subscriptionId ??
    (await store.require("subscriptionId", "Subscription ID"))
  const timeoutMs = input.timeoutMs ?? 120_000
  const pollIntervalMs = input.pollIntervalMs ?? 3_000
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
      expand: ["latest_invoice"],
    })

    const latestInvoice = subscription.latest_invoice
    const invoice =
      latestInvoice && typeof latestInvoice !== "string" ? latestInvoice : null

    if (
      subscription.status === "active" &&
      invoice?.status === "paid"
    ) {
      return { subscription, invoice }
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs))
  }

  throw new Error(
    `Timed out waiting for subscription ${subscriptionId} payment to succeed.`,
  )
}
