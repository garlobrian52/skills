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
