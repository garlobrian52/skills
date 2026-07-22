import { describe, it, after } from "node:test"
import assert from "node:assert/strict"
import { mkdtemp, rm } from "node:fs/promises"
import path from "node:path"
import os from "os"
import { loadStripeConfig } from "../dist/stripe/config.js"
import { StripeStore } from "../dist/stripe/store.js"

describe("stripe config", () => {
  it("throws when STRIPE_SECRET_KEY is missing", () => {
    const original = process.env.STRIPE_SECRET_KEY
    delete process.env.STRIPE_SECRET_KEY
    try {
      assert.throws(() => loadStripeConfig(), /STRIPE_SECRET_KEY/)
    } finally {
      if (original !== undefined) {
        process.env.STRIPE_SECRET_KEY = original
      }
    }
  })

  it("loads defaults from environment", () => {
    const config = loadStripeConfig({
      secretKey: "sk_test_example",
      currency: "eur",
      connectedAccountCountry: "de",
      storePath: "/tmp/store.json",
    })
    assert.equal(config.secretKey, "sk_test_example")
    assert.equal(config.currency, "eur")
    assert.equal(config.connectedAccountCountry, "de")
    assert.equal(config.storePath, "/tmp/store.json")
  })
})

describe("stripe store", () => {
  let tmpDir

  after(async () => {
    if (tmpDir) {
      await rm(tmpDir, { recursive: true, force: true })
    }
  })

  it("persists and retrieves Stripe resource IDs", async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "stripe-store-"))
    const storePath = path.join(tmpDir, "store.json")
    const store = new StripeStore(storePath)

    assert.deepEqual(await store.read(), {})

    await store.update({ accountId: "acct_123" })
    const data = await store.read()
    assert.equal(data.accountId, "acct_123")

    await store.update({ checkoutSessionId: "cs_123" })
    const merged = await store.read()
    assert.equal(merged.accountId, "acct_123")
    assert.equal(merged.checkoutSessionId, "cs_123")
  })

  it("require throws when a key is missing", async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "stripe-store-"))
    const store = new StripeStore(path.join(tmpDir, "store.json"))
    await assert.rejects(
      () => store.require("accountId", "Connected account ID"),
      /Connected account ID/,
    )
  })
})
