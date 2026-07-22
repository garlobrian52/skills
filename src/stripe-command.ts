import { defineCommand } from "citty"
import { loadStripeConfig } from "./stripe/config.js"
import { StripeStore } from "./stripe/store.js"
import { createAccount } from "./stripe/create-account.js"
import { createAccountLink } from "./stripe/create-account-link.js"
import { waitForAccountOnboard } from "./stripe/wait-for-account-onboard.js"
import { createCheckoutSession } from "./stripe/create-checkout-session.js"
import { waitForCheckout } from "./stripe/wait-for-checkout.js"
import { createProduct } from "./stripe/create-product.js"
import { createSetupIntent } from "./stripe/create-setup-intent.js"
import { createSubscription } from "./stripe/create-subscription.js"
import { waitForSubscription } from "./stripe/wait-for-subscription.js"
import { runEmbeddedPaymentsFlow } from "./stripe/run-embedded-payments-flow.js"

function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2))
}

function createStripeContext(args: {
  store?: string
  currency?: string
  country?: string
}) {
  const config = loadStripeConfig({
    storePath: args.store,
    currency: args.currency,
    connectedAccountCountry: args.country,
  })
  const store = new StripeStore(config.storePath)
  return { config, store }
}

const createAccountCommand = defineCommand({
  meta: {
    name: "create-account",
    description:
      "Create a connected account (merchant + customer) using Stripe Accounts v2",
  },
  args: {
    store: {
      type: "string",
      description: "Path to the Stripe resource ID store (default: .stripe-store.json)",
    },
    country: {
      type: "string",
      description: "Connected account country (default: CONNECTED_ACCOUNT_COUNTRY or us)",
    },
    json: {
      type: "boolean",
      description: "Output result as JSON",
      default: false,
    },
  },
  async run({ args }) {
    const { config, store } = createStripeContext(args)
    const result = await createAccount(config, store)
    if (args.json) {
      printJson({ accountId: result.account.id, account: result.account })
      return
    }
    console.log(`Created connected account: ${result.account.id}`)
  },
})

const createAccountLinkCommand = defineCommand({
  meta: {
    name: "create-account-link",
    description: "Create an account onboarding link for a connected account",
  },
  args: {
    store: { type: "string", description: "Path to the Stripe resource ID store" },
    json: { type: "boolean", default: false },
  },
  async run({ args }) {
    const { config, store } = createStripeContext(args)
    const result = await createAccountLink(config, store)
    if (args.json) {
      printJson({
        accountLinkUrl: result.accountLink.url,
        accountLink: result.accountLink,
      })
      return
    }
    console.log(`Account onboarding link: ${result.accountLink.url}`)
  },
})

const waitForAccountOnboardCommand = defineCommand({
  meta: {
    name: "wait-for-account-onboard",
    description: "Poll until the connected account merchant capability is active",
  },
  args: {
    store: { type: "string", description: "Path to the Stripe resource ID store" },
    json: { type: "boolean", default: false },
  },
  async run({ args }) {
    const { config, store } = createStripeContext(args)
    const result = await waitForAccountOnboard(config, store)
    if (args.json) {
      printJson({ accountId: result.account.id, account: result.account })
      return
    }
    console.log(`Account ${result.account.id} is onboarded.`)
  },
})

const createCheckoutSessionCommand = defineCommand({
  meta: {
    name: "create-checkout-session",
    description: "Create a Checkout Session on a connected account",
  },
  args: {
    store: { type: "string", description: "Path to the Stripe resource ID store" },
    currency: { type: "string", description: "Checkout currency (default: CURRENCY or usd)" },
    json: { type: "boolean", default: false },
  },
  async run({ args }) {
    const { config, store } = createStripeContext(args)
    const result = await createCheckoutSession(config, store)
    if (args.json) {
      printJson({
        checkoutSessionId: result.session.id,
        checkoutSessionUrl: result.session.url,
        session: result.session,
      })
      return
    }
    console.log(`Checkout session: ${result.session.id}`)
    if (result.session.url) {
      console.log(`Pay at: ${result.session.url}`)
    }
  },
})

const waitForCheckoutCommand = defineCommand({
  meta: {
    name: "wait-for-checkout",
    description: "Poll until a checkout session payment completes",
  },
  args: {
    store: { type: "string", description: "Path to the Stripe resource ID store" },
    json: { type: "boolean", default: false },
  },
  async run({ args }) {
    const { config, store } = createStripeContext(args)
    const result = await waitForCheckout(config, store)
    if (args.json) {
      printJson({
        checkoutSessionId: result.session.id,
        paymentStatus: result.session.payment_status,
        session: result.session,
      })
      return
    }
    console.log(`Checkout ${result.session.id} completed (${result.session.payment_status}).`)
  },
})

const createProductCommand = defineCommand({
  meta: {
    name: "create-product",
    description: "Create a subscription product with a default monthly price",
  },
  args: {
    store: { type: "string", description: "Path to the Stripe resource ID store" },
    currency: { type: "string", description: "Price currency (default: CURRENCY or usd)" },
    json: { type: "boolean", default: false },
  },
  async run({ args }) {
    const { config, store } = createStripeContext(args)
    const result = await createProduct(config, store)
    const defaultPriceId =
      typeof result.product.default_price === "string"
        ? result.product.default_price
        : result.product.default_price?.id
    if (args.json) {
      printJson({
        productId: result.product.id,
        defaultPriceId,
        product: result.product,
      })
      return
    }
    console.log(`Created product ${result.product.id} (price: ${defaultPriceId})`)
  },
})

const createSetupIntentCommand = defineCommand({
  meta: {
    name: "create-setup-intent",
    description: "Attach a stripe_balance payment method to the connected account",
  },
  args: {
    store: { type: "string", description: "Path to the Stripe resource ID store" },
    json: { type: "boolean", default: false },
  },
  async run({ args }) {
    const { config, store } = createStripeContext(args)
    const result = await createSetupIntent(config, store)
    const paymentMethodId =
      typeof result.setupIntent.payment_method === "string"
        ? result.setupIntent.payment_method
        : result.setupIntent.payment_method?.id
    if (args.json) {
      printJson({
        setupIntentId: result.setupIntent.id,
        paymentMethodId,
        setupIntent: result.setupIntent,
      })
      return
    }
    console.log(`SetupIntent ${result.setupIntent.id} confirmed (payment method: ${paymentMethodId})`)
  },
})

const createSubscriptionCommand = defineCommand({
  meta: {
    name: "create-subscription",
    description: "Charge a platform subscription fee from the connected account balance",
  },
  args: {
    store: { type: "string", description: "Path to the Stripe resource ID store" },
    json: { type: "boolean", default: false },
  },
  async run({ args }) {
    const { config, store } = createStripeContext(args)
    const result = await createSubscription(config, store)
    if (args.json) {
      printJson({
        subscriptionId: result.subscription.id,
        subscription: result.subscription,
      })
      return
    }
    console.log(`Created subscription: ${result.subscription.id}`)
  },
})

const waitForSubscriptionCommand = defineCommand({
  meta: {
    name: "wait-for-subscription",
    description: "Poll until the subscription invoice is paid",
  },
  args: {
    store: { type: "string", description: "Path to the Stripe resource ID store" },
    json: { type: "boolean", default: false },
  },
  async run({ args }) {
    const { config, store } = createStripeContext(args)
    const result = await waitForSubscription(config, store)
    if (args.json) {
      printJson({
        subscriptionId: result.subscription.id,
        invoiceId: result.invoice?.id ?? null,
        subscription: result.subscription,
        invoice: result.invoice,
      })
      return
    }
    console.log(`Subscription ${result.subscription.id} is active and paid.`)
  },
})

const runFlowCommand = defineCommand({
  meta: {
    name: "run",
    description:
      "Run the full embedded payments and subscriptions flow (create account through subscription)",
  },
  args: {
    store: { type: "string", description: "Path to the Stripe resource ID store" },
    currency: { type: "string", description: "Currency for checkout and subscription prices" },
    country: { type: "string", description: "Connected account country" },
    "skip-onboarding-wait": {
      type: "boolean",
      description: "Skip polling for account onboarding completion",
      default: false,
    },
    "skip-checkout-wait": {
      type: "boolean",
      description: "Skip polling for checkout completion (use when paying manually)",
      default: false,
    },
    "skip-subscription-wait": {
      type: "boolean",
      description: "Skip polling for subscription invoice payment",
      default: false,
    },
    json: { type: "boolean", default: false },
  },
  async run({ args }) {
    const { config, store } = createStripeContext(args)
    const result = await runEmbeddedPaymentsFlow(config, store, {
      skipOnboardingWait: args["skip-onboarding-wait"],
      skipCheckoutWait: args["skip-checkout-wait"],
      skipSubscriptionWait: args["skip-subscription-wait"],
    })

    if (args.json) {
      printJson(result)
      return
    }

    console.log("Embedded payments flow completed:")
    console.log(`  Account:      ${result.accountId}`)
    if (result.accountLinkUrl) {
      console.log(`  Onboarding:   ${result.accountLinkUrl}`)
    }
    if (result.checkoutSessionUrl) {
      console.log(`  Checkout:     ${result.checkoutSessionUrl}`)
    }
    console.log(`  Product:      ${result.productId}`)
    console.log(`  Subscription: ${result.subscriptionId}`)
  },
})

export default defineCommand({
  meta: {
    name: "stripe",
    description:
      "Stripe Connect embedded payments and subscriptions (Accounts v2 blueprint)",
  },
  subCommands: {
    "create-account": () => createAccountCommand,
    "create-account-link": () => createAccountLinkCommand,
    "wait-for-account-onboard": () => waitForAccountOnboardCommand,
    "create-checkout-session": () => createCheckoutSessionCommand,
    "wait-for-checkout": () => waitForCheckoutCommand,
    "create-product": () => createProductCommand,
    "create-setup-intent": () => createSetupIntentCommand,
    "create-subscription": () => createSubscriptionCommand,
    "wait-for-subscription": () => waitForSubscriptionCommand,
    run: () => runFlowCommand,
  },
})
