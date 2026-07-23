import { defineCommand } from "citty"
import { createAccount } from "./payments/create-account.js"
import { createAccountLink } from "./payments/create-account-link.js"
import { createCheckoutSession } from "./payments/create-checkout-session.js"
import { createPaymentIntent } from "./payments/create-payment-intent.js"
import { createSubscriptionProduct } from "./payments/create-subscription-product.js"
import { attachBalancePaymentMethod } from "./payments/attach-balance-payment-method.js"
import { createSubscription } from "./payments/create-subscription.js"
import { startWebhookServer } from "./payments/webhook-server.js"
import { startPaymentServer } from "./payments/payment-server.js"
import { PaymentsStore } from "./payments/store.js"
import { getPaymentsStorePath, getStripePublishableKey } from "./payments/config.js"

function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2))
}

const createAccountCmd = defineCommand({
  meta: {
    name: "create-account",
    description:
      "Create a connected Account (v2) as merchant + customer and persist its ID",
  },
  args: {
    displayName: {
      type: "string",
      description: "Display name for the connected account",
      default: "Test account",
    },
    email: {
      type: "string",
      description: "Contact email",
      default: "testaccount@example.com",
    },
    country: {
      type: "string",
      description: "Identity country (ISO 3166-1 alpha-2). Defaults to CONNECTED_ACCOUNT_COUNTRY or US",
    },
    phone: {
      type: "string",
      description: "Business phone",
      default: "0000000000",
    },
    sellerId: {
      type: "string",
      description: "Optional local seller ID to upsert",
    },
    json: {
      type: "boolean",
      description: "Print machine-readable JSON",
      default: false,
    },
  },
  async run({ args }) {
    const { seller, account } = await createAccount({
      displayName: args.displayName,
      contactEmail: args.email,
      country: args.country,
      phone: args.phone,
      sellerId: args.sellerId,
    })
    if (args.json) {
      printJson({ seller, accountId: account.id })
      return
    }
    console.log(`Created seller ${seller.id}`)
    console.log(`  stripeAccountId: ${seller.stripeAccountId}`)
    console.log(`  store: ${getPaymentsStorePath()}`)
  },
})

const createAccountLinkCmd = defineCommand({
  meta: {
    name: "create-account-link",
    description: "Create a hosted onboarding Account Link for a seller",
  },
  args: {
    seller: { type: "string", required: true, description: "Local seller ID" },
    returnUrl: { type: "string", description: "Return URL after onboarding" },
    refreshUrl: { type: "string", description: "Refresh URL if the link expires" },
    json: { type: "boolean", default: false, description: "Print JSON" },
  },
  async run({ args }) {
    const { seller, accountLink } = await createAccountLink({
      sellerId: args.seller,
      returnUrl: args.returnUrl,
      refreshUrl: args.refreshUrl,
    })
    if (args.json) {
      printJson({ seller, url: accountLink.url, expiresAt: accountLink.expires_at })
      return
    }
    console.log(`Account link for ${seller.id}:`)
    console.log(`  ${accountLink.url}`)
  },
})

const createCheckoutSessionCmd = defineCommand({
  meta: {
    name: "create-checkout-session",
    description:
      "Create a Checkout Session on the connected account (direct charge + application fee)",
  },
  args: {
    seller: { type: "string", required: true, description: "Local seller ID" },
    successUrl: { type: "string", description: "Success redirect URL" },
    productName: { type: "string", default: "Cookie", description: "Line item name" },
    unitAmount: {
      type: "string",
      description: "Unit amount in minor units (default 100000)",
    },
    applicationFeeAmount: {
      type: "string",
      description: "Application fee in minor units (default 123)",
    },
    currency: { type: "string", description: "Currency (default STRIPE_CURRENCY/usd)" },
    json: { type: "boolean", default: false, description: "Print JSON" },
  },
  async run({ args }) {
    const { seller, session } = await createCheckoutSession({
      sellerId: args.seller,
      successUrl: args.successUrl,
      productName: args.productName,
      unitAmount: args.unitAmount ? Number(args.unitAmount) : undefined,
      applicationFeeAmount: args.applicationFeeAmount
        ? Number(args.applicationFeeAmount)
        : undefined,
      currency: args.currency,
    })
    if (args.json) {
      printJson({
        seller,
        sessionId: session.id,
        url: session.url,
        publishableKey: getStripePublishableKey() ?? null,
      })
      return
    }
    console.log(`Checkout session ${session.id} for seller ${seller.id}`)
    console.log(`  url: ${session.url}`)
  },
})

const createPaymentIntentCmd = defineCommand({
  meta: {
    name: "create-payment-intent",
    description:
      "Create a PaymentIntent on the connected account (direct charge + application fee)",
  },
  args: {
    seller: { type: "string", required: true, description: "Local seller ID" },
    amount: {
      type: "string",
      description: "Amount in minor units (default 2000)",
    },
    applicationFeeAmount: {
      type: "string",
      description: "Application fee in minor units (default 123)",
    },
    currency: { type: "string", description: "Currency (default STRIPE_CURRENCY/usd)" },
    json: { type: "boolean", default: false, description: "Print JSON" },
  },
  async run({ args }) {
    const { seller, paymentIntent } = await createPaymentIntent({
      sellerId: args.seller,
      amount: args.amount ? Number(args.amount) : undefined,
      applicationFeeAmount: args.applicationFeeAmount
        ? Number(args.applicationFeeAmount)
        : undefined,
      currency: args.currency,
    })
    if (!seller) {
      throw new Error("Expected seller result for connected-account PaymentIntent")
    }
    if (args.json) {
      printJson({
        seller,
        paymentIntentId: paymentIntent.id,
        clientSecret: paymentIntent.client_secret,
        status: paymentIntent.status,
        publishableKey: getStripePublishableKey() ?? null,
      })
      return
    }
    console.log(`PaymentIntent ${paymentIntent.id} for seller ${seller.id}`)
    console.log(`  status: ${paymentIntent.status}`)
    console.log("  clientSecret: hidden (use --json to print)")
  },
})

const createSubscriptionProductCmd = defineCommand({
  meta: {
    name: "create-subscription-product",
    description: "Create the platform subscription Product + monthly Price",
  },
  args: {
    name: {
      type: "string",
      default: "Platform subscription",
      description: "Product name",
    },
    unitAmount: {
      type: "string",
      description: "Unit amount in minor units (default 1000)",
    },
    currency: { type: "string", description: "Currency" },
    json: { type: "boolean", default: false, description: "Print JSON" },
  },
  async run({ args }) {
    const result = await createSubscriptionProduct({
      name: args.name,
      unitAmount: args.unitAmount ? Number(args.unitAmount) : undefined,
      currency: args.currency,
    })
    if (args.json) {
      printJson(result.catalog)
      return
    }
    console.log(`Product ${result.catalog.productId}`)
    console.log(`  priceId: ${result.priceId}`)
  },
})

const attachBalancePaymentMethodCmd = defineCommand({
  meta: {
    name: "attach-balance-payment-method",
    description:
      "Attach stripe_balance as the seller's default payment method via SetupIntent",
  },
  args: {
    seller: { type: "string", required: true, description: "Local seller ID" },
    json: { type: "boolean", default: false, description: "Print JSON" },
  },
  async run({ args }) {
    const { seller, paymentMethodId, setupIntent } =
      await attachBalancePaymentMethod({ sellerId: args.seller })
    if (args.json) {
      printJson({
        seller,
        paymentMethodId,
        setupIntentId: setupIntent.id,
        status: setupIntent.status,
      })
      return
    }
    console.log(`Attached payment method for ${seller.id}`)
    console.log(`  paymentMethodId: ${paymentMethodId}`)
    console.log(`  setupIntent: ${setupIntent.id} (${setupIntent.status})`)
  },
})

const createSubscriptionCmd = defineCommand({
  meta: {
    name: "create-subscription",
    description:
      "Create a subscription charging the seller's Stripe balance",
  },
  args: {
    seller: { type: "string", required: true, description: "Local seller ID" },
    price: { type: "string", description: "Price ID (defaults to catalog price)" },
    quantity: { type: "string", description: "Quantity (default 1)" },
    json: { type: "boolean", default: false, description: "Print JSON" },
  },
  async run({ args }) {
    const { seller, subscription } = await createSubscription({
      sellerId: args.seller,
      priceId: args.price,
      quantity: args.quantity ? Number(args.quantity) : undefined,
    })
    if (args.json) {
      printJson({
        seller,
        subscriptionId: subscription.id,
        status: subscription.status,
      })
      return
    }
    console.log(`Subscription ${subscription.id} for seller ${seller.id}`)
    console.log(`  status: ${subscription.status}`)
  },
})

const onboardCmd = defineCommand({
  meta: {
    name: "onboard",
    description: "Create a connected account and an onboarding Account Link",
  },
  args: {
    displayName: { type: "string", default: "Test account" },
    email: { type: "string", default: "testaccount@example.com" },
    country: { type: "string" },
    sellerId: { type: "string" },
    returnUrl: { type: "string" },
    refreshUrl: { type: "string" },
    json: { type: "boolean", default: false },
  },
  async run({ args }) {
    const created = await createAccount({
      displayName: args.displayName,
      contactEmail: args.email,
      country: args.country,
      sellerId: args.sellerId,
    })
    const linked = await createAccountLink({
      sellerId: created.seller.id,
      returnUrl: args.returnUrl,
      refreshUrl: args.refreshUrl,
    })
    if (args.json) {
      printJson({
        seller: linked.seller,
        accountId: created.account.id,
        onboardingUrl: linked.accountLink.url,
      })
      return
    }
    console.log(`Onboarding seller ${linked.seller.id}`)
    console.log(`  stripeAccountId: ${linked.seller.stripeAccountId}`)
    console.log(`  onboardingUrl: ${linked.accountLink.url}`)
  },
})

const chargePlatformSubscriptionCmd = defineCommand({
  meta: {
    name: "charge-platform-subscription",
    description:
      "Ensure subscription product exists, attach stripe_balance, and create the subscription",
  },
  args: {
    seller: { type: "string", required: true, description: "Local seller ID" },
    json: { type: "boolean", default: false },
  },
  async run({ args }) {
    const product = await createSubscriptionProduct()
    const attached = await attachBalancePaymentMethod({ sellerId: args.seller })
    const { seller, subscription } = await createSubscription({
      sellerId: args.seller,
      priceId: product.priceId,
    })
    if (args.json) {
      printJson({
        seller,
        priceId: product.priceId,
        paymentMethodId: attached.paymentMethodId,
        subscriptionId: subscription.id,
        status: subscription.status,
      })
      return
    }
    console.log(`Charged platform subscription for ${seller.id}`)
    console.log(`  subscriptionId: ${subscription.id}`)
    console.log(`  status: ${subscription.status}`)
  },
})

const listSellersCmd = defineCommand({
  meta: {
    name: "list-sellers",
    description: "List persisted sellers and their Stripe resource IDs",
  },
  args: {
    json: { type: "boolean", default: false },
  },
  async run({ args }) {
    const store = new PaymentsStore()
    const sellers = await store.listSellers()
    if (args.json) {
      printJson({ storePath: store.path, sellers })
      return
    }
    if (sellers.length === 0) {
      console.log(`No sellers in ${store.path}`)
      return
    }
    for (const s of sellers) {
      console.log(
        `${s.id}  acct=${s.stripeAccountId}  onboarding=${s.onboardingStatus}` +
          (s.subscriptionId ? `  sub=${s.subscriptionId}` : ""),
      )
    }
  },
})

const showSellerCmd = defineCommand({
  meta: {
    name: "show-seller",
    description: "Show one persisted seller record",
  },
  args: {
    seller: { type: "string", required: true },
    json: { type: "boolean", default: true },
  },
  async run({ args }) {
    const store = new PaymentsStore()
    const seller = await store.getSeller(args.seller)
    if (!seller) {
      throw new Error(`Seller not found: ${args.seller}`)
    }
    printJson(seller)
  },
})

const listenWebhooksCmd = defineCommand({
  meta: {
    name: "listen-webhooks",
    description:
      "Start a local webhook listener for account, checkout, payment_intent, and invoice events",
  },
  args: {
    port: {
      type: "string",
      default: "4242",
      description: "HTTP port",
    },
    path: {
      type: "string",
      default: "/webhook",
      description: "Webhook path",
    },
  },
  async run({ args }) {
    const port = Number(args.port)
    const server = startWebhookServer({ port, path: args.path })
    console.log(
      `Listening for Stripe webhooks on http://localhost:${port}${args.path}`,
    )
    console.log(
      "Set STRIPE_WEBHOOK_SECRET from the Stripe Dashboard (Developers → Webhooks).",
    )
    await new Promise<void>((resolve) => {
      server.on("close", () => resolve())
    })
  },
})

const servePaymentCmd = defineCommand({
  meta: {
    name: "serve-payment",
    description:
      "Start a local PaymentElement server (create PaymentIntent, mount form, handle webhooks)",
  },
  args: {
    port: {
      type: "string",
      default: "4242",
      description: "HTTP port",
    },
    webhookPath: {
      type: "string",
      default: "/webhook",
      description: "Webhook path",
    },
  },
  async run({ args }) {
    const port = Number(args.port)
    const server = startPaymentServer({ port, webhookPath: args.webhookPath })
    console.log(`Payment page: http://localhost:${port}/`)
    console.log(
      `Create PaymentIntent: POST http://localhost:${port}/create-payment-intent`,
    )
    console.log(
      `Webhooks: POST http://localhost:${port}${args.webhookPath}`,
    )
    console.log(
      "Set STRIPE_SECRET_KEY and STRIPE_PUBLISHABLE_KEY from the Stripe Dashboard (Developers → API keys).",
    )
    console.log(
      "Set STRIPE_WEBHOOK_SECRET from the Stripe Dashboard (Developers → Webhooks).",
    )
    await new Promise<void>((resolve) => {
      server.on("close", () => resolve())
    })
  },
})

export default defineCommand({
  meta: {
    name: "payments",
    description:
      "Stripe Accounts v2: onboard sellers, accept embedded payments, charge platform subscriptions",
  },
  subCommands: {
    "create-account": createAccountCmd,
    "create-account-link": createAccountLinkCmd,
    onboard: onboardCmd,
    "create-checkout-session": createCheckoutSessionCmd,
    "create-payment-intent": createPaymentIntentCmd,
    "create-subscription-product": createSubscriptionProductCmd,
    "attach-balance-payment-method": attachBalancePaymentMethodCmd,
    "create-subscription": createSubscriptionCmd,
    "charge-platform-subscription": chargePlatformSubscriptionCmd,
    "list-sellers": listSellersCmd,
    "show-seller": showSellerCmd,
    "listen-webhooks": listenWebhooksCmd,
    "serve-payment": servePaymentCmd,
  },
})
