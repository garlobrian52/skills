import { createServer, type Server } from "http"
import { getStripeClient } from "./client.js"
import { getPublishableKey, requireEnv } from "./env.js"
import { createPaymentIntent } from "./payments.js"
import { constructWebhookEvent, handleStripeWebhookEvent } from "./webhooks.js"

export interface PaymentServerOptions {
  port?: number
  webhookPath?: string
  storePath?: string
  /** Amount (minor units) for PaymentIntents created by the demo endpoint. */
  amount?: number
  currency?: string
  /** Optional seller id — creates direct charges on the connected account. */
  sellerId?: string
}

function paymentPageHtml(publishableKey: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Accept a payment</title>
  <script src="https://js.stripe.com/v3/"></script>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 480px; margin: 2rem auto; padding: 0 1rem; }
    #payment-form { display: flex; flex-direction: column; gap: 1rem; }
    #payment-element { margin-bottom: 1rem; }
    button { background: #635bff; color: #fff; border: 0; border-radius: 6px; padding: 0.75rem 1rem; font-size: 1rem; cursor: pointer; }
    button:disabled { opacity: 0.6; cursor: not-allowed; }
    #payment-message { color: #c00; min-height: 1.25rem; }
  </style>
</head>
<body>
  <h1>Accept a payment</h1>
  <form id="payment-form">
    <div id="payment-element"></div>
    <button id="submit" type="submit">Pay</button>
    <div id="payment-message" role="alert"></div>
  </form>
  <script>
    const publishableKey = ${JSON.stringify(publishableKey)};
    const form = document.getElementById("payment-form");
    const submitBtn = document.getElementById("submit");
    const messageEl = document.getElementById("payment-message");

    async function initialize() {
      const response = await fetch("/create-payment-intent", { method: "POST" });
      if (!response.ok) {
        messageEl.textContent = "Failed to create PaymentIntent.";
        return;
      }
      const { clientSecret } = await response.json();
      const stripe = Stripe(publishableKey);
      const elements = stripe.elements({ clientSecret });
      const paymentElement = elements.create("payment");
      paymentElement.mount("#payment-element");

      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        submitBtn.disabled = true;
        messageEl.textContent = "";

        const { error } = await stripe.confirmPayment({
          elements,
          confirmParams: {
            return_url: window.location.origin + "/complete",
          },
        });

        if (error) {
          messageEl.textContent = error.message ?? "Payment failed.";
          submitBtn.disabled = false;
        }
      });
    }

    initialize().catch((err) => {
      messageEl.textContent = err.message ?? "Failed to initialize payment form.";
    });
  </script>
</body>
</html>`
}

function completePageHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Payment complete</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 480px; margin: 2rem auto; padding: 0 1rem; }
  </style>
</head>
<body>
  <h1>Payment complete</h1>
  <p>Thank you! Your payment was submitted successfully.</p>
</body>
</html>`
}

/**
 * Local dev server for the embedded PaymentElement flow:
 * - `GET /` — mounts PaymentElement and confirms via `stripe.confirmPayment()`
 * - `POST /create-payment-intent` — creates a PaymentIntent, returns client_secret
 * - `GET /complete` — post-payment landing page
 * - `POST <webhookPath>` — verifies the Stripe signature and updates the store
 *
 * Webhook requests are always signature-verified: a request without a
 * `Stripe-Signature` header (or with an invalid signature) is rejected before
 * any store mutation.
 */
export function startPaymentServer(options: PaymentServerOptions = {}): Server {
  const port = options.port ?? Number(process.env.PORT || 4242)
  const webhookPath = options.webhookPath ?? "/webhooks/stripe"
  const storePath = options.storePath

  const publishableKey = getPublishableKey()
  if (!publishableKey) {
    throw new Error(
      "STRIPE_PUBLISHABLE_KEY is required for the payment server. Obtain it from the Stripe Dashboard (Developers → API keys).",
    )
  }

  const server = createServer(async (req, res) => {
    const url = req.url?.split("?")[0] ?? "/"

    if (req.method === "GET" && url === "/health") {
      res.writeHead(200, { "content-type": "application/json" })
      res.end(JSON.stringify({ ok: true }))
      return
    }

    if (req.method === "GET" && url === "/") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" })
      res.end(paymentPageHtml(publishableKey))
      return
    }

    if (req.method === "GET" && url === "/complete") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" })
      res.end(completePageHtml())
      return
    }

    if (req.method === "POST" && url === "/create-payment-intent") {
      try {
        const { paymentIntent, clientSecret } = await createPaymentIntent({
          amount: options.amount,
          currency: options.currency,
          sellerId: options.sellerId,
          storePath,
        })
        res.writeHead(200, { "content-type": "application/json" })
        res.end(
          JSON.stringify({
            paymentIntentId: paymentIntent.id,
            clientSecret,
            publishableKey,
          }),
        )
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.error("Failed to create PaymentIntent:", message)
        res.writeHead(500, { "content-type": "application/json" })
        res.end(JSON.stringify({ error: "failed_to_create_payment_intent" }))
      }
      return
    }

    if (req.method === "POST" && url === webhookPath) {
      const chunks: Buffer[] = []
      for await (const chunk of req) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
      }
      const payload = Buffer.concat(chunks)
      const signature = req.headers["stripe-signature"]
      const sig = Array.isArray(signature) ? signature[0] : signature
      if (typeof sig !== "string" || sig.length === 0) {
        res.writeHead(400, { "content-type": "application/json" })
        res.end(JSON.stringify({ error: "missing_stripe_signature" }))
        return
      }

      try {
        const event = constructWebhookEvent(payload, sig)
        const result = await handleStripeWebhookEvent(event, storePath)
        res.writeHead(200, { "content-type": "application/json" })
        res.end(JSON.stringify({ received: true, ...result }))
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.error("Webhook error:", message)
        res.writeHead(400, { "content-type": "application/json" })
        res.end(JSON.stringify({ error: "invalid_webhook_request" }))
      }
      return
    }

    res.writeHead(404, { "content-type": "application/json" })
    res.end(JSON.stringify({ error: "not_found" }))
  })

  server.listen(port)
  return server
}

/** Resolve the configured Stripe client (used to fail fast on missing keys). */
export function ensureStripeConfigured(): void {
  requireEnv("STRIPE_SECRET_KEY")
  getStripeClient()
}
