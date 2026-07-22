import { getStripeClient } from "./client.js"
import { loadStripeConfig } from "./config.js"
import {
  loadStripeState,
  requireAccountId,
  updateStripeState,
  type StripeState,
} from "./store.js"

export interface CreateCheckoutSessionResult {
  sessionId: string
  checkoutUrl: string
  state: StripeState
}

export async function createCheckoutSession(
  statePath?: string,
): Promise<CreateCheckoutSessionResult> {
  const stripe = getStripeClient()
  const config = loadStripeConfig()
  const state = await loadStripeState(statePath)
  const accountId = requireAccountId(state)

  const session = await stripe.checkout.sessions.create(
    {
      success_url: config.successUrl,
      line_items: [
        {
          price_data: {
            currency: config.currency,
            product_data: {
              name: "Cookie",
            },
            unit_amount: 100_000,
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      payment_method_types: ["card"],
      payment_intent_data: {
        application_fee_amount: 123,
      },
    },
    {
      stripeAccount: accountId,
    },
  )

  if (!session.url) {
    throw new Error("Checkout session was created without a URL.")
  }

  const nextState = await updateStripeState(
    {
      checkoutSessionId: session.id,
      checkoutSessionUrl: session.url,
    },
    statePath,
  )

  return {
    sessionId: session.id,
    checkoutUrl: session.url,
    state: nextState,
  }
}

export async function waitForCheckoutComplete(
  statePath?: string,
  timeoutMs = 600_000,
): Promise<StripeState> {
  const state = await loadStripeState(statePath)
  if (state.checkoutCompleted) {
    return state
  }

  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    const current = await loadStripeState(statePath)
    if (current.checkoutCompleted) {
      return current
    }
    await sleep(2_000)
  }

  throw new Error(
    "Timed out waiting for checkout.session.completed. Complete checkout or forward webhooks to the webhook server.",
  )
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
