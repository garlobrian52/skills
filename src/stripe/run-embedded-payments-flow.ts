import type { StripeConfig } from "./config.js"
import { StripeStore } from "./store.js"
import { createAccount } from "./create-account.js"
import { createAccountLink } from "./create-account-link.js"
import { waitForAccountOnboard } from "./wait-for-account-onboard.js"
import { createCheckoutSession } from "./create-checkout-session.js"
import { waitForCheckout } from "./wait-for-checkout.js"
import { createProduct } from "./create-product.js"
import { createSetupIntent } from "./create-setup-intent.js"
import { createSubscription } from "./create-subscription.js"
import { waitForSubscription } from "./wait-for-subscription.js"

export interface RunEmbeddedPaymentsFlowOptions {
  skipOnboardingWait?: boolean
  skipCheckoutWait?: boolean
  skipSubscriptionWait?: boolean
}

export interface RunEmbeddedPaymentsFlowResult {
  accountId: string
  accountLinkUrl: string | null
  checkoutSessionUrl: string | null
  productId: string
  defaultPriceId: string
  subscriptionId: string
}

export async function runEmbeddedPaymentsFlow(
  config: StripeConfig,
  store: StripeStore,
  options: RunEmbeddedPaymentsFlowOptions = {},
): Promise<RunEmbeddedPaymentsFlowResult> {
  const { account } = await createAccount(config, store)
  const { accountLink } = await createAccountLink(config, store, {
    accountId: account.id,
  })

  if (!options.skipOnboardingWait) {
    await waitForAccountOnboard(config, store, { accountId: account.id })
  }

  const { session } = await createCheckoutSession(config, store, {
    accountId: account.id,
  })

  if (!options.skipCheckoutWait) {
    await waitForCheckout(config, store, {
      accountId: account.id,
      sessionId: session.id,
    })
  }

  const { product } = await createProduct(config, store)
  await createSetupIntent(config, store, { accountId: account.id })
  const { subscription } = await createSubscription(config, store, {
    accountId: account.id,
  })

  if (!options.skipSubscriptionWait) {
    await waitForSubscription(config, store, {
      subscriptionId: subscription.id,
    })
  }

  const data = await store.read()

  return {
    accountId: account.id,
    accountLinkUrl: accountLink.url,
    checkoutSessionUrl: session.url,
    productId: product.id,
    subscriptionId: subscription.id,
    defaultPriceId: data.defaultPriceId!,
  }
}
