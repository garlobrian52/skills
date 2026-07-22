import http from "node:http"
import { handlePaymentsWebhook } from "./handle-webhook.js"
import { PaymentsStore } from "./store.js"
import { getStripeClient } from "./client.js"

export interface WebhookServerOptions {
  port?: number
  path?: string
  store?: PaymentsStore
}

/**
 * Minimal HTTP server that accepts Stripe webhook POSTs.
 * Not a long-running platform service — use for local/dev event handling.
 */
export function startWebhookServer(
  options: WebhookServerOptions = {},
): http.Server {
  const port = options.port ?? Number(process.env.PORT || 4242)
  const route = options.path ?? "/webhook"
  const store = options.store ?? new PaymentsStore()

  const server = http.createServer(async (req, res) => {
    if (req.method === "GET" && req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" })
      res.end(JSON.stringify({ ok: true }))
      return
    }

    if (req.method !== "POST" || req.url?.split("?")[0] !== route) {
      res.writeHead(404, { "Content-Type": "application/json" })
      res.end(JSON.stringify({ error: "not_found" }))
      return
    }

    const chunks: Buffer[] = []
    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    }
    const payload = Buffer.concat(chunks)
    const signature = req.headers["stripe-signature"]
    const sig = Array.isArray(signature) ? signature[0] : signature

    try {
      const result = await handlePaymentsWebhook(payload, sig, {
        stripe: getStripeClient(),
        store,
      })
      res.writeHead(200, { "Content-Type": "application/json" })
      res.end(JSON.stringify(result))
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      res.writeHead(400, { "Content-Type": "application/json" })
      res.end(JSON.stringify({ error: message }))
    }
  })

  server.listen(port)
  return server
}
