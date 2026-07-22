import http from "http"
import { URL } from "url"
import { createAccount, createAccountLink } from "./accounts.js"
import { createCheckoutSession } from "./payments.js"
import {
  attachBalancePaymentMethod,
  createSellerSubscription,
  createSubscriptionProduct,
} from "./subscriptions.js"
import { constructWebhookEvent, handleStripeEvent } from "./webhooks.js"
import { loadStore } from "./store.js"

export interface ServeOptions {
  port?: number
  host?: string
}

type JsonBody = Record<string, unknown>

async function readBody(req: http.IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}

function sendJson(
  res: http.ServerResponse,
  status: number,
  body: unknown,
): void {
  const payload = JSON.stringify(body, null, 2)
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(payload),
  })
  res.end(payload)
}

function parseJson(buf: Buffer): JsonBody {
  if (!buf.length) return {}
  return JSON.parse(buf.toString("utf8")) as JsonBody
}

/**
 * Lightweight HTTP API exposing domain routes for the Accounts v2 flow.
 * Not a long-running production service — use for local integration / webhooks.
 */
export function createPaymentsServer(
  options: ServeOptions = {},
): http.Server {
  const server = http.createServer(async (req, res) => {
    try {
      const method = req.method ?? "GET"
      const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`)
      const path = url.pathname

      if (method === "GET" && path === "/health") {
        return sendJson(res, 200, { ok: true })
      }

      if (method === "GET" && path === "/store") {
        return sendJson(res, 200, await loadStore())
      }

      if (method === "POST" && path === "/create-account") {
        const body = parseJson(await readBody(req))
        const result = await createAccount({
          displayName: body.displayName as string | undefined,
          contactEmail: body.contactEmail as string | undefined,
          country: body.country as string | undefined,
          phone: body.phone as string | undefined,
        })
        return sendJson(res, 200, {
          seller: result.seller,
          accountId: result.account.id,
        })
      }

      if (method === "POST" && path === "/create-account-link") {
        const body = parseJson(await readBody(req))
        const result = await createAccountLink({
          sellerId: body.sellerId as string | undefined,
          stripeAccountId: body.stripeAccountId as string | undefined,
          refreshUrl: body.refreshUrl as string | undefined,
          returnUrl: body.returnUrl as string | undefined,
        })
        return sendJson(res, 200, {
          url: result.url,
          accountId: result.stripeAccountId,
        })
      }

      if (method === "POST" && path === "/create-checkout-session") {
        const body = parseJson(await readBody(req))
        const result = await createCheckoutSession({
          sellerId: body.sellerId as string | undefined,
          stripeAccountId: body.stripeAccountId as string | undefined,
          productName: body.productName as string | undefined,
          unitAmount: body.unitAmount as number | undefined,
          applicationFeeAmount: body.applicationFeeAmount as number | undefined,
          successUrl: body.successUrl as string | undefined,
          currency: body.currency as string | undefined,
        })
        return sendJson(res, 200, {
          checkout: result.checkout,
          url: result.session.url,
          sessionId: result.session.id,
        })
      }

      if (method === "POST" && path === "/create-subscription-product") {
        const body = parseJson(await readBody(req))
        const result = await createSubscriptionProduct({
          name: body.name as string | undefined,
          currency: body.currency as string | undefined,
          unitAmount: body.unitAmount as number | undefined,
          interval: body.interval as "month" | "year" | "week" | "day" | undefined,
        })
        return sendJson(res, 200, {
          plan: result.plan,
          productId: result.product.id,
          priceId: result.plan.stripePriceId,
        })
      }

      if (method === "POST" && path === "/attach-balance-payment-method") {
        const body = parseJson(await readBody(req))
        const result = await attachBalancePaymentMethod({
          sellerId: body.sellerId as string | undefined,
          stripeAccountId: body.stripeAccountId as string | undefined,
        })
        return sendJson(res, 200, {
          paymentMethodId: result.paymentMethodId,
          setupIntentId: result.setupIntent.id,
          accountId: result.stripeAccountId,
        })
      }

      if (method === "POST" && path === "/create-subscription") {
        const body = parseJson(await readBody(req))
        const result = await createSellerSubscription({
          sellerId: body.sellerId as string | undefined,
          stripeAccountId: body.stripeAccountId as string | undefined,
          paymentMethodId: body.paymentMethodId as string | undefined,
          priceId: body.priceId as string | undefined,
          planId: body.planId as string | undefined,
        })
        return sendJson(res, 200, {
          subscription: result.subscription,
          stripeSubscriptionId: result.stripeSubscription.id,
          status: result.stripeSubscription.status,
        })
      }

      if (method === "POST" && path === "/webhooks/stripe") {
        const raw = await readBody(req)
        const signature = req.headers["stripe-signature"] as string | undefined
        const event = constructWebhookEvent(raw, signature)
        const result = await handleStripeEvent(event)
        return sendJson(res, 200, { received: true, result })
      }

      if (method === "GET" && (path === "/onboard/return" || path === "/onboard/refresh")) {
        return sendJson(res, 200, {
          message:
            path === "/onboard/return"
              ? "Onboarding return — check merchant capability via webhooks."
              : "Onboarding refresh — create a new account link.",
          account: url.searchParams.get("account"),
        })
      }

      if (method === "GET" && path === "/checkout/success") {
        return sendJson(res, 200, {
          message: "Checkout success",
          sessionId: url.searchParams.get("session_id"),
        })
      }

      sendJson(res, 404, { error: "Not found", path })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      sendJson(res, 500, { error: message })
    }
  })

  const port = options.port ?? Number(process.env.PORT || 4242)
  const host = options.host ?? "0.0.0.0"

  // Attach listen helpers for callers that want defaults
  ;(server as http.Server & { defaultPort: number; defaultHost: string }).defaultPort =
    port
  ;(server as http.Server & { defaultPort: number; defaultHost: string }).defaultHost =
    host

  return server
}

export function startPaymentsServer(
  options: ServeOptions = {},
): Promise<http.Server> {
  const server = createPaymentsServer(options)
  const port =
    options.port ??
    (server as http.Server & { defaultPort?: number }).defaultPort ??
    4242
  const host =
    options.host ??
    (server as http.Server & { defaultHost?: string }).defaultHost ??
    "0.0.0.0"

  return new Promise((resolve, reject) => {
    server.listen(port, host, () => resolve(server))
    server.on("error", reject)
  })
}
