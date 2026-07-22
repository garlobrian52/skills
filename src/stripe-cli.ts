import { defineCommand } from "citty"
import { createStripeClient } from "./stripe/client.js"
import { createAccount } from "./stripe/create-account.js"
import { createAccountLink } from "./stripe/create-account-link.js"
import { createCheckoutSession } from "./stripe/create-checkout-session.js"
import { createProduct } from "./stripe/create-product.js"
import { createSetupIntent } from "./stripe/create-setup-intent.js"
import { createSubscription } from "./stripe/create-subscription.js"
import {
  constructWebhookEvent,
  handleStripeEvent,
} from "./stripe/webhooks.js"
import { defaultStorePath, loadStore } from "./stripe/store.js"
import { promises as fs } from "fs"

function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2))
}

function storePathFromArgs(args: { store?: string }): string {
  return args.store || defaultStorePath()
}

const createAccountCmd = defineCommand({
  meta: {
    name: "create-account",
    description:
      "Create a connected Stripe Account (v2) configured as merchant and customer",
  },
  args: {
    "display-name": {
      type: "string",
      description: "Account display name",
      default: "Test account",
    },
    email: {
      type: "string",
      description: "Contact email",
      default: "testaccount@example.com",
    },
    country: {
      type: "string",
      description: "Connected account country (CONNECTED_ACCOUNT_COUNTRY)",
    },
    phone: { type: "string", description: "Business phone", default: "0000000000" },
    "merchant-id": {
      type: "string",
      description: "Optional local merchant id to reuse",
    },
    store: { type: "string", description: "Path to local Stripe data store" },
    json: { type: "boolean", description: "Print JSON only", default: false },
  },
  async run({ args }) {
    const stripe = createStripeClient()
    const result = await createAccount(
      stripe,
      {
        displayName: args["display-name"],
        contactEmail: args.email,
        country: args.country,
        phone: args.phone,
        merchantId: args["merchant-id"],
      },
      storePathFromArgs(args),
    )
    if (args.json) {
      printJson({
        accountId: result.account.id,
        merchantId: result.merchant.id,
        account: result.account,
        merchant: result.merchant,
      })
      return
    }
    console.log(`Created account ${result.account.id}`)
    console.log(`Local merchant id: ${result.merchant.id}`)
    console.log(`Store: ${storePathFromArgs(args)}`)
  },
})

const createAccountLinkCmd = defineCommand({
  meta: {
    name: "create-account-link",
    description: "Create an onboarding Account Link for KYC collection",
  },
  args: {
    "merchant-id": { type: "string", description: "Local merchant id" },
    "account-id": { type: "string", description: "Stripe account id" },
    "return-url": { type: "string", description: "Onboarding return URL" },
    "refresh-url": { type: "string", description: "Onboarding refresh URL" },
    store: { type: "string", description: "Path to local Stripe data store" },
    json: { type: "boolean", description: "Print JSON only", default: false },
  },
  async run({ args }) {
    const stripe = createStripeClient()
    const result = await createAccountLink(
      stripe,
      {
        merchantId: args["merchant-id"],
        accountId: args["account-id"],
        returnUrl: args["return-url"],
        refreshUrl: args["refresh-url"],
      },
      storePathFromArgs(args),
    )
    if (args.json) {
      printJson({
        url: result.accountLink.url,
        account: result.accountLink.account,
        merchant: result.merchant,
        accountLink: result.accountLink,
      })
      return
    }
    console.log(`Onboarding URL: ${result.accountLink.url}`)
    console.log(`Account: ${result.accountLink.account}`)
  },
})

const createCheckoutSessionCmd = defineCommand({
  meta: {
    name: "create-checkout-session",
    description:
      "Create a Checkout Session on the connected account with an application fee",
  },
  args: {
    "merchant-id": { type: "string", description: "Local merchant id" },
    "account-id": { type: "string", description: "Stripe account id" },
    "success-url": { type: "string", description: "Checkout success URL" },
    currency: { type: "string", description: "Currency (CURRENCY env)" },
    "unit-amount": {
      type: "string",
      description: "Amount in smallest currency unit (default 100000)",
    },
    "application-fee-amount": {
      type: "string",
      description: "Platform application fee (default 123)",
    },
    "product-name": { type: "string", description: "Line item product name" },
    store: { type: "string", description: "Path to local Stripe data store" },
    json: { type: "boolean", description: "Print JSON only", default: false },
  },
  async run({ args }) {
    const stripe = createStripeClient()
    const result = await createCheckoutSession(
      stripe,
      {
        merchantId: args["merchant-id"],
        accountId: args["account-id"],
        successUrl: args["success-url"],
        currency: args.currency,
        unitAmount: args["unit-amount"]
          ? Number(args["unit-amount"])
          : undefined,
        applicationFeeAmount: args["application-fee-amount"]
          ? Number(args["application-fee-amount"])
          : undefined,
        productName: args["product-name"],
      },
      storePathFromArgs(args),
    )
    if (args.json) {
      printJson({
        sessionId: result.session.id,
        url: result.session.url,
        merchant: result.merchant,
        session: result.session,
      })
      return
    }
    console.log(`Checkout session: ${result.session.id}`)
    console.log(`Pay URL: ${result.session.url}`)
  },
})

const createProductCmd = defineCommand({
  meta: {
    name: "create-product",
    description: "Create a platform subscription product and default price",
  },
  args: {
    name: {
      type: "string",
      description: "Product name",
      default: "Platform subscription",
    },
    currency: { type: "string", description: "Currency (CURRENCY env)" },
    "unit-amount": {
      type: "string",
      description: "Recurring amount in smallest currency unit (default 1000)",
    },
    interval: {
      type: "string",
      description: "Billing interval (default month)",
      default: "month",
    },
    "merchant-id": {
      type: "string",
      description: "Associate price with local merchant",
    },
    store: { type: "string", description: "Path to local Stripe data store" },
    json: { type: "boolean", description: "Print JSON only", default: false },
  },
  async run({ args }) {
    const stripe = createStripeClient()
    const interval = (args.interval || "month") as
      | "day"
      | "week"
      | "month"
      | "year"
    const result = await createProduct(
      stripe,
      {
        name: args.name,
        currency: args.currency,
        unitAmount: args["unit-amount"]
          ? Number(args["unit-amount"])
          : undefined,
        interval,
        merchantId: args["merchant-id"],
      },
      storePathFromArgs(args),
    )
    if (args.json) {
      printJson({
        productId: result.product.id,
        priceId: result.priceId,
        merchant: result.merchant,
        product: result.product,
      })
      return
    }
    console.log(`Product: ${result.product.id}`)
    console.log(`Default price: ${result.priceId}`)
  },
})

const createSetupIntentCmd = defineCommand({
  meta: {
    name: "create-setup-intent",
    description:
      "Attach stripe_balance as the connected account's default payment method",
  },
  args: {
    "merchant-id": { type: "string", description: "Local merchant id" },
    "account-id": { type: "string", description: "Stripe account id" },
    store: { type: "string", description: "Path to local Stripe data store" },
    json: { type: "boolean", description: "Print JSON only", default: false },
  },
  async run({ args }) {
    const stripe = createStripeClient()
    const result = await createSetupIntent(
      stripe,
      {
        merchantId: args["merchant-id"],
        accountId: args["account-id"],
      },
      storePathFromArgs(args),
    )
    if (args.json) {
      printJson({
        setupIntentId: result.setupIntent.id,
        paymentMethodId: result.paymentMethodId,
        merchant: result.merchant,
        setupIntent: result.setupIntent,
      })
      return
    }
    console.log(`SetupIntent: ${result.setupIntent.id}`)
    console.log(`Payment method: ${result.paymentMethodId}`)
  },
})

const createSubscriptionCmd = defineCommand({
  meta: {
    name: "create-subscription",
    description:
      "Create a subscription charging the connected account via stripe_balance",
  },
  args: {
    "merchant-id": { type: "string", description: "Local merchant id" },
    "account-id": { type: "string", description: "Stripe account id" },
    "price-id": { type: "string", description: "Stripe price id" },
    "payment-method-id": {
      type: "string",
      description: "Stripe payment method id",
    },
    quantity: { type: "string", description: "Quantity", default: "1" },
    store: { type: "string", description: "Path to local Stripe data store" },
    json: { type: "boolean", description: "Print JSON only", default: false },
  },
  async run({ args }) {
    const stripe = createStripeClient()
    const result = await createSubscription(
      stripe,
      {
        merchantId: args["merchant-id"],
        accountId: args["account-id"],
        priceId: args["price-id"],
        paymentMethodId: args["payment-method-id"],
        quantity: args.quantity ? Number(args.quantity) : 1,
      },
      storePathFromArgs(args),
    )
    if (args.json) {
      printJson({
        subscriptionId: result.subscription.id,
        status: result.subscription.status,
        merchant: result.merchant,
        subscription: result.subscription,
      })
      return
    }
    console.log(`Subscription: ${result.subscription.id}`)
    console.log(`Status: ${result.subscription.status}`)
  },
})

const listMerchantsCmd = defineCommand({
  meta: {
    name: "list-merchants",
    description: "List locally persisted connected merchants and Stripe IDs",
  },
  args: {
    store: { type: "string", description: "Path to local Stripe data store" },
    json: { type: "boolean", description: "Print JSON only", default: false },
  },
  async run({ args }) {
    const store = await loadStore(storePathFromArgs(args))
    if (args.json) {
      printJson(store)
      return
    }
    if (store.merchants.length === 0) {
      console.log("No merchants in store.")
      return
    }
    for (const m of store.merchants) {
      console.log(
        `${m.id}  account=${m.stripeAccountId ?? "-"}  sub=${m.stripeSubscriptionId ?? "-"}  ${m.displayName}`,
      )
    }
  },
})

const handleWebhookCmd = defineCommand({
  meta: {
    name: "handle-webhook",
    description:
      "Verify and handle a Stripe webhook payload (checkout / account / invoice events)",
  },
  args: {
    payload: {
      type: "string",
      description: "Path to raw webhook body file (use - for stdin)",
      required: true,
    },
    signature: {
      type: "string",
      description: "Stripe-Signature header value",
      required: true,
    },
    secret: {
      type: "string",
      description: "Webhook signing secret (STRIPE_WEBHOOK_SECRET)",
    },
    store: { type: "string", description: "Path to local Stripe data store" },
    json: { type: "boolean", description: "Print JSON only", default: false },
  },
  async run({ args }) {
    const stripe = createStripeClient()
    const raw =
      args.payload === "-"
        ? await readStdin()
        : await fs.readFile(args.payload)
    const event = constructWebhookEvent(
      stripe,
      raw,
      args.signature,
      args.secret || process.env.STRIPE_WEBHOOK_SECRET,
    )
    const result = await handleStripeEvent(
      event as { type: string; data?: { object?: unknown }; related_object?: unknown },
      storePathFromArgs(args),
    )
    if (args.json) {
      printJson({ eventType: event.type, result })
      return
    }
    console.log(
      `${result.handled ? "Handled" : "Ignored"} ${result.eventType}` +
        (result.detail ? `: ${result.detail}` : ""),
    )
  },
})

async function readStdin(): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}

export default defineCommand({
  meta: {
    name: "stripe",
    description:
      "Embedded payments and platform subscriptions via Stripe Accounts v2",
  },
  subCommands: {
    "create-account": createAccountCmd,
    "create-account-link": createAccountLinkCmd,
    "create-checkout-session": createCheckoutSessionCmd,
    "create-product": createProductCmd,
    "create-setup-intent": createSetupIntentCmd,
    "create-subscription": createSubscriptionCmd,
    "list-merchants": listMerchantsCmd,
    "handle-webhook": handleWebhookCmd,
  },
})
