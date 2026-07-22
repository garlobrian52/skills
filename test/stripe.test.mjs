import { describe, it, after, beforeEach } from "node:test"
import assert from "node:assert/strict"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { mkdir, rm } from "node:fs/promises"
import { pathToFileURL } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const TMP = path.join(__dirname, "..", ".test-output", "stripe")

async function cleanup() {
  await rm(TMP, { recursive: true, force: true }).catch(() => {})
}

function mockStripe(overrides = {}) {
  const state = {
    accounts: [],
    accountLinks: [],
    sessions: [],
    products: [],
    setupIntents: [],
    subscriptions: [],
  }

  const stripe = {
    v2: {
      core: {
        accounts: {
          create: async (params) => {
            const account = {
              id: `acct_test_${state.accounts.length + 1}`,
              object: "v2.core.account",
              display_name: params.display_name,
              contact_email: params.contact_email,
              configuration: params.configuration,
              identity: params.identity,
              dashboard: params.dashboard,
              defaults: params.defaults,
            }
            state.accounts.push({ params, account })
            return account
          },
        },
        accountLinks: {
          create: async (params) => {
            const accountLink = {
              object: "v2.core.account_link",
              account: params.account,
              url: `https://connect.stripe.com/setup/s/${params.account}`,
              created: new Date().toISOString(),
              expires_at: new Date(Date.now() + 3600_000).toISOString(),
              livemode: false,
              use_case: params.use_case,
            }
            state.accountLinks.push({ params, accountLink })
            return accountLink
          },
        },
      },
    },
    checkout: {
      sessions: {
        create: async (params, options) => {
          const session = {
            id: `cs_test_${state.sessions.length + 1}`,
            object: "checkout.session",
            url: `https://checkout.stripe.com/c/pay/cs_test_${state.sessions.length + 1}`,
            mode: params.mode,
            success_url: params.success_url,
            payment_intent_data: params.payment_intent_data,
            line_items: params.line_items,
            payment_method_types: params.payment_method_types,
          }
          state.sessions.push({ params, options, session })
          return session
        },
      },
    },
    products: {
      create: async (params) => {
        const priceId = `price_test_${state.products.length + 1}`
        const product = {
          id: `prod_test_${state.products.length + 1}`,
          object: "product",
          name: params.name,
          default_price: priceId,
          default_price_data: params.default_price_data,
        }
        state.products.push({ params, product, priceId })
        return product
      },
    },
    setupIntents: {
      create: async (params) => {
        const setupIntent = {
          id: `seti_test_${state.setupIntents.length + 1}`,
          object: "setup_intent",
          status: "succeeded",
          payment_method: `pm_test_${state.setupIntents.length + 1}`,
          customer_account: params.customer_account,
          payment_method_types: params.payment_method_types,
          usage: params.usage,
        }
        state.setupIntents.push({ params, setupIntent })
        return setupIntent
      },
    },
    subscriptions: {
      create: async (params) => {
        const subscription = {
          id: `sub_test_${state.subscriptions.length + 1}`,
          object: "subscription",
          status: "active",
          customer_account: params.customer_account,
          default_payment_method: params.default_payment_method,
          items: params.items,
          payment_settings: params.payment_settings,
        }
        state.subscriptions.push({ params, subscription })
        return subscription
      },
    },
    ...overrides,
  }

  return { stripe, state }
}

describe("stripe accounts v2 integration", () => {
  beforeEach(cleanup)
  after(cleanup)

  it("persists merchants and reuses stripe ids across the blueprint flow", async () => {
    await mkdir(TMP, { recursive: true })
    const storePath = path.join(TMP, "store.json")
    const { stripe, state } = mockStripe()

    const {
      createAccount,
      createAccountLink,
      createCheckoutSession,
      createProduct,
      createSetupIntent,
      createSubscription,
      handleStripeEvent,
      loadStore,
    } = await import(
      pathToFileURL(path.join(__dirname, "..", "dist", "stripe", "index.js")).href
    )

    const created = await createAccount(
      stripe,
      {
        displayName: "Test account",
        contactEmail: "testaccount@example.com",
        country: "us",
      },
      storePath,
    )
    assert.equal(created.account.id, "acct_test_1")
    assert.ok(created.merchant.id)
    assert.equal(created.merchant.stripeAccountId, "acct_test_1")

    const accountParams = state.accounts[0].params
    assert.equal(accountParams.dashboard, "full")
    assert.equal(accountParams.defaults.responsibilities.fees_collector, "stripe")
    assert.equal(accountParams.defaults.responsibilities.losses_collector, "stripe")
    assert.deepEqual(accountParams.include, [
      "configuration.merchant",
      "configuration.recipient",
      "identity",
      "defaults",
      "configuration.customer",
    ])
    assert.equal(
      accountParams.configuration.merchant.simulate_accept_tos_obo,
      true,
    )
    assert.ok(accountParams.configuration.customer)
    assert.equal(accountParams.identity.country, "us")
    assert.equal(accountParams.identity.business_details.phone, "0000000000")

    const link = await createAccountLink(
      stripe,
      { merchantId: created.merchant.id },
      storePath,
    )
    assert.match(link.accountLink.url, /^https:\/\/connect\.stripe\.com\//)
    assert.deepEqual(
      link.accountLink.use_case.account_onboarding.configurations,
      ["merchant", "customer"],
    )

    const checkout = await createCheckoutSession(
      stripe,
      {
        merchantId: created.merchant.id,
        currency: "usd",
        unitAmount: 100000,
        applicationFeeAmount: 123,
      },
      storePath,
    )
    assert.equal(checkout.session.id, "cs_test_1")
    assert.equal(state.sessions[0].options.stripeAccount, "acct_test_1")
    assert.equal(
      state.sessions[0].params.payment_intent_data.application_fee_amount,
      123,
    )
    assert.equal(state.sessions[0].params.mode, "payment")
    assert.equal(
      state.sessions[0].params.line_items[0].price_data.unit_amount,
      100000,
    )

    const product = await createProduct(
      stripe,
      {
        merchantId: created.merchant.id,
        currency: "usd",
        unitAmount: 1000,
        interval: "month",
      },
      storePath,
    )
    assert.equal(product.priceId, "price_test_1")
    assert.equal(
      state.products[0].params.default_price_data.recurring.interval,
      "month",
    )

    const setup = await createSetupIntent(
      stripe,
      { merchantId: created.merchant.id },
      storePath,
    )
    assert.equal(setup.paymentMethodId, "pm_test_1")
    assert.deepEqual(state.setupIntents[0].params.payment_method_types, [
      "stripe_balance",
    ])
    assert.equal(state.setupIntents[0].params.customer_account, "acct_test_1")
    assert.equal(state.setupIntents[0].params.confirm, true)
    assert.equal(state.setupIntents[0].params.usage, "off_session")
    assert.equal(
      state.setupIntents[0].params.payment_method_data.type,
      "stripe_balance",
    )

    const sub = await createSubscription(
      stripe,
      { merchantId: created.merchant.id },
      storePath,
    )
    assert.equal(sub.subscription.id, "sub_test_1")
    assert.equal(state.subscriptions[0].params.customer_account, "acct_test_1")
    assert.equal(
      state.subscriptions[0].params.default_payment_method,
      "pm_test_1",
    )
    assert.equal(state.subscriptions[0].params.items[0].price, "price_test_1")
    assert.deepEqual(
      state.subscriptions[0].params.payment_settings.payment_method_types,
      ["stripe_balance"],
    )

    const afterCapability = await handleStripeEvent(
      {
        type: "v2.core.account[configuration.merchant].capability_status_updated",
        related_object: { id: "acct_test_1" },
        data: {
          object: {
            id: "acct_test_1",
            configuration: {
              merchant: {
                capabilities: { card_payments: { status: "active" } },
              },
            },
          },
        },
      },
      storePath,
    )
    assert.equal(afterCapability.handled, true)

    const afterCheckout = await handleStripeEvent(
      {
        type: "checkout.session.completed",
        data: { object: { id: "cs_test_1", url: checkout.session.url } },
      },
      storePath,
    )
    assert.equal(afterCheckout.handled, true)

    const afterInvoice = await handleStripeEvent(
      {
        type: "invoice.payment_succeeded",
        data: {
          object: {
            customer_account: "acct_test_1",
            subscription: "sub_test_1",
          },
        },
      },
      storePath,
    )
    assert.equal(afterInvoice.handled, true)

    const store = await loadStore(storePath)
    assert.equal(store.merchants.length, 1)
    const merchant = store.merchants[0]
    assert.equal(merchant.stripeAccountId, "acct_test_1")
    assert.equal(merchant.stripeCheckoutSessionId, "cs_test_1")
    assert.equal(merchant.stripePriceId, "price_test_1")
    assert.equal(merchant.stripeDefaultPaymentMethodId, "pm_test_1")
    assert.equal(merchant.stripeSubscriptionId, "sub_test_1")
    assert.equal(merchant.merchantCapabilityStatus, "active")
    assert.equal(merchant.subscriptionStatus, "active")
    assert.ok(merchant.onboardedAt)
  })

  it("createStripeClient requires STRIPE_SECRET_KEY", async () => {
    const { createStripeClient } = await import(
      pathToFileURL(path.join(__dirname, "..", "dist", "stripe", "client.js")).href
    )
    const prev = process.env.STRIPE_SECRET_KEY
    delete process.env.STRIPE_SECRET_KEY
    try {
      assert.throws(() => createStripeClient(""), /STRIPE_SECRET_KEY/)
    } finally {
      if (prev !== undefined) process.env.STRIPE_SECRET_KEY = prev
    }
  })

  it("exposes stripe subcommands on the CLI", async () => {
    await mkdir(TMP, { recursive: true })
    const { execFile } = await import("node:child_process")
    const { promisify } = await import("node:util")
    const exec = promisify(execFile)
    const CLI = path.join(__dirname, "..", "dist", "index.js")
    const { stdout } = await exec("node", [CLI, "stripe", "--help"])
    assert.match(stdout, /create-account/)
    assert.match(stdout, /create-account-link/)
    assert.match(stdout, /create-checkout-session/)
    assert.match(stdout, /create-product/)
    assert.match(stdout, /create-setup-intent/)
    assert.match(stdout, /create-subscription/)
    assert.match(stdout, /handle-webhook/)
  })
})
