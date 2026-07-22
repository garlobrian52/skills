import { promises as fs } from "fs"
import path from "path"
import os from "os"
import { randomUUID } from "crypto"
import type { ConnectedMerchant, StripeStoreData } from "./types.js"

const STORE_VERSION = 1 as const

export function defaultStorePath(): string {
  return (
    process.env.STRIPE_DATA_PATH ??
    path.join(os.homedir(), ".cubic-plugin", "stripe-store.json")
  )
}

function emptyStore(): StripeStoreData {
  return { version: STORE_VERSION, merchants: [] }
}

export async function loadStore(
  storePath: string = defaultStorePath(),
): Promise<StripeStoreData> {
  try {
    const raw = await fs.readFile(storePath, "utf-8")
    const data = JSON.parse(raw) as StripeStoreData
    if (!data || data.version !== STORE_VERSION || !Array.isArray(data.merchants)) {
      return emptyStore()
    }
    return data
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException)?.code
    if (code === "ENOENT") return emptyStore()
    throw err
  }
}

export async function saveStore(
  data: StripeStoreData,
  storePath: string = defaultStorePath(),
): Promise<void> {
  await fs.mkdir(path.dirname(storePath), { recursive: true })
  await fs.writeFile(storePath, JSON.stringify(data, null, 2) + "\n")
}

export function createMerchantRecord(
  partial: Partial<ConnectedMerchant> & {
    displayName: string
    contactEmail: string
  },
): ConnectedMerchant {
  const now = new Date().toISOString()
  return {
    id: partial.id ?? randomUUID(),
    displayName: partial.displayName,
    contactEmail: partial.contactEmail,
    stripeAccountId: partial.stripeAccountId ?? null,
    stripeDefaultPaymentMethodId: partial.stripeDefaultPaymentMethodId ?? null,
    stripeProductId: partial.stripeProductId ?? null,
    stripePriceId: partial.stripePriceId ?? null,
    stripeSubscriptionId: partial.stripeSubscriptionId ?? null,
    stripeCheckoutSessionId: partial.stripeCheckoutSessionId ?? null,
    stripeCheckoutSessionUrl: partial.stripeCheckoutSessionUrl ?? null,
    merchantCapabilityStatus: partial.merchantCapabilityStatus ?? null,
    subscriptionStatus: partial.subscriptionStatus ?? null,
    onboardedAt: partial.onboardedAt ?? null,
    createdAt: partial.createdAt ?? now,
    updatedAt: partial.updatedAt ?? now,
  }
}

export async function upsertMerchant(
  merchant: ConnectedMerchant,
  storePath: string = defaultStorePath(),
): Promise<ConnectedMerchant> {
  const store = await loadStore(storePath)
  const idx = store.merchants.findIndex((m) => m.id === merchant.id)
  const updated = { ...merchant, updatedAt: new Date().toISOString() }
  if (idx === -1) store.merchants.push(updated)
  else store.merchants[idx] = updated
  await saveStore(store, storePath)
  return updated
}

export async function findMerchantById(
  id: string,
  storePath: string = defaultStorePath(),
): Promise<ConnectedMerchant | null> {
  const store = await loadStore(storePath)
  return store.merchants.find((m) => m.id === id) ?? null
}

export async function findMerchantByStripeAccountId(
  stripeAccountId: string,
  storePath: string = defaultStorePath(),
): Promise<ConnectedMerchant | null> {
  const store = await loadStore(storePath)
  return (
    store.merchants.find((m) => m.stripeAccountId === stripeAccountId) ?? null
  )
}

export async function requireMerchant(
  opts: { merchantId?: string; accountId?: string },
  storePath: string = defaultStorePath(),
): Promise<ConnectedMerchant> {
  if (opts.merchantId) {
    const m = await findMerchantById(opts.merchantId, storePath)
    if (!m) throw new Error(`Merchant not found: ${opts.merchantId}`)
    return m
  }
  if (opts.accountId) {
    const m = await findMerchantByStripeAccountId(opts.accountId, storePath)
    if (!m) throw new Error(`Merchant not found for account: ${opts.accountId}`)
    return m
  }
  const store = await loadStore(storePath)
  if (store.merchants.length === 1) return store.merchants[0]
  throw new Error(
    "Specify --merchant-id or --account-id (or ensure exactly one merchant exists in the store).",
  )
}
