import http from "http"
import type Stripe from "stripe"
import { getStripeClient } from "./client.js"
import { loadStripeConfig } from "./config.js"
import { updateStripeState } from "./store.js"

export interface WebhookServerOptions {
  port?: number
  statePath?: string
  webhookSecret?: string
}

export interface WebhookServerHandle {
  port: number
  close: () => Promise<void>
}

export async function startWebhookServer(
  options: WebhookServerOptions = {},
): Promise<WebhookServerHandle> {
  const port = options.port ?? Number(process.env.STRIPE_WEBHOOK_PORT ?? 4242)
  const webhookSecret =
    options.webhookSecret ?? process.env.STRIPE_WEBHOOK_SECRET

  const server = http.createServer(async (req, res) => {
    if (req.method !== "POST" || req.url !== "/webhooks/stripe") {
      res.writeHead(404)
      res.end()
      return
    }

    const chunks: Buffer[] = []
    for await (const chunk of req) {
      chunks.push(Buffer.from(chunk))
    }
    const rawBody = Buffer.concat(chunks).toString("utf8")

    try {
      const event = await constructEvent(rawBody, req.headers, webhookSecret)
      await handleStripeEvent(event, options.statePath)
      res.writeHead(200, { "Content-Type": "application/json" })
      res.end(JSON.stringify({ received: true }))
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Webhook handler failed"
      res.writeHead(400, { "Content-Type": "application/json" })
      res.end(JSON.stringify({ error: message }))
    }
  })

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(port, resolve)
  })

  return {
    port,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error)
          else resolve()
        })
      }),
  }
}

async function constructEvent(
  rawBody: string,
  headers: http.IncomingHttpHeaders,
  webhookSecret: string | undefined,
): Promise<Stripe.Event | Stripe.V2.Core.Event> {
  const stripe = getStripeClient()
  const signature = headers["stripe-signature"]

  if (webhookSecret && signature) {
    return stripe.webhooks.constructEvent(rawBody, signature, webhookSecret)
  }

  return JSON.parse(rawBody) as Stripe.Event
}

export async function handleStripeEvent(
  event: Stripe.Event | Stripe.V2.Core.Event,
  statePath?: string,
): Promise<void> {
  switch (event.type) {
    case "v2.core.account[configuration.merchant].capability_status_updated":
      await updateStripeState({ merchantCapabilityReady: true }, statePath)
      break
    case "checkout.session.completed":
      await updateStripeState({ checkoutCompleted: true }, statePath)
      break
    case "invoice.payment_succeeded":
      await updateStripeState({ subscriptionPaid: true }, statePath)
      break
    default:
      break
  }
}

export async function runEmbeddedPaymentsFlow(
  statePath?: string,
): Promise<void> {
  loadStripeConfig()

  const { createAccount, createAccountLink, waitForAccountOnboard } =
    await import("./accounts.js")
  const { createCheckoutSession, waitForCheckoutComplete } =
    await import("./checkout.js")
  const {
    createProduct,
    createSetupIntent,
    createSubscription,
    waitForSubscriptionPaid,
  } = await import("./subscriptions.js")

  const account = await createAccount(statePath)
  console.log(`Created connected account: ${account.accountId}`)

  const link = await createAccountLink(statePath)
  console.log(`Account onboarding link: ${link.accountLinkUrl}`)

  await waitForAccountOnboard(statePath)
  console.log("Connected account onboarding complete.")

  const checkout = await createCheckoutSession(statePath)
  console.log(`Checkout URL: ${checkout.checkoutUrl}`)
  console.log("Complete checkout with test card 4000 0000 0000 0077.")

  await waitForCheckoutComplete(statePath)
  console.log("Checkout payment complete.")

  const product = await createProduct(statePath)
  console.log(
    `Created subscription product ${product.productId} (price ${product.defaultPriceId}).`,
  )

  const setupIntent = await createSetupIntent(statePath)
  console.log(
    `Attached default payment method ${setupIntent.paymentMethodId}.`,
  )

  const subscription = await createSubscription(statePath)
  console.log(`Created subscription ${subscription.subscriptionId}.`)

  await waitForSubscriptionPaid(statePath)
  console.log("Subscription invoice paid.")
}
