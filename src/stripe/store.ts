import { promises as fs } from "fs"
import path from "path"
import { optionalEnv } from "./env.js"

/** Persisted Stripe identifiers for a connected seller on this platform. */
export interface ConnectedAccountRecord {
  /** Local domain id (slug) associating Stripe resources with a seller. */
  sellerId: string
  displayName: string
  contactEmail: string
  /** Stripe Accounts v2 id (`acct_...`). */
  accountId: string | null
  accountLinkUrl: string | null
  merchantOnboarded: boolean
  checkoutSessionId: string | null
  checkoutSessionUrl: string | null
  checkoutCompleted: boolean
  productId: string | null
  /** Default price id from the subscription product (`price_...`). */
  priceId: string | null
  paymentMethodId: string | null
  subscriptionId: string | null
  subscriptionPaid: boolean
  updatedAt: string
  createdAt: string
}

export interface StripeStoreData {
  version: 1
  accounts: Record<string, ConnectedAccountRecord>
}

function defaultStorePath(): string {
  return optionalEnv(
    "CUBIC_STRIPE_STORE",
    path.resolve(process.cwd(), ".cubic-stripe.json"),
  )
}

export function createEmptyRecord(
  sellerId: string,
  displayName: string,
  contactEmail: string,
): ConnectedAccountRecord {
  const now = new Date().toISOString()
  return {
    sellerId,
    displayName,
    contactEmail,
    accountId: null,
    accountLinkUrl: null,
    merchantOnboarded: false,
    checkoutSessionId: null,
    checkoutSessionUrl: null,
    checkoutCompleted: false,
    productId: null,
    priceId: null,
    paymentMethodId: null,
    subscriptionId: null,
    subscriptionPaid: false,
    updatedAt: now,
    createdAt: now,
  }
}

export async function loadStore(
  storePath: string = defaultStorePath(),
): Promise<StripeStoreData> {
  try {
    const raw = await fs.readFile(storePath, "utf8")
    const parsed = JSON.parse(raw) as StripeStoreData
    if (!parsed || parsed.version !== 1 || typeof parsed.accounts !== "object") {
      throw new Error(`Invalid Stripe store at ${storePath}`)
    }
    return parsed
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === "ENOENT") {
      return { version: 1, accounts: {} }
    }
    throw err
  }
}

export async function saveStore(
  data: StripeStoreData,
  storePath: string = defaultStorePath(),
): Promise<void> {
  await fs.mkdir(path.dirname(storePath), { recursive: true })
  await fs.writeFile(storePath, JSON.stringify(data, null, 2) + "\n", "utf8")
}

export async function getAccount(
  sellerId: string,
  storePath?: string,
): Promise<ConnectedAccountRecord | null> {
  const store = await loadStore(storePath)
  return store.accounts[sellerId] ?? null
}

export async function upsertAccount(
  record: ConnectedAccountRecord,
  storePath?: string,
): Promise<ConnectedAccountRecord> {
  const store = await loadStore(storePath)
  const updated: ConnectedAccountRecord = {
    ...record,
    updatedAt: new Date().toISOString(),
  }
  store.accounts[record.sellerId] = updated
  await saveStore(store, storePath)
  return updated
}

export async function requireAccount(
  sellerId: string,
  storePath?: string,
): Promise<ConnectedAccountRecord> {
  const record = await getAccount(sellerId, storePath)
  if (!record) {
    throw new Error(
      `No connected account found for seller "${sellerId}". Run create-account first.`,
    )
  }
  return record
}

export async function findAccountByStripeId(
  accountId: string,
  storePath?: string,
): Promise<ConnectedAccountRecord | null> {
  const store = await loadStore(storePath)
  return (
    Object.values(store.accounts).find((a) => a.accountId === accountId) ?? null
  )
}

export async function findAccountByCheckoutSession(
  sessionId: string,
  storePath?: string,
): Promise<ConnectedAccountRecord | null> {
  const store = await loadStore(storePath)
  return (
    Object.values(store.accounts).find(
      (a) => a.checkoutSessionId === sessionId,
    ) ?? null
  )
}

export async function findAccountBySubscription(
  subscriptionId: string,
  storePath?: string,
): Promise<ConnectedAccountRecord | null> {
  const store = await loadStore(storePath)
  return (
    Object.values(store.accounts).find(
      (a) => a.subscriptionId === subscriptionId,
    ) ?? null
  )
}

export { defaultStorePath }
