import http from "node:http"
import { createPaymentIntent } from "./create-payment-intent.js"
import { getStripePublishableKey } from "./config.js"
import { handlePaymentsWebhook } from "./handle-webhook.js"
import { getStripeClient } from "./client.js"
import { PaymentsStore } from "./store.js"

export interface PaymentServerOptions {
  port?: number
  webhookPath?: string
  store?: PaymentsStore
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
 * Local dev server for the PaymentElement flow:
 * - POST /create-payment-intent — creates a PaymentIntent and returns client_secret
 * - GET / — mounts PaymentElement and confirms via stripe.confirmPayment()
 * - POST /webhook — handles payment_intent.succeeded and other events
 */
export function startPaymentServer(
  options: PaymentServerOptions = {},
): http.Server {
  const port = options.port ?? Number(process.env.PORT || 4242)
  const webhookPath = options.webhookPath ?? "/webhook"
  const store = options.store ?? new PaymentsStore()
  const publishableKey = getStripePublishableKey()

  if (!publishableKey) {
    throw new Error(
      "STRIPE_PUBLISHABLE_KEY is required. Obtain it from the Stripe Dashboard (Developers → API keys).",
    )
  }

  const server = http.createServer(async (req, res) => {
    const url = req.url?.split("?")[0] ?? "/"

    if (req.method === "GET" && url === "/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" })
      res.end(paymentPageHtml(publishableKey))
      return
    }

    if (req.method === "GET" && url === "/complete") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" })
      res.end(completePageHtml())
      return
    }

    if (req.method === "POST" && url === "/create-payment-intent") {
      try {
        const { paymentIntent } = await createPaymentIntent({}, { store })
        res.writeHead(200, { "Content-Type": "application/json" })
        res.end(
          JSON.stringify({
            paymentIntentId: paymentIntent.id,
            clientSecret: paymentIntent.client_secret,
            publishableKey,
          }),
        )
      } catch (err) {
        console.error("Failed to create PaymentIntent", err)
        res.writeHead(500, { "Content-Type": "application/json" })
        res.end(JSON.stringify({ error: "Failed to create PaymentIntent." }))
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

      try {
        const result = await handlePaymentsWebhook(payload, sig, {
          stripe: getStripeClient(),
          store,
        })
        res.writeHead(200, { "Content-Type": "application/json" })
        res.end(JSON.stringify(result))
      } catch (err) {
        console.error("Failed to handle webhook", err)
        res.writeHead(400, { "Content-Type": "application/json" })
        res.end(JSON.stringify({ error: "Invalid webhook request." }))
      }
      return
    }

    res.writeHead(404, { "Content-Type": "application/json" })
    res.end(JSON.stringify({ error: "not_found" }))
  })

  server.listen(port)
  return server
}
