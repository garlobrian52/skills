import { describe, it, before, after, beforeEach } from "node:test"
import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import path from "path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { mkdir, rm, writeFile } from "node:fs/promises"

const exec = promisify(execFile)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, "..")
const CLI = path.join(ROOT, "dist", "index.js")
const TMP = path.join(ROOT, ".test-output", "stripe")

async function cleanup() {
  await rm(TMP, { recursive: true, force: true }).catch(() => {})
}

describe("stripe CLI help", () => {
  it("lists domain-named stripe subcommands", async () => {
    const { stdout } = await exec("node", [CLI, "stripe", "--help"])
    assert.match(stdout, /create-account/)
    assert.match(stdout, /create-account-link/)
    assert.match(stdout, /create-product/)
    assert.match(stdout, /create-checkout-session/)
    assert.match(stdout, /create-payment-intent/)
    assert.match(stdout, /serve-payment/)
    assert.match(stdout, /create-subscription-plan/)
    assert.match(stdout, /attach-balance-payment-method/)
    assert.match(stdout, /create-subscription/)
    assert.match(stdout, /handle-webhooks/)
    assert.match(stdout, /inspect/)
    assert.match(stdout, /update/)
    assert.match(stdout, /run-request/)
    assert.doesNotMatch(stdout, /chapter/i)
  })
})

describe("stripe store + webhook handlers", () => {
  let storePath
  let stripeMod

  before(async () => {
    await cleanup()
    await mkdir(TMP, { recursive: true })
    storePath = path.join(TMP, "store.json")
    stripeMod = await import(
      pathToFileURL(path.join(ROOT, "dist", "stripe", "index.js")).href
    )
  })

  after(cleanup)

  beforeEach(async () => {
    await rm(storePath, { force: true }).catch(() => {})
  })

  it("persists and retrieves connected account ids", async () => {
    const record = stripeMod.createEmptyRecord(
      "seller-a",
      "Acme Cookies",
      "acme@example.com",
    )
    record.accountId = "acct_test_123"
    await stripeMod.upsertAccount(record, storePath)

    const loaded = await stripeMod.requireAccount("seller-a", storePath)
    assert.equal(loaded.accountId, "acct_test_123")
    assert.equal(loaded.displayName, "Acme Cookies")

    const byStripe = await stripeMod.findAccountByStripeId(
      "acct_test_123",
      storePath,
    )
    assert.equal(byStripe.sellerId, "seller-a")
  })

  it("marks merchant onboarding from capability webhook", async () => {
    const record = stripeMod.createEmptyRecord(
      "seller-b",
      "Bakery",
      "bakery@example.com",
    )
    record.accountId = "acct_onboard_1"
    await stripeMod.upsertAccount(record, storePath)

    const result = await stripeMod.handleStripeWebhookEvent(
      {
        type: stripeMod.MERCHANT_CAPABILITY_EVENT,
        data: { id: "acct_onboard_1" },
      },
      storePath,
    )

    assert.equal(result.handled, true)
    assert.equal(result.sellerId, "seller-b")
    const updated = await stripeMod.requireAccount("seller-b", storePath)
    assert.equal(updated.merchantOnboarded, true)
  })

  it("marks checkout complete from checkout.session.completed", async () => {
    const record = stripeMod.createEmptyRecord(
      "seller-c",
      "Cafe",
      "cafe@example.com",
    )
    record.accountId = "acct_pay_1"
    record.checkoutSessionId = "cs_test_abc"
    await stripeMod.upsertAccount(record, storePath)

    const result = await stripeMod.handleStripeWebhookEvent(
      {
        type: "checkout.session.completed",
        data: { object: { id: "cs_test_abc" } },
      },
      storePath,
    )

    assert.equal(result.handled, true)
    const updated = await stripeMod.requireAccount("seller-c", storePath)
    assert.equal(updated.checkoutCompleted, true)
  })

  it("marks subscription paid from invoice.payment_succeeded", async () => {
    const record = stripeMod.createEmptyRecord(
      "seller-d",
      "Deli",
      "deli@example.com",
    )
    record.accountId = "acct_sub_1"
    record.subscriptionId = "sub_test_xyz"
    await stripeMod.upsertAccount(record, storePath)

    const result = await stripeMod.handleStripeWebhookEvent(
      {
        type: "invoice.payment_succeeded",
        data: {
          object: {
            id: "in_test_1",
            subscription: "sub_test_xyz",
            customer_account: "acct_sub_1",
          },
        },
      },
      storePath,
    )

    assert.equal(result.handled, true)
    const updated = await stripeMod.requireAccount("seller-d", storePath)
    assert.equal(updated.subscriptionPaid, true)
  })
})

describe("stripe domain operations (mocked client)", () => {
  let storePath
  let stripeMod

  before(async () => {
    await mkdir(TMP, { recursive: true })
    storePath = path.join(TMP, "ops-store.json")
    stripeMod = await import(
      pathToFileURL(path.join(ROOT, "dist", "stripe", "index.js")).href
    )
  })

  beforeEach(async () => {
    await rm(storePath, { force: true }).catch(() => {})
  })

  function mockStripe(captured = {}) {
    return {
      paymentIntents: {
        create: async (params, options) => {
          captured.paymentIntentParams = params
          captured.paymentIntentOptions = options
          return {
            id: "pi_mock_1",
            status: "requires_payment_method",
            client_secret: "pi_mock_1_secret_abc",
            amount: params.amount,
            currency: params.currency,
          }
        },
      },
      v2: {
        core: {
          accounts: {
            create: async (params) => {
              assert.equal(params.display_name, "Test account")
              assert.equal(params.dashboard, "full")
              assert.equal(params.defaults.responsibilities.fees_collector, "stripe")
              assert.ok(params.configuration.merchant)
              assert.ok(params.configuration.customer)
              assert.ok(params.include.includes("configuration.customer"))
              return { id: "acct_mock_1" }
            },
          },
          accountLinks: {
            create: async (params) => {
              assert.equal(params.account, "acct_mock_1")
              assert.equal(params.use_case.type, "account_onboarding")
              assert.deepEqual(params.use_case.account_onboarding.configurations, [
                "merchant",
                "customer",
              ])
              return { url: "https://connect.stripe.com/setup/mock" }
            },
          },
        },
      },
      checkout: {
        sessions: {
          create: async (params, options) => {
            if (options?.stripeAccount) {
              assert.equal(params.mode, "payment")
              assert.equal(params.payment_method_types[0], "card")
              assert.equal(params.payment_intent_data.application_fee_amount, 123)
              assert.equal(options.stripeAccount, "acct_mock_1")
              return {
                id: "cs_mock_direct_1",
                url: "https://checkout.stripe.com/c/pay/cs_mock_direct_1",
              }
            }
            assert.equal(params.mode, "payment")
            assert.equal(params.line_items[0].price, "price_onetime_1")
            assert.equal(params.line_items[0].quantity, 1)
            assert.ok(params.success_url)
            assert.ok(params.cancel_url)
            return {
              id: "cs_mock_1",
              url: "https://checkout.stripe.com/c/pay/cs_mock_1",
            }
          },
        },
      },
      products: {
        create: async (params, options) => {
          captured.productOptions = options
          if (params.default_price_data.recurring) {
            assert.equal(params.name, "Platform subscription")
            assert.equal(params.default_price_data.recurring.interval, "month")
            assert.equal(params.default_price_data.unit_amount, 1000)
            return {
              id: "prod_mock_sub_1",
              default_price: "price_mock_sub_1",
            }
          }
          assert.equal(params.name, "Example Product")
          assert.equal(params.default_price_data.unit_amount, 2000)
          assert.equal(params.default_price_data.currency, "usd")
          return {
            id: "prod_onetime_1",
            default_price: "price_onetime_1",
          }
        },
      },
      setupIntents: {
        create: async (params) => {
          assert.equal(params.customer_account, "acct_mock_1")
          assert.equal(params.confirm, true)
          assert.equal(params.usage, "off_session")
          assert.deepEqual(params.payment_method_types, ["stripe_balance"])
          assert.equal(params.payment_method_data.type, "stripe_balance")
          return {
            id: "seti_mock_1",
            payment_method: "pm_balance_1",
          }
        },
      },
      subscriptions: {
        create: async (params, options) => {
          captured.subscriptionOptions = options
          assert.equal(params.customer_account, "acct_mock_1")
          assert.equal(params.default_payment_method, "pm_balance_1")
          assert.equal(params.items[0].price, "price_mock_sub_1")
          assert.deepEqual(params.payment_settings.payment_method_types, [
            "stripe_balance",
          ])
          return { id: "sub_mock_1", status: "active" }
        },
      },
    }
  }

  it("runs create-product → checkout for one-time payment blueprint", async () => {
    const stripe = mockStripe()

    const product = await stripeMod.createProduct(
      { sellerId: "seller-onetime", storePath },
      stripe,
    )
    assert.equal(product.priceId, "price_onetime_1")
    assert.equal(product.record.checkoutPriceId, "price_onetime_1")

    const { session } = await stripeMod.createCheckoutSession(
      { sellerId: "seller-onetime", storePath },
      stripe,
    )
    assert.equal(session.id, "cs_mock_1")

    const record = await stripeMod.requireAccount("seller-onetime", storePath)
    assert.equal(record.checkoutProductId, "prod_onetime_1")
    assert.equal(record.checkoutSessionId, "cs_mock_1")
  })

  it("runs create-account → account-link → direct-charge checkout → subscription sequence", async () => {
    const stripe = mockStripe()

    const account = await stripeMod.createConnectedAccount(
      {
        sellerId: "seller-flow",
        storePath,
      },
      stripe,
    )
    assert.equal(account.accountId, "acct_mock_1")

    const { url } = await stripeMod.createAccountOnboardingLink(
      { sellerId: "seller-flow", storePath },
      stripe,
    )
    assert.match(url, /connect\.stripe\.com/)

    const { session } = await stripeMod.createDirectChargeCheckoutSession(
      { sellerId: "seller-flow", storePath },
      stripe,
    )
    assert.equal(session.id, "cs_mock_direct_1")

    const plan = await stripeMod.createSubscriptionPlan(
      { sellerId: "seller-flow", storePath },
      stripe,
    )
    assert.equal(plan.priceId, "price_mock_sub_1")

    const pm = await stripeMod.attachBalancePaymentMethod(
      { sellerId: "seller-flow", storePath },
      stripe,
    )
    assert.equal(pm.paymentMethodId, "pm_balance_1")

    const sub = await stripeMod.createPlatformSubscription(
      { sellerId: "seller-flow", storePath },
      stripe,
    )
    assert.equal(sub.subscription.id, "sub_mock_1")

    const finalRecord = await stripeMod.requireAccount("seller-flow", storePath)
    assert.equal(finalRecord.accountId, "acct_mock_1")
    assert.equal(finalRecord.checkoutSessionId, "cs_mock_direct_1")
    assert.equal(finalRecord.priceId, "price_mock_sub_1")
    assert.equal(finalRecord.paymentMethodId, "pm_balance_1")
    assert.equal(finalRecord.subscriptionId, "sub_mock_1")
  })

  it("passes stable idempotency keys for product and subscription creation", async () => {
    const captured = {}
    const stripe = mockStripe(captured)

    await stripeMod.createConnectedAccount({ sellerId: "seller-idem", storePath }, stripe)
    await stripeMod.createSubscriptionPlan({ sellerId: "seller-idem", storePath }, stripe)
    assert.match(captured.productOptions.idempotencyKey, /^subscription-plan:seller-idem:/)

    await stripeMod.attachBalancePaymentMethod({ sellerId: "seller-idem", storePath }, stripe)
    await stripeMod.createPlatformSubscription({ sellerId: "seller-idem", storePath }, stripe)
    assert.equal(
      captured.subscriptionOptions.idempotencyKey,
      "platform-subscription:acct_mock_1:price_mock_sub_1",
    )
  })

  it("refuses to create a duplicate connected account", async () => {
    const stripe = mockStripe()
    await stripeMod.createConnectedAccount({ sellerId: "seller-dup", storePath }, stripe)
    await assert.rejects(
      () => stripeMod.createConnectedAccount({ sellerId: "seller-dup", storePath }, stripe),
      /already has Stripe account/,
    )
  })
})

describe("stripe embedded PaymentIntent", () => {
  let storePath
  let stripeMod

  before(async () => {
    await mkdir(TMP, { recursive: true })
    storePath = path.join(TMP, "pi-store.json")
    stripeMod = await import(
      pathToFileURL(path.join(ROOT, "dist", "stripe", "index.js")).href
    )
  })

  beforeEach(async () => {
    await rm(storePath, { force: true }).catch(() => {})
  })

  function mockPaymentStripe(captured = {}) {
    return {
      paymentIntents: {
        create: async (params, options) => {
          captured.params = params
          captured.options = options
          return {
            id: "pi_test_1",
            status: "requires_payment_method",
            client_secret: "pi_test_1_secret_xyz",
            amount: params.amount,
            currency: params.currency,
          }
        },
      },
      v2: {
        core: {
          accounts: {
            create: async () => ({ id: "acct_pi_1" }),
          },
        },
      },
    }
  }

  it("creates a platform PaymentIntent with automatic payment methods", async () => {
    const captured = {}
    const stripe = mockPaymentStripe(captured)
    const result = await stripeMod.createPaymentIntent(
      { amount: 5000, currency: "USD" },
      stripe,
    )
    assert.equal(captured.params.amount, 5000)
    assert.equal(captured.params.currency, "usd")
    assert.equal(captured.params.automatic_payment_methods.enabled, true)
    assert.equal(captured.options, undefined)
    assert.equal(result.clientSecret, "pi_test_1_secret_xyz")
    assert.equal(result.record, undefined)
  })

  it("creates a direct-charge PaymentIntent and never persists the client secret", async () => {
    const captured = {}
    const stripe = mockPaymentStripe(captured)
    await stripeMod.createConnectedAccount({ sellerId: "seller-pi", storePath }, stripe)

    const result = await stripeMod.createPaymentIntent(
      { amount: 4000, applicationFeeAmount: 200, sellerId: "seller-pi", storePath },
      stripe,
    )
    assert.equal(captured.params.application_fee_amount, 200)
    assert.equal(captured.options.stripeAccount, "acct_pi_1")
    assert.equal(result.clientSecret, "pi_test_1_secret_xyz")

    const record = await stripeMod.requireAccount("seller-pi", storePath)
    assert.equal(record.paymentIntentId, "pi_test_1")
    assert.equal(record.paymentIntentStatus, "requires_payment_method")
    const raw = await import("node:fs/promises").then((m) =>
      m.readFile(storePath, "utf8"),
    )
    assert.doesNotMatch(raw, /secret/)
  })

  it("rejects non-positive and non-integer amounts", async () => {
    const stripe = mockPaymentStripe()
    await assert.rejects(
      () => stripeMod.createPaymentIntent({ amount: 0 }, stripe),
      /positive integer/,
    )
    await assert.rejects(
      () => stripeMod.createPaymentIntent({ amount: 12.5 }, stripe),
      /positive integer/,
    )
  })

  it("rejects an application fee that is not less than the amount", async () => {
    const stripe = mockPaymentStripe()
    await stripeMod.createConnectedAccount({ sellerId: "seller-fee", storePath }, stripe)
    await assert.rejects(
      () =>
        stripeMod.createPaymentIntent(
          { amount: 1000, applicationFeeAmount: 1000, sellerId: "seller-fee", storePath },
          stripe,
        ),
      /less than the charge amount/,
    )
  })
})

describe("stripe store hardening", () => {
  let storePath
  let stripeMod

  before(async () => {
    await mkdir(TMP, { recursive: true })
    storePath = path.join(TMP, "harden-store.json")
    stripeMod = await import(
      pathToFileURL(path.join(ROOT, "dist", "stripe", "index.js")).href
    )
  })

  beforeEach(async () => {
    await rm(storePath, { force: true }).catch(() => {})
  })

  it("safely stores a seller id of __proto__", async () => {
    const record = stripeMod.createEmptyRecord("__proto__", "Proto", "p@example.com")
    record.accountId = "acct_proto"
    await stripeMod.upsertAccount(record, storePath)
    const loaded = await stripeMod.requireAccount("__proto__", storePath)
    assert.equal(loaded.accountId, "acct_proto")
  })

  it("serializes concurrent mutations without losing updates", async () => {
    const base = stripeMod.createEmptyRecord("seller-conc", "Conc", "c@example.com")
    await stripeMod.upsertAccount(base, storePath)

    await Promise.all([
      stripeMod.mutateStore((store) => {
        store.accounts["seller-conc"].accountId = "acct_conc"
      }, storePath),
      stripeMod.mutateStore((store) => {
        store.accounts["seller-conc"].subscriptionId = "sub_conc"
      }, storePath),
    ])

    const loaded = await stripeMod.requireAccount("seller-conc", storePath)
    assert.equal(loaded.accountId, "acct_conc")
    assert.equal(loaded.subscriptionId, "sub_conc")
  })
})

describe("stripe capability webhook status", () => {
  let storePath
  let stripeMod

  before(async () => {
    await mkdir(TMP, { recursive: true })
    storePath = path.join(TMP, "cap-store.json")
    stripeMod = await import(
      pathToFileURL(path.join(ROOT, "dist", "stripe", "index.js")).href
    )
  })

  beforeEach(async () => {
    await rm(storePath, { force: true }).catch(() => {})
  })

  it("does not mark onboarding complete for a non-active capability status", async () => {
    const record = stripeMod.createEmptyRecord("seller-cap", "Cap", "cap@example.com")
    record.accountId = "acct_cap_1"
    await stripeMod.upsertAccount(record, storePath)

    const result = await stripeMod.handleStripeWebhookEvent(
      {
        type: stripeMod.MERCHANT_CAPABILITY_EVENT,
        data: { id: "acct_cap_1", status: "unsupported" },
      },
      storePath,
    )
    assert.equal(result.handled, true)
    const updated = await stripeMod.requireAccount("seller-cap", storePath)
    assert.equal(updated.merchantOnboarded, false)
  })

  it("ignores non-merchant capability events", async () => {
    const record = stripeMod.createEmptyRecord("seller-cap2", "Cap2", "cap2@example.com")
    record.accountId = "acct_cap_2"
    await stripeMod.upsertAccount(record, storePath)

    const result = await stripeMod.handleStripeWebhookEvent(
      {
        type: "v2.core.account[configuration.recipient].capability_status_updated",
        data: { id: "acct_cap_2", status: "active" },
      },
      storePath,
    )
    assert.equal(result.handled, false)
    const updated = await stripeMod.requireAccount("seller-cap2", storePath)
    assert.equal(updated.merchantOnboarded, false)
  })
})

describe("stripe payment server", () => {
  let stripeMod
  let server
  let baseUrl
  const prevPub = process.env.STRIPE_PUBLISHABLE_KEY
  const prevSecret = process.env.STRIPE_SECRET_KEY
  const prevWebhook = process.env.STRIPE_WEBHOOK_SECRET

  before(async () => {
    stripeMod = await import(
      pathToFileURL(path.join(ROOT, "dist", "stripe", "index.js")).href
    )
    process.env.STRIPE_PUBLISHABLE_KEY = "pk_test_server"
    process.env.STRIPE_SECRET_KEY = "sk_test_server"
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_server"
    server = stripeMod.startPaymentServer({ port: 0, webhookPath: "/webhooks/stripe" })
    await new Promise((resolve) => server.once("listening", resolve))
    baseUrl = `http://127.0.0.1:${server.address().port}`
  })

  after(() => {
    server?.close()
    if (prevPub === undefined) delete process.env.STRIPE_PUBLISHABLE_KEY
    else process.env.STRIPE_PUBLISHABLE_KEY = prevPub
    if (prevSecret === undefined) delete process.env.STRIPE_SECRET_KEY
    else process.env.STRIPE_SECRET_KEY = prevSecret
    if (prevWebhook === undefined) delete process.env.STRIPE_WEBHOOK_SECRET
    else process.env.STRIPE_WEBHOOK_SECRET = prevWebhook
  })

  it("serves the PaymentElement page with the publishable key", async () => {
    const res = await fetch(`${baseUrl}/`)
    assert.equal(res.status, 200)
    const body = await res.text()
    assert.match(body, /payment-element/)
    assert.match(body, /pk_test_server/)
  })

  it("rejects webhook POSTs without a Stripe-Signature header", async () => {
    const res = await fetch(`${baseUrl}/webhooks/stripe`, {
      method: "POST",
      body: JSON.stringify({ type: "checkout.session.completed" }),
    })
    assert.equal(res.status, 400)
    const body = await res.json()
    assert.equal(body.error, "missing_stripe_signature")
  })
})

describe("stripe workbench inspector + explorer", () => {
  let stripeMod

  before(async () => {
    stripeMod = await import(
      pathToFileURL(path.join(ROOT, "dist", "stripe", "index.js")).href
    )
  })

  function mockStripeForWorkbench() {
    return {
      rawRequest: async (method, path, params, options) => {
        if (method === "GET" && path.startsWith("/v1/customers/cus_")) {
          assert.equal(options?.stripeAccount, "acct_connected_1")
          return {
            id: "cus_test_1",
            object: "customer",
            email: "buyer@example.com",
            subscription: "sub_test_1",
          }
        }
        if (method === "GET" && path === "/v1/events") {
          return {
            data: [
              {
                id: "evt_v1_1",
                type: "customer.updated",
                created: 1700000000,
                api_version: "2024-06-20",
              },
            ],
          }
        }
        if (method === "POST" && path === "/v1/customers/cus_test_1") {
          return {
            id: "cus_test_1",
            object: "customer",
            email: params.email,
            description: params.description,
          }
        }
        throw new Error(`Unexpected rawRequest ${method} ${path}`)
      },
      v2: {
        core: {
          events: {
            list: async (params) => {
              assert.equal(params.object_id, "cus_test_1")
              return {
                data: [
                  {
                    id: "evt_v2_1",
                    type: "v2.core.account.updated",
                    created: "2024-01-02T00:00:00.000Z",
                  },
                ],
              }
            },
          },
        },
      },
    }
  }

  it("builds a data map from related object fields", () => {
    const map = stripeMod.buildDataMap({
      id: "pi_test_1",
      customer: "cus_test_1",
      latest_charge: "ch_test_1",
      metadata: { order: "42" },
    })
    assert.ok(map.some((entry) => entry.id === "cus_test_1"))
    assert.ok(map.some((entry) => entry.id === "ch_test_1"))
  })

  it("inspects an object with events and workbench links", async () => {
    const prevKey = process.env.STRIPE_SECRET_KEY
    process.env.STRIPE_SECRET_KEY = "sk_test_workbench"
    const stripe = mockStripeForWorkbench()

    const result = await stripeMod.inspectObject(
      {
        objectId: "cus_test_1",
        stripeAccount: "acct_connected_1",
        eventsLimit: 5,
      },
      stripe,
    )

    assert.equal(result.resource, "Customer")
    assert.equal(result.object.email, "buyer@example.com")
    assert.equal(result.dataMap.length, 1)
    assert.equal(result.events.length, 2)
    assert.match(result.workbench.inspectorUrl, /workbench\/inspector\/cus_test_1/)
    assert.match(result.workbench.logsUrl, /related_object=cus_test_1/)

    if (prevKey === undefined) delete process.env.STRIPE_SECRET_KEY
    else process.env.STRIPE_SECRET_KEY = prevKey
  })

  it("updates objects in test mode and blocks live mode", async () => {
    const prevKey = process.env.STRIPE_SECRET_KEY
    process.env.STRIPE_SECRET_KEY = "sk_test_workbench"
    const stripe = mockStripeForWorkbench()

    const updated = await stripeMod.updateObject(
      {
        objectId: "cus_test_1",
        params: { description: "VIP", email: "vip@example.com" },
      },
      stripe,
    )
    assert.equal(updated.object.description, "VIP")

    process.env.STRIPE_SECRET_KEY = "sk_live_blocked"
    await assert.rejects(
      () =>
        stripeMod.updateObject(
          { objectId: "cus_test_1", params: { description: "nope" } },
          stripe,
        ),
      /read-only in live mode/i,
    )

    if (prevKey === undefined) delete process.env.STRIPE_SECRET_KEY
    else process.env.STRIPE_SECRET_KEY = prevKey
  })

  it("runs arbitrary API requests", async () => {
    const prevKey = process.env.STRIPE_SECRET_KEY
    process.env.STRIPE_SECRET_KEY = "sk_test_workbench"
    const stripe = mockStripeForWorkbench()

    const result = await stripeMod.runRequest(
      {
        method: "GET",
        path: "/v1/customers/cus_test_1",
        stripeAccount: "acct_connected_1",
      },
      stripe,
    )
    assert.equal(result.response.id, "cus_test_1")

    if (prevKey === undefined) delete process.env.STRIPE_SECRET_KEY
    else process.env.STRIPE_SECRET_KEY = prevKey
  })
})

describe("stripe env loading", () => {
  it("loads .env placeholders without overriding existing env", async () => {
    await mkdir(TMP, { recursive: true })
    const envFile = path.join(TMP, "sample.env")
    await writeFile(
      envFile,
      "STRIPE_SECRET_KEY=sk_test_from_file\nCURRENCY=eur\n",
      "utf8",
    )
    const prevCurrency = process.env.CURRENCY
    const prevKey = process.env.STRIPE_SECRET_KEY
    delete process.env.CURRENCY
    process.env.STRIPE_SECRET_KEY = "sk_test_already_set"

    const stripeMod = await import(
      pathToFileURL(path.join(ROOT, "dist", "stripe", "index.js")).href
    )
    await stripeMod.loadEnvFile(envFile)
    assert.equal(process.env.STRIPE_SECRET_KEY, "sk_test_already_set")
    assert.equal(process.env.CURRENCY, "eur")

    if (prevCurrency === undefined) delete process.env.CURRENCY
    else process.env.CURRENCY = prevCurrency
    if (prevKey === undefined) delete process.env.STRIPE_SECRET_KEY
    else process.env.STRIPE_SECRET_KEY = prevKey
  })
})
