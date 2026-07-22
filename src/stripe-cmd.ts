import { createServer } from "http"
import { defineCommand } from "citty"
import {
  attachBalancePaymentMethod,
  createAccountOnboardingLink,
  createConnectedAccount,
  createEmbeddedCheckoutSession,
  createPlatformSubscription,
  createSubscriptionPlan,
  constructWebhookEvent,
  defaultStorePath,
  getAccount,
  handleStripeWebhookEvent,
  loadEnvFile,
  loadStore,
  optionalEnv,
} from "./stripe/index.js"

async function withEnv<T>(fn: () => Promise<T>): Promise<T> {
  await loadEnvFile()
  return fn()
}

function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2))
}

const createAccountCmd = defineCommand({
  meta: {
    name: "create-account",
    description:
      "Create an Accounts v2 connected account (merchant + customer configurations)",
  },
  args: {
    seller: {
      type: "string",
      description: "Local seller id to associate with the Stripe account",
      required: true,
    },
    "display-name": {
      type: "string",
      description: "Display name for the connected account",
      default: "Test account",
    },
    email: {
      type: "string",
      description: "Contact email for the connected account",
      default: "testaccount@example.com",
    },
    country: {
      type: "string",
      description: "ISO country code (or set CONNECTED_ACCOUNT_COUNTRY)",
    },
    store: {
      type: "string",
      description: "Path to the local Stripe ID store JSON file",
    },
  },
  async run({ args }) {
    await withEnv(async () => {
      const record = await createConnectedAccount({
        sellerId: args.seller,
        displayName: args["display-name"],
        contactEmail: args.email,
        country: args.country,
        storePath: args.store,
      })
      printJson({
        ok: true,
        action: "create-account",
        sellerId: record.sellerId,
        accountId: record.accountId,
        store: args.store ?? defaultStorePath(),
      })
    })
  },
})

const createAccountLinkCmd = defineCommand({
  meta: {
    name: "create-account-link",
    description:
      "Create a Stripe-hosted onboarding link for KYC (merchant + customer)",
  },
  args: {
    seller: {
      type: "string",
      description: "Local seller id",
      required: true,
    },
    "return-url": {
      type: "string",
      description: "URL to redirect after onboarding completes",
    },
    "refresh-url": {
      type: "string",
      description: "URL to redirect when the account link expires",
    },
    store: {
      type: "string",
      description: "Path to the local Stripe ID store JSON file",
    },
  },
  async run({ args }) {
    await withEnv(async () => {
      const { record, url } = await createAccountOnboardingLink({
        sellerId: args.seller,
        returnUrl: args["return-url"],
        refreshUrl: args["refresh-url"],
        storePath: args.store,
      })
      printJson({
        ok: true,
        action: "create-account-link",
        sellerId: record.sellerId,
        accountId: record.accountId,
        url,
      })
    })
  },
})

const createCheckoutSessionCmd = defineCommand({
  meta: {
    name: "create-checkout-session",
    description:
      "Create a Checkout Session on the connected account with an application fee",
  },
  args: {
    seller: {
      type: "string",
      description: "Local seller id",
      required: true,
    },
    "success-url": {
      type: "string",
      description: "URL to redirect after successful payment",
    },
    "unit-amount": {
      type: "string",
      description: "Amount in the smallest currency unit (default 100000)",
    },
    "application-fee": {
      type: "string",
      description: "Application fee amount (default 123)",
    },
    currency: {
      type: "string",
      description: "Currency code (or set CURRENCY)",
    },
    store: {
      type: "string",
      description: "Path to the local Stripe ID store JSON file",
    },
  },
  async run({ args }) {
    await withEnv(async () => {
      const { record, session } = await createEmbeddedCheckoutSession({
        sellerId: args.seller,
        successUrl: args["success-url"],
        unitAmount: args["unit-amount"]
          ? Number(args["unit-amount"])
          : undefined,
        applicationFeeAmount: args["application-fee"]
          ? Number(args["application-fee"])
          : undefined,
        currency: args.currency,
        storePath: args.store,
      })
      printJson({
        ok: true,
        action: "create-checkout-session",
        sellerId: record.sellerId,
        accountId: record.accountId,
        checkoutSessionId: session.id,
        url: session.url,
      })
    })
  },
})

const createSubscriptionPlanCmd = defineCommand({
  meta: {
    name: "create-subscription-plan",
    description: "Create a platform subscription product and default monthly price",
  },
  args: {
    seller: {
      type: "string",
      description: "Optional local seller id to store product/price ids against",
    },
    name: {
      type: "string",
      description: "Product name",
      default: "Platform subscription",
    },
    "unit-amount": {
      type: "string",
      description: "Price amount in the smallest currency unit (default 1000)",
    },
    currency: {
      type: "string",
      description: "Currency code (or set CURRENCY)",
    },
    store: {
      type: "string",
      description: "Path to the local Stripe ID store JSON file",
    },
  },
  async run({ args }) {
    await withEnv(async () => {
      const { product, priceId, record } = await createSubscriptionPlan({
        sellerId: args.seller,
        name: args.name,
        unitAmount: args["unit-amount"]
          ? Number(args["unit-amount"])
          : undefined,
        currency: args.currency,
        storePath: args.store,
      })
      printJson({
        ok: true,
        action: "create-subscription-plan",
        productId: product.id,
        priceId,
        sellerId: record?.sellerId ?? null,
      })
    })
  },
})

const attachBalancePaymentMethodCmd = defineCommand({
  meta: {
    name: "attach-balance-payment-method",
    description:
      "Create a confirmed SetupIntent so the connected account pays via stripe_balance",
  },
  args: {
    seller: {
      type: "string",
      description: "Local seller id",
      required: true,
    },
    store: {
      type: "string",
      description: "Path to the local Stripe ID store JSON file",
    },
  },
  async run({ args }) {
    await withEnv(async () => {
      const { paymentMethodId, record, setupIntent } =
        await attachBalancePaymentMethod({
          sellerId: args.seller,
          storePath: args.store,
        })
      printJson({
        ok: true,
        action: "attach-balance-payment-method",
        sellerId: record.sellerId,
        setupIntentId: setupIntent.id,
        paymentMethodId,
      })
    })
  },
})

const createSubscriptionCmd = defineCommand({
  meta: {
    name: "create-subscription",
    description:
      "Create a platform subscription charged to the connected account balance",
  },
  args: {
    seller: {
      type: "string",
      description: "Local seller id",
      required: true,
    },
    price: {
      type: "string",
      description: "Price id override (defaults to stored price id)",
    },
    "payment-method": {
      type: "string",
      description: "Payment method id override (defaults to stored id)",
    },
    store: {
      type: "string",
      description: "Path to the local Stripe ID store JSON file",
    },
  },
  async run({ args }) {
    await withEnv(async () => {
      const { subscription, record } = await createPlatformSubscription({
        sellerId: args.seller,
        priceId: args.price,
        paymentMethodId: args["payment-method"],
        storePath: args.store,
      })
      printJson({
        ok: true,
        action: "create-subscription",
        sellerId: record.sellerId,
        subscriptionId: subscription.id,
        status: subscription.status,
      })
    })
  },
})

const showStatusCmd = defineCommand({
  meta: {
    name: "show-status",
    description: "Show persisted Stripe resource ids for a seller (or all)",
  },
  args: {
    seller: {
      type: "string",
      description: "Local seller id (omit to list all)",
    },
    store: {
      type: "string",
      description: "Path to the local Stripe ID store JSON file",
    },
  },
  async run({ args }) {
    await withEnv(async () => {
      if (args.seller) {
        const record = await getAccount(args.seller, args.store)
        if (!record) {
          console.error(`No record for seller "${args.seller}"`)
          process.exitCode = 1
          return
        }
        printJson(record)
        return
      }
      const store = await loadStore(args.store)
      printJson(store)
    })
  },
})

const handleWebhooksCmd = defineCommand({
  meta: {
    name: "handle-webhooks",
    description:
      "Start an HTTP server that verifies Stripe webhooks and updates the local store",
  },
  args: {
    port: {
      type: "string",
      description: "Port to listen on (default 4242)",
      default: "4242",
    },
    path: {
      type: "string",
      description: "Webhook path (default /webhooks/stripe)",
      default: "/webhooks/stripe",
    },
    store: {
      type: "string",
      description: "Path to the local Stripe ID store JSON file",
    },
  },
  async run({ args }) {
    await withEnv(async () => {
      const port = Number(args.port) || 4242
      const webhookPath = args.path || "/webhooks/stripe"
      const storePath = args.store

      const server = createServer(async (req, res) => {
        if (req.method === "GET" && req.url === "/health") {
          res.writeHead(200, { "content-type": "application/json" })
          res.end(JSON.stringify({ ok: true }))
          return
        }

        if (req.method !== "POST" || req.url?.split("?")[0] !== webhookPath) {
          res.writeHead(404, { "content-type": "application/json" })
          res.end(JSON.stringify({ error: "not_found" }))
          return
        }

        const chunks: Buffer[] = []
        for await (const chunk of req) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
        }
        const payload = Buffer.concat(chunks)
        const signature = req.headers["stripe-signature"]
        if (typeof signature !== "string") {
          res.writeHead(400, { "content-type": "application/json" })
          res.end(JSON.stringify({ error: "missing_stripe_signature" }))
          return
        }

        try {
          const event = constructWebhookEvent(payload, signature)
          const result = await handleStripeWebhookEvent(event, storePath)
          res.writeHead(200, { "content-type": "application/json" })
          res.end(JSON.stringify({ received: true, ...result }))
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          console.error("Webhook error:", message)
          res.writeHead(400, { "content-type": "application/json" })
          res.end(JSON.stringify({ error: message }))
        }
      })

      server.listen(port, () => {
        console.log(
          JSON.stringify({
            ok: true,
            action: "handle-webhooks",
            listening: `http://localhost:${port}${webhookPath}`,
            health: `http://localhost:${port}/health`,
            store: storePath ?? defaultStorePath(),
            currency: optionalEnv("CURRENCY", "usd"),
            events: [
              "v2.core.account[configuration.merchant].capability_status_updated",
              "checkout.session.completed",
              "invoice.payment_succeeded",
            ],
          }),
        )
      })
    })
  },
})

export default defineCommand({
  meta: {
    name: "stripe",
    description:
      "Stripe Accounts v2: onboard connected accounts, accept embedded payments, charge subscriptions",
  },
  subCommands: {
    "create-account": createAccountCmd,
    "create-account-link": createAccountLinkCmd,
    "create-checkout-session": createCheckoutSessionCmd,
    "create-subscription-plan": createSubscriptionPlanCmd,
    "attach-balance-payment-method": attachBalancePaymentMethodCmd,
    "create-subscription": createSubscriptionCmd,
    "show-status": showStatusCmd,
    "handle-webhooks": handleWebhooksCmd,
  },
})
