import { describe, it, before, after } from "node:test"
import assert from "node:assert/strict"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { pathToFileURL } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const distPayments = path.join(__dirname, "..", "dist", "payments")

async function loadPayments() {
  return import(pathToFileURL(path.join(distPayments, "index.js")).href)
}

describe("payments store + domain ops", () => {
  /** @type {string} */
  let storeDir
  /** @type {string} */
  let storePath
  /** @type {any} */
  let PaymentsStore
  /** @type {any} */
  let createAccount
  /** @type {any} */
  let createAccountLink
  /** @type {any} */
  let createCheckoutSession
  /** @type {any} */
  let createPaymentIntent
  /** @type {any} */
  let createSubscriptionProduct
  /** @type {any} */
  let attachBalancePaymentMethod
  /** @type {any} */
  let createSubscription
  /** @type {any} */
  let handlePaymentsWebhook

  before(async () => {
    storeDir = await mkdtemp(path.join(tmpdir(), "cubic-payments-"))
    storePath = path.join(storeDir, "store.json")
    process.env.PAYMENTS_STORE_PATH = storePath
    process.env.STRIPE_SECRET_KEY = "sk_test_dummy"
    process.env.POSTHOG_API_KEY = ""

    const mod = await loadPayments()
    PaymentsStore = mod.PaymentsStore
    createAccount = mod.createAccount
    createAccountLink = mod.createAccountLink
    createCheckoutSession = mod.createCheckoutSession
    createPaymentIntent = mod.createPaymentIntent
    createSubscriptionProduct = mod.createSubscriptionProduct
    attachBalancePaymentMethod = mod.attachBalancePaymentMethod
    createSubscription = mod.createSubscription
    handlePaymentsWebhook = mod.handlePaymentsWebhook
  })

  after(async () => {
    await rm(storeDir, { recursive: true, force: true })
  })

  function mockStripe() {
    return {
      v2: {
        core: {
          accounts: {
            create: async (params) => ({
              id: "acct_test_123",
              object: "v2.core.account",
              display_name: params.display_name,
              contact_email: params.contact_email,
              configuration: params.configuration,
            }),
          },
          accountLinks: {
            create: async (params) => ({
              object: "v2.core.account_link",
              account: params.account,
              url: `https://connect.stripe.com/setup/test/${params.account}`,
              expires_at: new Date(Date.now() + 600_000).toISOString(),
              created: new Date().toISOString(),
              livemode: false,
              use_case: params.use_case,
            }),
          },
        },
      },
      checkout: {
        sessions: {
          create: async (params, options) => ({
            id: "cs_test_123",
            object: "checkout.session",
            url: "https://checkout.stripe.com/c/pay/cs_test_123",
            status: "open",
            mode: params.mode,
            stripeAccount: options?.stripeAccount,
            payment_intent_data: params.payment_intent_data,
          }),
        },
      },
      paymentIntents: {
        create: async (params, options) => ({
          id: "pi_test_123",
          object: "payment_intent",
          amount: params.amount,
          currency: params.currency,
          status: "requires_payment_method",
          client_secret: "pi_test_123_secret_abc",
          automatic_payment_methods: params.automatic_payment_methods,
          application_fee_amount: params.application_fee_amount,
          stripeAccount: options?.stripeAccount,
        }),
      },
      products: {
        create: async (params) => ({
          id: "prod_test_123",
          object: "product",
          name: params.name,
          default_price: "price_test_123",
        }),
        retrieve: async (id) => ({
          id,
          object: "product",
          name: "Platform subscription",
          default_price: "price_test_123",
        }),
      },
      setupIntents: {
        create: async (params) => ({
          id: "seti_test_123",
          object: "setup_intent",
          status: "succeeded",
          customer_account: params.customer_account,
          payment_method: "pm_test_balance",
        }),
      },
      subscriptions: {
        create: async (params) => ({
          id: "sub_test_123",
          object: "subscription",
          status: "active",
          customer_account: params.customer_account,
          default_payment_method: params.default_payment_method,
          items: { data: params.items },
        }),
      },
      webhooks: {
        constructEvent: () => {
          throw new Error("not used in these tests")
        },
      },
    }
  }

  it("persists seller IDs across create-account → account-link → checkout → payment-intent", async () => {
    const store = new PaymentsStore(storePath)
    const stripe = mockStripe()

    const { seller, account } = await createAccount(
      {
        displayName: "Cookie Shop",
        contactEmail: "seller@example.com",
        sellerId: "seller_cookie",
      },
      { stripe, store },
    )

    assert.equal(seller.id, "seller_cookie")
    assert.equal(seller.stripeAccountId, "acct_test_123")
    assert.equal(account.id, "acct_test_123")
    assert.equal(seller.onboardingStatus, "pending")

    const linked = await createAccountLink(
      { sellerId: seller.id },
      { stripe, store },
    )
    assert.match(linked.accountLink.url, /acct_test_123/)
    assert.ok(linked.seller.accountLinkUrl)

    const checkout = await createCheckoutSession(
      { sellerId: seller.id },
      { stripe, store },
    )
    assert.equal(checkout.session.id, "cs_test_123")
    assert.equal(checkout.seller.checkoutSessionId, "cs_test_123")

    const intent = await createPaymentIntent(
      { sellerId: seller.id, amount: 2000 },
      { stripe, store },
    )
    assert.equal(intent.paymentIntent.id, "pi_test_123")
    assert.equal(intent.paymentIntent.amount, 2000)
    assert.equal(intent.paymentIntent.currency, "usd")
    assert.deepEqual(intent.paymentIntent.automatic_payment_methods, {
      enabled: true,
    })
    assert.equal(intent.paymentIntent.stripeAccount, "acct_test_123")
    assert.equal(intent.seller.paymentIntentId, "pi_test_123")

    const reloaded = await store.getSeller(seller.id)
    assert.equal(reloaded.stripeAccountId, "acct_test_123")
    assert.equal(reloaded.checkoutSessionId, "cs_test_123")
    assert.equal(reloaded.paymentIntentId, "pi_test_123")
  })

  it("creates a platform PaymentIntent with automatic payment methods", async () => {
    const store = new PaymentsStore(storePath)
    const stripe = mockStripe()

    const result = await createPaymentIntent({ amount: 2000 }, { stripe, store })
    assert.equal(result.paymentIntent.id, "pi_test_123")
    assert.equal(result.paymentIntent.amount, 2000)
    assert.equal(result.paymentIntent.automatic_payment_methods.enabled, true)
    assert.equal(result.payment.paymentIntentId, "pi_test_123")
    assert.equal(result.payment.status, "requires_payment_method")

    const reloaded = await store.getPayment(result.payment.id)
    assert.equal(reloaded.paymentIntentId, "pi_test_123")
  })

  it("creates subscription product, attaches balance PM, and charges subscription", async () => {
    const store = new PaymentsStore(storePath)
    const stripe = mockStripe()

    // Ensure seller exists from previous test or create fresh
    let seller = await store.getSeller("seller_cookie")
    if (!seller) {
      ;({ seller } = await createAccount(
        { sellerId: "seller_sub", displayName: "Sub Seller" },
        { stripe, store },
      ))
    }

    const product = await createSubscriptionProduct(
      { name: "Platform subscription", unitAmount: 1000 },
      { stripe, store },
    )
    assert.equal(product.priceId, "price_test_123")
    assert.equal((await store.getCatalog()).priceId, "price_test_123")

    // Reuse should not create again
    let createdAgain = false
    const stripeReuse = {
      ...stripe,
      products: {
        ...stripe.products,
        create: async () => {
          createdAgain = true
          throw new Error("should reuse catalog")
        },
      },
    }
    const reused = await createSubscriptionProduct({}, { stripe: stripeReuse, store })
    assert.equal(reused.priceId, "price_test_123")
    assert.equal(createdAgain, false)

    const attached = await attachBalancePaymentMethod(
      { sellerId: seller.id },
      { stripe, store },
    )
    assert.equal(attached.paymentMethodId, "pm_test_balance")

    const sub = await createSubscription(
      { sellerId: seller.id },
      { stripe, store },
    )
    assert.equal(sub.subscription.id, "sub_test_123")
    assert.equal(sub.seller.subscriptionId, "sub_test_123")
    assert.equal(sub.seller.paymentMethodId, "pm_test_balance")
  })

  it("handles webhook events and updates seller records", async () => {
    const store = new PaymentsStore(storePath)
    const sellers = await store.listSellers()
    const seller = sellers[0]
    assert.ok(seller)

    const onboardEvent = {
      type: "v2.core.account[configuration.merchant].capability_status_updated",
      data: { object: { id: seller.stripeAccountId } },
    }
    const onboardResult = await handlePaymentsWebhook(
      JSON.stringify(onboardEvent),
      undefined,
      { store, stripe: mockStripe() },
    )
    assert.equal(onboardResult.handled, true)
    assert.equal((await store.getSeller(seller.id)).onboardingStatus, "complete")

    await store.updateSeller(seller.id, {
      checkoutSessionId: "cs_test_123",
    })
    const checkoutEvent = {
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test_123",
          status: "complete",
          url: "https://checkout.stripe.com/c/pay/cs_test_123",
        },
      },
    }
    const checkoutResult = await handlePaymentsWebhook(
      JSON.stringify(checkoutEvent),
      undefined,
      { store, stripe: mockStripe() },
    )
    assert.equal(checkoutResult.handled, true)
    assert.equal(
      (await store.getSeller(seller.id)).lastCheckoutSessionStatus,
      "complete",
    )

    await store.updateSeller(seller.id, {
      paymentIntentId: "pi_test_seller",
    })
    const paymentIntentEvent = {
      type: "payment_intent.succeeded",
      data: {
        object: {
          id: "pi_test_seller",
          status: "succeeded",
          client_secret: "pi_test_123_secret_abc",
        },
      },
    }
    const paymentIntentResult = await handlePaymentsWebhook(
      JSON.stringify(paymentIntentEvent),
      undefined,
      { store, stripe: mockStripe() },
    )
    assert.equal(paymentIntentResult.handled, true)
    assert.equal(
      (await store.getSeller(seller.id)).lastPaymentIntentStatus,
      "succeeded",
    )

    const { payment } = await createPaymentIntent({}, {
      stripe: {
        ...mockStripe(),
        paymentIntents: {
          create: async (params) => ({
            id: "pi_test_456",
            object: "payment_intent",
            amount: params.amount,
            currency: params.currency,
            status: "requires_payment_method",
            client_secret: "pi_test_456_secret",
            automatic_payment_methods: params.automatic_payment_methods,
          }),
        },
      },
      store,
    })
    const platformPiEvent = {
      type: "payment_intent.succeeded",
      data: {
        object: {
          id: "pi_test_456",
          status: "succeeded",
        },
      },
    }
    const platformPiResult = await handlePaymentsWebhook(
      JSON.stringify(platformPiEvent),
      undefined,
      { store, stripe: mockStripe() },
    )
    assert.equal(platformPiResult.handled, true)
    assert.equal(platformPiResult.paymentId, payment.id)
    assert.equal((await store.getPayment(payment.id)).status, "succeeded")

    await store.updateSeller(seller.id, { subscriptionId: "sub_test_123" })
    const invoiceEvent = {
      type: "invoice.payment_succeeded",
      data: {
        object: {
          id: "in_test_123",
          customer_account: seller.stripeAccountId,
          parent: {
            type: "subscription_details",
            subscription_details: { subscription: "sub_test_123" },
            quote_details: null,
          },
        },
      },
    }
    const invoiceResult = await handlePaymentsWebhook(
      JSON.stringify(invoiceEvent),
      undefined,
      { store, stripe: mockStripe() },
    )
    assert.equal(invoiceResult.handled, true)
    assert.equal((await store.getSeller(seller.id)).subscriptionStatus, "active")
  })
})
