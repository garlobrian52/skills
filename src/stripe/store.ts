import { promises as fs } from "fs"
import path from "path"
import { randomUUID } from "crypto"
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
  /** One-time Checkout product id (`prod_...`). */
  checkoutProductId: string | null
  /** One-time Checkout price id (`price_...`). */
  checkoutPriceId: string | null
  productId: string | null
  /** Default price id from the subscription product (`price_...`). */
  priceId: string | null
  paymentMethodId: string | null
  subscriptionId: string | null
  subscriptionPaid: boolean
  /** Latest embedded PaymentIntent id (`pi_...`). */
  paymentIntentId: string | null
  /** Latest embedded PaymentIntent status (never store the client_secret). */
  paymentIntentStatus: string | null
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

/**
 * Build a null-prototype accounts map so seller ids like `__proto__` or
 * `constructor` are stored and read as plain own properties instead of
 * colliding with `Object.prototype` accessors.
 */
function toSafeAccounts(
  input: unknown,
): Record<string, ConnectedAccountRecord> {
  const safe = Object.create(null) as Record<string, ConnectedAccountRecord>
  if (input && typeof input === "object") {
    for (const key of Object.keys(input as Record<string, unknown>)) {
      safe[key] = (input as Record<string, ConnectedAccountRecord>)[key]
    }
  }
  return safe
}

/**
 * Serialize all read-modify-write cycles against a given store file so
 * overlapping mutations (e.g. concurrent webhook deliveries) cannot clobber
 * each other's changes. One promise chain is kept per resolved path.
 */
const locks = new Map<string, Promise<unknown>>()

function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(key) ?? Promise.resolve()
  const run = prev.then(() => fn())
  // Keep the chain alive even if this task rejects.
  locks.set(
    key,
    run.then(
      () => undefined,
      () => undefined,
    ),
  )
  return run
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
    checkoutProductId: null,
    checkoutPriceId: null,
    productId: null,
    priceId: null,
    paymentMethodId: null,
    subscriptionId: null,
    subscriptionPaid: false,
    paymentIntentId: null,
    paymentIntentStatus: null,
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
    return { version: 1, accounts: toSafeAccounts(parsed.accounts) }
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === "ENOENT") {
      return { version: 1, accounts: toSafeAccounts(null) }
    }
    throw err
  }
}

export async function saveStore(
  data: StripeStoreData,
  storePath: string = defaultStorePath(),
): Promise<void> {
  await fs.mkdir(path.dirname(storePath), { recursive: true })
  // Write to a temp file in the same directory then atomically rename so a
  // crash mid-write can never leave a truncated/corrupt store behind.
  const tmpPath = `${storePath}.${randomUUID()}.tmp`
  const serialized = JSON.stringify(data, null, 2) + "\n"
  try {
    await fs.writeFile(tmpPath, serialized, "utf8")
    await fs.rename(tmpPath, storePath)
  } catch (err) {
    await fs.rm(tmpPath, { force: true }).catch(() => {})
    throw err
  }
}

/**
 * Run `fn` against the store under an exclusive lock and persist the result.
 * Use this for every read-modify-write so concurrent callers are serialized.
 */
export async function mutateStore<T>(
  fn: (store: StripeStoreData) => T | Promise<T>,
  storePath: string = defaultStorePath(),
): Promise<T> {
  const resolved = path.resolve(storePath)
  return withLock(resolved, async () => {
    const store = await loadStore(resolved)
    const result = await fn(store)
    await saveStore(store, resolved)
    return result
  })
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
  return mutateStore((store) => {
    const updated: ConnectedAccountRecord = {
      ...record,
      updatedAt: new Date().toISOString(),
    }
    store.accounts[record.sellerId] = updated
    return updated
  }, storePath)
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

/** In-memory finder used by locked mutations (operates on a loaded store). */
export function findRecordByStripeId(
  store: StripeStoreData,
  accountId: string,
): ConnectedAccountRecord | null {
  return (
    Object.values(store.accounts).find((a) => a.accountId === accountId) ?? null
  )
}

/** In-memory finder used by locked mutations (operates on a loaded store). */
export function findRecordByCheckoutSession(
  store: StripeStoreData,
  sessionId: string,
): ConnectedAccountRecord | null {
  return (
    Object.values(store.accounts).find(
      (a) => a.checkoutSessionId === sessionId,
    ) ?? null
  )
}

/** In-memory finder used by locked mutations (operates on a loaded store). */
export function findRecordBySubscription(
  store: StripeStoreData,
  subscriptionId: string,
): ConnectedAccountRecord | null {
  return (
    Object.values(store.accounts).find(
      (a) => a.subscriptionId === subscriptionId,
    ) ?? null
  )
}

export async function findAccountByStripeId(
  accountId: string,
  storePath?: string,
): Promise<ConnectedAccountRecord | null> {
  const store = await loadStore(storePath)
  return findRecordByStripeId(store, accountId)
}

export async function findAccountByCheckoutSession(
  sessionId: string,
  storePath?: string,
): Promise<ConnectedAccountRecord | null> {
  const store = await loadStore(storePath)
  return findRecordByCheckoutSession(store, sessionId)
}

export async function findAccountBySubscription(
  subscriptionId: string,
  storePath?: string,
): Promise<ConnectedAccountRecord | null> {
  const store = await loadStore(storePath)
  return findRecordBySubscription(store, subscriptionId)
}

export { defaultStorePath }
