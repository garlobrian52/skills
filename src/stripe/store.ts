import { promises as fs } from "fs"
import path from "path"
import { randomUUID } from "crypto"
import type {
  CheckoutPayment,
  Seller,
  SellerSubscription,
  StripeStoreData,
  SubscriptionPlan,
} from "./types.js"

const EMPTY: StripeStoreData = {
  sellers: [],
  plans: [],
  subscriptions: [],
  checkouts: [],
}

function defaultStorePath(): string {
  return (
    process.env.STRIPE_STORE_PATH ||
    path.join(process.cwd(), ".cubic-stripe-store.json")
  )
}

export async function loadStore(
  storePath = defaultStorePath(),
): Promise<StripeStoreData> {
  try {
    const raw = await fs.readFile(storePath, "utf8")
    const data = JSON.parse(raw) as Partial<StripeStoreData>
    return {
      sellers: data.sellers ?? [],
      plans: data.plans ?? [],
      subscriptions: data.subscriptions ?? [],
      checkouts: data.checkouts ?? [],
    }
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException)?.code
    if (code === "ENOENT") return { ...EMPTY, sellers: [], plans: [], subscriptions: [], checkouts: [] }
    throw err
  }
}

export async function saveStore(
  data: StripeStoreData,
  storePath = defaultStorePath(),
): Promise<void> {
  await fs.mkdir(path.dirname(storePath), { recursive: true })
  await fs.writeFile(storePath, JSON.stringify(data, null, 2) + "\n", "utf8")
}

export function newId(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 16)}`
}

export async function upsertSeller(
  seller: Seller,
  storePath?: string,
): Promise<Seller> {
  const store = await loadStore(storePath)
  const idx = store.sellers.findIndex((s) => s.id === seller.id)
  if (idx >= 0) store.sellers[idx] = seller
  else store.sellers.push(seller)
  await saveStore(store, storePath)
  return seller
}

export async function findSellerByStripeAccountId(
  stripeAccountId: string,
  storePath?: string,
): Promise<Seller | undefined> {
  const store = await loadStore(storePath)
  return store.sellers.find((s) => s.stripeAccountId === stripeAccountId)
}

export async function findSellerById(
  id: string,
  storePath?: string,
): Promise<Seller | undefined> {
  const store = await loadStore(storePath)
  return store.sellers.find((s) => s.id === id)
}

export async function upsertPlan(
  plan: SubscriptionPlan,
  storePath?: string,
): Promise<SubscriptionPlan> {
  const store = await loadStore(storePath)
  const idx = store.plans.findIndex((p) => p.id === plan.id)
  if (idx >= 0) store.plans[idx] = plan
  else store.plans.push(plan)
  await saveStore(store, storePath)
  return plan
}

export async function getLatestPlan(
  storePath?: string,
): Promise<SubscriptionPlan | undefined> {
  const store = await loadStore(storePath)
  return store.plans[store.plans.length - 1]
}

export async function upsertSubscription(
  sub: SellerSubscription,
  storePath?: string,
): Promise<SellerSubscription> {
  const store = await loadStore(storePath)
  const idx = store.subscriptions.findIndex((s) => s.id === sub.id)
  if (idx >= 0) store.subscriptions[idx] = sub
  else store.subscriptions.push(sub)
  await saveStore(store, storePath)
  return sub
}

export async function findSubscriptionByStripeId(
  stripeSubscriptionId: string,
  storePath?: string,
): Promise<SellerSubscription | undefined> {
  const store = await loadStore(storePath)
  return store.subscriptions.find(
    (s) => s.stripeSubscriptionId === stripeSubscriptionId,
  )
}

export async function upsertCheckout(
  checkout: CheckoutPayment,
  storePath?: string,
): Promise<CheckoutPayment> {
  const store = await loadStore(storePath)
  const idx = store.checkouts.findIndex((c) => c.id === checkout.id)
  if (idx >= 0) store.checkouts[idx] = checkout
  else store.checkouts.push(checkout)
  await saveStore(store, storePath)
  return checkout
}

export async function findCheckoutBySessionId(
  sessionId: string,
  storePath?: string,
): Promise<CheckoutPayment | undefined> {
  const store = await loadStore(storePath)
  return store.checkouts.find((c) => c.stripeCheckoutSessionId === sessionId)
}
