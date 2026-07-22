import { defineCommand } from "citty"
import { createAccount, createAccountLink } from "./accounts.js"
import { createCheckoutSession } from "./payments.js"
import {
  attachBalancePaymentMethod,
  createSellerSubscription,
  createSubscriptionProduct,
} from "./subscriptions.js"
import { startPaymentsServer } from "./http.js"
import { loadStore } from "./store.js"

function printJson(data: unknown): void {
  console.log(JSON.stringify(data, null, 2))
}

const createAccountCmd = defineCommand({
  meta: {
    name: "create-account",
    description:
      "Create a connected Account (v2) configured as merchant + customer",
  },
  args: {
    displayName: {
      type: "string",
      description: "Display name for the account",
      default: "Test account",
    },
    email: {
      type: "string",
      description: "Contact email",
      default: "testaccount@example.com",
    },
    country: {
      type: "string",
      description: "Connected account country (ISO). Defaults to CONNECTED_ACCOUNT_COUNTRY or US",
    },
  },
  async run({ args }) {
    const { seller, account } = await createAccount({
      displayName: args.displayName,
      contactEmail: args.email,
      country: args.country,
    })
    printJson({
      sellerId: seller.id,
      accountId: account.id,
      seller,
    })
  },
})

const createAccountLinkCmd = defineCommand({
  meta: {
    name: "create-account-link",
    description: "Create a hosted onboarding Account Link for KYC",
  },
  args: {
    sellerId: { type: "string", description: "Local seller id" },
    account: {
      type: "string",
      description: "Stripe account id (acct_...)",
      alias: "a",
    },
  },
  async run({ args }) {
    const result = await createAccountLink({
      sellerId: args.sellerId,
      stripeAccountId: args.account,
    })
    printJson({
      url: result.url,
      accountId: result.stripeAccountId,
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
    sellerId: { type: "string", description: "Local seller id" },
    account: {
      type: "string",
      description: "Stripe account id (acct_...)",
      alias: "a",
    },
    amount: {
      type: "string",
      description: "Unit amount in smallest currency unit (default 100000)",
    },
    fee: {
      type: "string",
      description: "Application fee amount (default 123)",
    },
  },
  async run({ args }) {
    const result = await createCheckoutSession({
      sellerId: args.sellerId,
      stripeAccountId: args.account,
      unitAmount: args.amount ? Number(args.amount) : undefined,
      applicationFeeAmount: args.fee ? Number(args.fee) : undefined,
    })
    printJson({
      url: result.session.url,
      sessionId: result.session.id,
      checkout: result.checkout,
    })
  },
})

const createSubscriptionProductCmd = defineCommand({
  meta: {
    name: "create-subscription-product",
    description: "Create the platform subscription product and default price",
  },
  args: {
    name: {
      type: "string",
      description: "Product name",
      default: "Platform subscription",
    },
    amount: {
      type: "string",
      description: "Unit amount in smallest currency unit (default 1000)",
    },
  },
  async run({ args }) {
    const result = await createSubscriptionProduct({
      name: args.name,
      unitAmount: args.amount ? Number(args.amount) : undefined,
    })
    printJson({
      plan: result.plan,
      productId: result.product.id,
      priceId: result.plan.stripePriceId,
    })
  },
})

const attachBalancePaymentMethodCmd = defineCommand({
  meta: {
    name: "attach-balance-payment-method",
    description:
      "Attach stripe_balance as the default payment method for a connected account",
  },
  args: {
    sellerId: { type: "string", description: "Local seller id" },
    account: {
      type: "string",
      description: "Stripe account id (acct_...)",
      alias: "a",
    },
  },
  async run({ args }) {
    const result = await attachBalancePaymentMethod({
      sellerId: args.sellerId,
      stripeAccountId: args.account,
    })
    printJson({
      paymentMethodId: result.paymentMethodId,
      setupIntentId: result.setupIntent.id,
      accountId: result.stripeAccountId,
    })
  },
})

const createSubscriptionCmd = defineCommand({
  meta: {
    name: "create-subscription",
    description:
      "Create a platform subscription charged from the connected account balance",
  },
  args: {
    sellerId: { type: "string", description: "Local seller id" },
    account: {
      type: "string",
      description: "Stripe account id (acct_...)",
      alias: "a",
    },
    paymentMethod: {
      type: "string",
      description: "Payment method id (from attach-balance-payment-method)",
    },
    price: {
      type: "string",
      description: "Stripe price id (defaults to latest stored plan)",
    },
  },
  async run({ args }) {
    const result = await createSellerSubscription({
      sellerId: args.sellerId,
      stripeAccountId: args.account,
      paymentMethodId: args.paymentMethod,
      priceId: args.price,
    })
    printJson({
      subscription: result.subscription,
      stripeSubscriptionId: result.stripeSubscription.id,
      status: result.stripeSubscription.status,
    })
  },
})

const showStoreCmd = defineCommand({
  meta: {
    name: "show-store",
    description: "Print persisted Stripe resource mappings",
  },
  async run() {
    printJson(await loadStore())
  },
})

const serveCmd = defineCommand({
  meta: {
    name: "serve",
    description:
      "Start the local payments API + Stripe webhook server (default :4242)",
  },
  args: {
    port: {
      type: "string",
      description: "Port to listen on",
      default: "4242",
    },
  },
  async run({ args }) {
    const port = Number(args.port)
    const server = await startPaymentsServer({ port })
    const addr = server.address()
    const shown =
      typeof addr === "object" && addr
        ? `http://localhost:${addr.port}`
        : `port ${port}`
    console.log(`Stripe payments server listening on ${shown}`)
    console.log("Routes:")
    console.log("  POST /create-account")
    console.log("  POST /create-account-link")
    console.log("  POST /create-checkout-session")
    console.log("  POST /create-subscription-product")
    console.log("  POST /attach-balance-payment-method")
    console.log("  POST /create-subscription")
    console.log("  POST /webhooks/stripe")
    console.log("  GET  /store")
    console.log("  GET  /health")
  },
})

export default defineCommand({
  meta: {
    name: "stripe",
    description:
      "Embedded payments & platform subscriptions via Stripe Accounts v2",
  },
  subCommands: {
    "create-account": createAccountCmd,
    "create-account-link": createAccountLinkCmd,
    "create-checkout-session": createCheckoutSessionCmd,
    "create-subscription-product": createSubscriptionProductCmd,
    "attach-balance-payment-method": attachBalancePaymentMethodCmd,
    "create-subscription": createSubscriptionCmd,
    "show-store": showStoreCmd,
    serve: serveCmd,
  },
})
