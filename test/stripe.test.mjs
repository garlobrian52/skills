import { describe, it, before, after } from "node:test"
import assert from "node:assert/strict"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const distStripe = path.join(__dirname, "..", "dist", "stripe")

async function importStripe(mod, tag) {
  return import(pathToFileURL(path.join(distStripe, mod)).href + `?t=${tag}`)
}

describe("stripe store", () => {
  let storePath
  let store

  before(async () => {
    storePath = path.join(
      await mkdtemp(path.join(tmpdir(), "stripe-store-")),
      "store.json",
    )
    process.env.STRIPE_STORE_PATH = storePath
    store = await importStripe("store.js", `store-${Date.now()}`)
  })

  after(async () => {
    delete process.env.STRIPE_STORE_PATH
    await rm(path.dirname(storePath), { recursive: true, force: true })
  })

  it("persists sellers and looks them up by Stripe account id", async () => {
    const now = new Date().toISOString()
    const seller = {
      id: "seller_test1",
      displayName: "Test",
      contactEmail: "t@example.com",
      country: "US",
      stripeAccountId: "acct_test123",
      onboardingStatus: "pending",
      merchantCapabilityStatus: "pending",
      createdAt: now,
      updatedAt: now,
    }
    await store.upsertSeller(seller)
    const found = await store.findSellerByStripeAccountId("acct_test123")
    assert.equal(found?.id, "seller_test1")
    const byId = await store.findSellerById("seller_test1")
    assert.equal(byId?.stripeAccountId, "acct_test123")
  })
})

describe("stripe webhooks", () => {
  let storePath
  let webhooks
  let store
  const tag = `wh-${Date.now()}`

  before(async () => {
    storePath = path.join(
      await mkdtemp(path.join(tmpdir(), "stripe-wh-")),
      "store.json",
    )
    process.env.STRIPE_STORE_PATH = storePath
    process.env.STRIPE_SECRET_KEY = "sk_test_dummy"
    store = await importStripe("store.js", tag)
    webhooks = await importStripe("webhooks.js", tag)

    const now = new Date().toISOString()
    await store.upsertSeller({
      id: "seller_wh",
      displayName: "WH",
      contactEmail: "wh@example.com",
      country: "US",
      stripeAccountId: "acct_wh",
      onboardingStatus: "pending",
      merchantCapabilityStatus: "pending",
      createdAt: now,
      updatedAt: now,
    })
    await store.upsertCheckout({
      id: "checkout_wh",
      sellerId: "seller_wh",
      stripeCheckoutSessionId: "cs_test_1",
      url: "https://checkout.stripe.com/test",
      status: "open",
      applicationFeeAmount: 123,
      createdAt: now,
      updatedAt: now,
    })
    await store.upsertSubscription({
      id: "sub_local",
      sellerId: "seller_wh",
      planId: "plan_1",
      stripeSubscriptionId: "sub_stripe_1",
      stripePaymentMethodId: "pm_1",
      status: "incomplete",
      createdAt: now,
      updatedAt: now,
    })
  })

  after(async () => {
    delete process.env.STRIPE_STORE_PATH
    delete process.env.STRIPE_SECRET_KEY
    await rm(path.dirname(storePath), { recursive: true, force: true })
  })

  it("marks seller onboarded on merchant capability update", async () => {
    const result = await webhooks.handleStripeEvent({
      type: "v2.core.account[configuration.merchant].capability_status_updated",
      related_object: { id: "acct_wh" },
    })
    assert.equal(result.type, "merchant_capability_updated")
    assert.equal(result.sellerId, "seller_wh")
    const seller = await store.findSellerById("seller_wh")
    assert.equal(seller.onboardingStatus, "complete")
    assert.equal(seller.merchantCapabilityStatus, "active")
  })

  it("marks checkout complete on checkout.session.completed", async () => {
    const result = await webhooks.handleStripeEvent({
      type: "checkout.session.completed",
      data: { object: { id: "cs_test_1", status: "complete" } },
    })
    assert.equal(result.type, "checkout_completed")
    assert.equal(result.checkoutId, "checkout_wh")
    const checkout = await store.findCheckoutBySessionId("cs_test_1")
    assert.equal(checkout.status, "complete")
  })

  it("marks subscription active on invoice.payment_succeeded", async () => {
    const result = await webhooks.handleStripeEvent({
      type: "invoice.payment_succeeded",
      data: {
        object: {
          id: "in_1",
          parent: {
            subscription_details: { subscription: "sub_stripe_1" },
          },
        },
      },
    })
    assert.equal(result.type, "invoice_payment_succeeded")
    assert.equal(result.subscriptionId, "sub_local")
    const sub = await store.findSubscriptionByStripeId("sub_stripe_1")
    assert.equal(sub.status, "active")
  })
})

describe("stripe http routes", () => {
  let storePath
  let server
  let base

  before(async () => {
    storePath = path.join(
      await mkdtemp(path.join(tmpdir(), "stripe-http-")),
      "store.json",
    )
    process.env.STRIPE_STORE_PATH = storePath
    process.env.STRIPE_SECRET_KEY = "sk_test_dummy"
    process.env.BASE_URL = "http://localhost:0"
    process.env.CURRENCY = "usd"
    process.env.CONNECTED_ACCOUNT_COUNTRY = "US"

    const tag = `http-${Date.now()}`
    const clientMod = await importStripe("client.js", tag)
    clientMod.resetStripeClient()
    const httpMod = await importStripe("http.js", tag)
    server = httpMod.createPaymentsServer({ port: 0, host: "127.0.0.1" })
    await new Promise((resolve, reject) => {
      server.listen(0, "127.0.0.1", resolve)
      server.on("error", reject)
    })
    const addr = server.address()
    base = `http://127.0.0.1:${addr.port}`
  })

  after(async () => {
    await new Promise((resolve) => server.close(resolve))
    delete process.env.STRIPE_STORE_PATH
    delete process.env.STRIPE_SECRET_KEY
    await rm(path.dirname(storePath), { recursive: true, force: true })
  })

  it("GET /health returns ok", async () => {
    const res = await fetch(`${base}/health`)
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.equal(body.ok, true)
  })

  it("POST /webhooks/stripe handles checkout.session.completed without signature", async () => {
    const res = await fetch(`${base}/webhooks/stripe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "checkout.session.completed",
        data: { object: { id: "cs_unknown", status: "complete" } },
      }),
    })
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.equal(body.received, true)
    assert.equal(body.result.type, "checkout_completed")
  })
})

describe("stripe domain operations with mocked Stripe client", () => {
  let storePath
  let accounts
  let payments
  let subscriptions
  let client
  let accountCreateParams
  let checkoutCreateArgs
  let productCreateParams
  let setupIntentParams
  let subscriptionParams

  before(async () => {
    storePath = path.join(
      await mkdtemp(path.join(tmpdir(), "stripe-ops-")),
      "store.json",
    )
    process.env.STRIPE_STORE_PATH = storePath
    process.env.CURRENCY = "usd"
    process.env.CONNECTED_ACCOUNT_COUNTRY = "US"
    process.env.BASE_URL = "http://localhost:4242"

    // Import without cache-busting so setStripeClient shares the singleton
    // with accounts/payments/subscriptions modules.
    const href = (mod) => pathToFileURL(path.join(distStripe, mod)).href
    client = await import(href("client.js"))
    accounts = await import(href("accounts.js"))
    payments = await import(href("payments.js"))
    subscriptions = await import(href("subscriptions.js"))

    const fake = {
      v2: {
        core: {
          accounts: {
            create: async (params) => {
              accountCreateParams = params
              return { id: "acct_mock_1", object: "v2.core.account" }
            },
          },
          accountLinks: {
            create: async (params) => ({
              id: "alink_1",
              url: "https://connect.stripe.com/setup/test",
              ...params,
            }),
          },
        },
      },
      checkout: {
        sessions: {
          create: async (params, options) => {
            checkoutCreateArgs = { params, options }
            return {
              id: "cs_mock_1",
              url: "https://checkout.stripe.com/c/pay/cs_mock_1",
              status: "open",
            }
          },
        },
      },
      products: {
        create: async (params) => {
          productCreateParams = params
          return {
            id: "prod_mock_1",
            default_price: "price_mock_1",
          }
        },
      },
      setupIntents: {
        create: async (params) => {
          setupIntentParams = params
          return {
            id: "seti_mock_1",
            payment_method: "pm_balance_1",
          }
        },
      },
      subscriptions: {
        create: async (params) => {
          subscriptionParams = params
          return {
            id: "sub_mock_1",
            status: "active",
          }
        },
      },
    }

    client.setStripeClient(fake)
  })

  after(async () => {
    client.resetStripeClient()
    delete process.env.STRIPE_STORE_PATH
    await rm(path.dirname(storePath), { recursive: true, force: true })
  })

  it("createAccount sends Accounts v2 merchant+customer payload and persists seller", async () => {
    const { seller, account } = await accounts.createAccount()
    assert.equal(account.id, "acct_mock_1")
    assert.equal(seller.stripeAccountId, "acct_mock_1")
    assert.equal(accountCreateParams.display_name, "Test account")
    assert.equal(
      accountCreateParams.configuration.merchant.simulate_accept_tos_obo,
      true,
    )
    assert.ok(accountCreateParams.configuration.customer)
    assert.ok(accountCreateParams.configuration.recipient)
    assert.deepEqual(accountCreateParams.include, [
      "configuration.merchant",
      "configuration.recipient",
      "identity",
      "defaults",
      "configuration.customer",
    ])
    assert.equal(
      accountCreateParams.defaults.responsibilities.fees_collector,
      "stripe",
    )
  })

  it("createAccountLink targets merchant+customer onboarding", async () => {
    const result = await accounts.createAccountLink({
      stripeAccountId: "acct_mock_1",
    })
    assert.match(result.url, /connect\.stripe\.com/)
  })

  it("createCheckoutSession uses Stripe-Account and application fee", async () => {
    const { session, checkout } = await payments.createCheckoutSession({
      stripeAccountId: "acct_mock_1",
      sellerId: "seller_x",
    })
    assert.equal(session.id, "cs_mock_1")
    assert.equal(checkout.applicationFeeAmount, 123)
    assert.equal(checkoutCreateArgs.options.stripeAccount, "acct_mock_1")
    assert.equal(checkoutCreateArgs.params.mode, "payment")
    assert.equal(
      checkoutCreateArgs.params.payment_intent_data.application_fee_amount,
      123,
    )
    assert.equal(
      checkoutCreateArgs.params.line_items[0].price_data.product_data.name,
      "Cookie",
    )
  })

  it("createSubscriptionProduct + createSellerSubscription charge stripe_balance", async () => {
    const { plan } = await subscriptions.createSubscriptionProduct()
    assert.equal(plan.stripePriceId, "price_mock_1")
    assert.equal(productCreateParams.name, "Platform subscription")
    assert.equal(productCreateParams.default_price_data.recurring.interval, "month")

    const { subscription, stripeSubscription } =
      await subscriptions.createSellerSubscription({
        stripeAccountId: "acct_mock_1",
        sellerId: "seller_x",
        paymentMethodId: "pm_balance_1",
        priceId: plan.stripePriceId,
        planId: plan.id,
      })
    assert.equal(stripeSubscription.id, "sub_mock_1")
    assert.equal(subscription.stripePaymentMethodId, "pm_balance_1")
    assert.equal(subscriptionParams.customer_account, "acct_mock_1")
    assert.equal(subscriptionParams.default_payment_method, "pm_balance_1")
    assert.deepEqual(subscriptionParams.payment_settings.payment_method_types, [
      "stripe_balance",
    ])
  })

  it("attachBalancePaymentMethod confirms stripe_balance SetupIntent", async () => {
    const result = await subscriptions.attachBalancePaymentMethod({
      stripeAccountId: "acct_mock_1",
    })
    assert.equal(result.paymentMethodId, "pm_balance_1")
    assert.equal(setupIntentParams.confirm, true)
    assert.equal(setupIntentParams.customer_account, "acct_mock_1")
    assert.deepEqual(setupIntentParams.payment_method_types, ["stripe_balance"])
    assert.equal(setupIntentParams.payment_method_data.type, "stripe_balance")
  })
})
