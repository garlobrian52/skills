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
    assert.match(stdout, /create-checkout-session/)
    assert.match(stdout, /create-subscription-plan/)
    assert.match(stdout, /attach-balance-payment-method/)
    assert.match(stdout, /create-subscription/)
    assert.match(stdout, /handle-webhooks/)
    assert.match(stdout, /inspect/)
    assert.match(stdout, /\bapi\b/)
    assert.match(stdout, /update/)
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

  function mockStripe() {
    return {
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
            assert.equal(params.mode, "payment")
            assert.equal(params.payment_method_types[0], "card")
            assert.equal(params.payment_intent_data.application_fee_amount, 123)
            assert.equal(options.stripeAccount, "acct_mock_1")
            return {
              id: "cs_mock_1",
              url: "https://checkout.stripe.com/c/pay/cs_mock_1",
            }
          },
        },
      },
      products: {
        create: async (params) => {
          assert.equal(params.name, "Platform subscription")
          assert.equal(params.default_price_data.recurring.interval, "month")
          assert.equal(params.default_price_data.unit_amount, 1000)
          return {
            id: "prod_mock_1",
            default_price: "price_mock_1",
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
        create: async (params) => {
          assert.equal(params.customer_account, "acct_mock_1")
          assert.equal(params.default_payment_method, "pm_balance_1")
          assert.equal(params.items[0].price, "price_mock_1")
          assert.deepEqual(params.payment_settings.payment_method_types, [
            "stripe_balance",
          ])
          return { id: "sub_mock_1", status: "active" }
        },
      },
    }
  }

  it("runs create-account → account-link → checkout → subscription sequence", async () => {
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

    const { session } = await stripeMod.createEmbeddedCheckoutSession(
      { sellerId: "seller-flow", storePath },
      stripe,
    )
    assert.equal(session.id, "cs_mock_1")

    const plan = await stripeMod.createSubscriptionPlan(
      { sellerId: "seller-flow", storePath },
      stripe,
    )
    assert.equal(plan.priceId, "price_mock_1")

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
    assert.equal(finalRecord.checkoutSessionId, "cs_mock_1")
    assert.equal(finalRecord.priceId, "price_mock_1")
    assert.equal(finalRecord.paymentMethodId, "pm_balance_1")
    assert.equal(finalRecord.subscriptionId, "sub_mock_1")
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

describe("stripe workbench inspector", () => {
  let stripeMod

  before(async () => {
    stripeMod = await import(
      pathToFileURL(path.join(ROOT, "dist", "stripe", "index.js")).href
    )
  })

  it("resolves common object id prefixes", () => {
    assert.equal(stripeMod.resolveResource("cus_abc").resource, "customer")
    assert.equal(stripeMod.resolveResource("pi_abc").resource, "payment_intent")
    assert.equal(stripeMod.resolveResource("sub_abc").resource, "subscription")
    assert.equal(stripeMod.resolveResource("acct_abc").resource, "account")
    assert.equal(stripeMod.resolveResource("acct_abc").api, "v2")
    assert.equal(
      stripeMod.resourcePath(stripeMod.resolveResource("cus_abc"), "cus_abc"),
      "/v1/customers/cus_abc",
    )
    assert.equal(
      stripeMod.resourcePath(stripeMod.resolveResource("acct_1"), "acct_1"),
      "/v2/core/accounts/acct_1",
    )
  })

  it("builds a related-object data map from nested ids", () => {
    const obj = {
      id: "pi_root",
      customer: "cus_related",
      invoice: "in_related",
      metadata: { note: "mentions sub_also but not as id field" },
      charges: { data: [{ id: "ch_nested", payment_intent: "pi_root" }] },
    }
    const map = stripeMod.collectRelatedObjectIds(obj, "pi_root")
    const ids = map.map((r) => r.id).sort()
    assert.deepEqual(ids, ["ch_nested", "cus_related", "in_related", "sub_also"])
    assert.ok(map.some((r) => r.resource === "customer" && r.id === "cus_related"))
  })

  it("inspects an object with mocked retrieve + events", async () => {
    const prevKey = process.env.STRIPE_SECRET_KEY
    process.env.STRIPE_SECRET_KEY = "sk_test_inspector"

    const stripe = {
      v2: { core: { accounts: { retrieve: async () => assert.fail("not acct") } } },
      rawRequest: async (method, path) => {
        assert.equal(method, "GET")
        assert.equal(path, "/v1/customers/cus_inspect")
        return {
          id: "cus_inspect",
          object: "customer",
          email: "a@example.com",
          default_source: null,
          invoice_settings: { default_payment_method: "pm_default" },
        }
      },
      events: {
        list: async () => ({
          data: [
            {
              id: "evt_1",
              type: "customer.updated",
              created: 1,
              request: { id: "req_abc" },
              data: { object: { id: "cus_inspect" } },
            },
            {
              id: "evt_other",
              type: "charge.succeeded",
              created: 2,
              request: { id: "req_other" },
              data: { object: { id: "ch_other" } },
            },
          ],
        }),
      },
    }

    const result = await stripeMod.inspectObject("cus_inspect", {}, stripe)
    assert.equal(result.resource, "customer")
    assert.equal(result.object.id, "cus_inspect")
    assert.equal(result.events.length, 1)
    assert.equal(result.events[0].id, "evt_1")
    assert.deepEqual(result.logs.requestIds, ["req_abc"])
    assert.equal(result.logs.availableViaApi, false)
    assert.match(result.workbenchUrl, /workbench\/inspector/)
    assert.ok(result.dataMap.some((r) => r.id === "pm_default"))
    assert.equal(result.editHint.testMode, true)

    if (prevKey === undefined) delete process.env.STRIPE_SECRET_KEY
    else process.env.STRIPE_SECRET_KEY = prevKey
  })

  it("blocks live-mode mutations in apiExplore unless opted in", async () => {
    const prevKey = process.env.STRIPE_SECRET_KEY
    process.env.STRIPE_SECRET_KEY = "sk_live_inspector"

    const stripe = {
      rawRequest: async () => ({ id: "cus_x" }),
    }

    await assert.rejects(
      () =>
        stripeMod.apiExplore(
          {
            method: "POST",
            path: "/v1/customers/cus_x",
            params: { name: "Nope" },
          },
          stripe,
        ),
      /live-mode/,
    )

    const ok = await stripeMod.apiExplore(
      {
        method: "POST",
        path: "/v1/customers/cus_x",
        params: { name: "Allowed" },
        allowLiveMutations: true,
      },
      stripe,
    )
    assert.equal(ok.method, "POST")
    assert.equal(ok.result.id, "cus_x")

    if (prevKey === undefined) delete process.env.STRIPE_SECRET_KEY
    else process.env.STRIPE_SECRET_KEY = prevKey
  })

  it("updates objects via POST in test mode", async () => {
    const prevKey = process.env.STRIPE_SECRET_KEY
    process.env.STRIPE_SECRET_KEY = "sk_test_update"

    const stripe = {
      rawRequest: async (method, path, params) => {
        assert.equal(method, "POST")
        assert.equal(path, "/v1/products/prod_1")
        assert.equal(params.name, "Renamed")
        return { id: "prod_1", name: "Renamed" }
      },
    }

    const result = await stripeMod.updateObject(
      "prod_1",
      { name: "Renamed" },
      {},
      stripe,
    )
    assert.equal(result.result.name, "Renamed")

    if (prevKey === undefined) delete process.env.STRIPE_SECRET_KEY
    else process.env.STRIPE_SECRET_KEY = prevKey
  })
})
