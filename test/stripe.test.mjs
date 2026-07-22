import { describe, it, beforeEach, after } from "node:test"
import assert from "node:assert/strict"
import { mkdtemp, rm } from "node:fs/promises"
import path from "node:path"
import os from "os"
import { pathToFileURL } from "node:url"

describe("stripe store", () => {
  let tempDir
  let statePath

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "stripe-store-"))
    statePath = path.join(tempDir, "state.json")
  })

  after(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  it("loads an empty state when the file is missing", async () => {
    const { loadStripeState } = await import("../dist/stripe/store.js")
    const state = await loadStripeState(statePath)
    assert.deepEqual(state, {})
  })

  it("persists and merges Stripe resource identifiers", async () => {
    const { updateStripeState, loadStripeState } = await import(
      "../dist/stripe/store.js"
    )

    await updateStripeState({ accountId: "acct_123" }, statePath)
    const merged = await updateStripeState(
      { checkoutSessionId: "cs_123" },
      statePath,
    )

    assert.equal(merged.accountId, "acct_123")
    assert.equal(merged.checkoutSessionId, "cs_123")

    const reloaded = await loadStripeState(statePath)
    assert.equal(reloaded.defaultPriceId, undefined)
    assert.equal(reloaded.checkoutSessionId, "cs_123")
  })
})

describe("stripe webhook handler", () => {
  let tempDir
  let statePath

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "stripe-webhook-"))
    statePath = path.join(tempDir, "state.json")
  })

  after(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  it("marks checkout and subscription events in state", async () => {
    const { handleStripeEvent } = await import("../dist/stripe/webhooks.js")
    const { loadStripeState } = await import("../dist/stripe/store.js")

    await handleStripeEvent(
      { type: "checkout.session.completed" },
      statePath,
    )
    await handleStripeEvent(
      { type: "invoice.payment_succeeded" },
      statePath,
    )
    await handleStripeEvent(
      {
        type: "v2.core.account[configuration.merchant].capability_status_updated",
      },
      statePath,
    )

    const state = await loadStripeState(statePath)
    assert.equal(state.checkoutCompleted, true)
    assert.equal(state.subscriptionPaid, true)
    assert.equal(state.merchantCapabilityReady, true)
  })
})

describe("stripe config", () => {
  const originalSecret = process.env.STRIPE_SECRET_KEY

  after(() => {
    if (originalSecret === undefined) {
      delete process.env.STRIPE_SECRET_KEY
    } else {
      process.env.STRIPE_SECRET_KEY = originalSecret
    }
  })

  it("requires STRIPE_SECRET_KEY", async () => {
    delete process.env.STRIPE_SECRET_KEY
    const { loadStripeConfig } = await import(
      `${pathToFileURL(path.join(process.cwd(), "dist/stripe/config.js")).href}?t=${Date.now()}`
    )

    assert.throws(
      () => loadStripeConfig(),
      /STRIPE_SECRET_KEY is required/,
    )
  })
})
