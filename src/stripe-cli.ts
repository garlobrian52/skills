import { defineCommand } from "citty"
import path from "path"
import {
  createAccount,
  createAccountLink,
  createCheckoutSession,
  createProduct,
  createSetupIntent,
  createSubscription,
  runEmbeddedPaymentsFlow,
  startWebhookServer,
  waitForAccountOnboard,
  waitForCheckoutComplete,
  waitForSubscriptionPaid,
} from "./stripe/index.js"

function resolveStatePath(args: { state?: string }): string | undefined {
  return args.state ? path.resolve(args.state) : undefined
}

function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2))
}

const createAccountCommand = defineCommand({
  meta: {
    name: "create-account",
    description:
      "Create a connected account that can accept payments and be charged subscription fees",
  },
  args: {
    state: {
      type: "string",
      description: "Path to the Stripe state file (default: ./.stripe-state.json)",
    },
    json: {
      type: "boolean",
      description: "Output result as JSON",
      default: false,
    },
  },
  async run({ args }) {
    const result = await createAccount(resolveStatePath(args))
    if (args.json) {
      printJson(result)
      return
    }
    console.log(`Created connected account: ${result.accountId}`)
  },
})

const createAccountLinkCommand = defineCommand({
  meta: {
    name: "create-account-link",
    description: "Create a Stripe-hosted onboarding link for a connected account",
  },
  args: {
    state: { type: "string" },
    json: { type: "boolean", default: false },
  },
  async run({ args }) {
    const result = await createAccountLink(resolveStatePath(args))
    if (args.json) {
      printJson(result)
      return
    }
    console.log(`Account onboarding link: ${result.accountLinkUrl}`)
  },
})

const waitForAccountOnboardCommand = defineCommand({
  meta: {
    name: "wait-for-account-onboard",
    description:
      "Poll until the connected account merchant capabilities are ready",
  },
  args: {
    state: { type: "string" },
    json: { type: "boolean", default: false },
  },
  async run({ args }) {
    const state = await waitForAccountOnboard(resolveStatePath(args))
    if (args.json) {
      printJson(state)
      return
    }
    console.log("Connected account onboarding complete.")
  },
})

const createCheckoutSessionCommand = defineCommand({
  meta: {
    name: "create-checkout-session",
    description:
      "Create a Checkout Session on the connected account with an application fee",
  },
  args: {
    state: { type: "string" },
    json: { type: "boolean", default: false },
  },
  async run({ args }) {
    const result = await createCheckoutSession(resolveStatePath(args))
    if (args.json) {
      printJson(result)
      return
    }
    console.log(`Checkout session: ${result.sessionId}`)
    console.log(`Checkout URL: ${result.checkoutUrl}`)
  },
})

const waitForCheckoutCommand = defineCommand({
  meta: {
    name: "wait-for-checkout",
    description: "Wait until checkout.session.completed is recorded",
  },
  args: {
    state: { type: "string" },
    json: { type: "boolean", default: false },
  },
  async run({ args }) {
    const state = await waitForCheckoutComplete(resolveStatePath(args))
    if (args.json) {
      printJson(state)
      return
    }
    console.log("Checkout payment complete.")
  },
})

const createProductCommand = defineCommand({
  meta: {
    name: "create-product",
    description: "Create a platform subscription product and default monthly price",
  },
  args: {
    state: { type: "string" },
    json: { type: "boolean", default: false },
  },
  async run({ args }) {
    const result = await createProduct(resolveStatePath(args))
    if (args.json) {
      printJson(result)
      return
    }
    console.log(`Product: ${result.productId}`)
    console.log(`Default price: ${result.defaultPriceId}`)
  },
})

const createSetupIntentCommand = defineCommand({
  meta: {
    name: "create-setup-intent",
    description:
      "Attach a stripe_balance payment method to the connected account",
  },
  args: {
    state: { type: "string" },
    json: { type: "boolean", default: false },
  },
  async run({ args }) {
    const result = await createSetupIntent(resolveStatePath(args))
    if (args.json) {
      printJson(result)
      return
    }
    console.log(`SetupIntent: ${result.setupIntentId}`)
    console.log(`Payment method: ${result.paymentMethodId}`)
  },
})

const createSubscriptionCommand = defineCommand({
  meta: {
    name: "create-subscription",
    description: "Charge the connected account a platform subscription fee",
  },
  args: {
    state: { type: "string" },
    json: { type: "boolean", default: false },
  },
  async run({ args }) {
    const result = await createSubscription(resolveStatePath(args))
    if (args.json) {
      printJson(result)
      return
    }
    console.log(`Subscription: ${result.subscriptionId}`)
  },
})

const waitForSubscriptionCommand = defineCommand({
  meta: {
    name: "wait-for-subscription",
    description: "Wait until invoice.payment_succeeded is recorded",
  },
  args: {
    state: { type: "string" },
    json: { type: "boolean", default: false },
  },
  async run({ args }) {
    const state = await waitForSubscriptionPaid(resolveStatePath(args))
    if (args.json) {
      printJson(state)
      return
    }
    console.log("Subscription invoice paid.")
  },
})

const webhookServerCommand = defineCommand({
  meta: {
    name: "webhook-server",
    description:
      "Start a local webhook server for Stripe Connect and Billing events",
  },
  args: {
    port: {
      type: "string",
      description: "Port to listen on (default: 4242 or STRIPE_WEBHOOK_PORT)",
    },
    state: { type: "string" },
  },
  async run({ args }) {
    const port = args.port ? Number(args.port) : undefined
    const handle = await startWebhookServer({
      port,
      statePath: resolveStatePath(args),
    })
    console.log(
      `Stripe webhook server listening on http://localhost:${handle.port}/webhooks/stripe`,
    )
    console.log(
      "Forward Stripe events with: stripe listen --forward-to localhost:" +
        `${handle.port}/webhooks/stripe`,
    )

    await new Promise<void>((resolve) => {
      const shutdown = () => {
        void handle.close().then(resolve)
      }
      process.on("SIGINT", shutdown)
      process.on("SIGTERM", shutdown)
    })
  },
})

const runFlowCommand = defineCommand({
  meta: {
    name: "run-flow",
    description:
      "Run the full embedded payments and subscriptions flow from the Stripe blueprint",
  },
  args: {
    state: { type: "string" },
  },
  async run({ args }) {
    await runEmbeddedPaymentsFlow(resolveStatePath(args))
  },
})

export default defineCommand({
  meta: {
    name: "stripe",
    description:
      "Stripe Connect embedded payments and subscriptions (Accounts v2)",
  },
  subCommands: {
    "create-account": createAccountCommand,
    "create-account-link": createAccountLinkCommand,
    "wait-for-account-onboard": waitForAccountOnboardCommand,
    "create-checkout-session": createCheckoutSessionCommand,
    "wait-for-checkout": waitForCheckoutCommand,
    "create-product": createProductCommand,
    "create-setup-intent": createSetupIntentCommand,
    "create-subscription": createSubscriptionCommand,
    "wait-for-subscription": waitForSubscriptionCommand,
    "webhook-server": webhookServerCommand,
    "run-flow": runFlowCommand,
  },
})
