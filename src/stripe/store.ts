import { promises as fs } from "fs"
import path from "path"

export interface StripeState {
  accountId?: string
  accountLinkUrl?: string
  checkoutSessionId?: string
  checkoutSessionUrl?: string
  productId?: string
  defaultPriceId?: string
  setupIntentId?: string
  defaultPaymentMethodId?: string
  subscriptionId?: string
  merchantCapabilityReady?: boolean
  checkoutCompleted?: boolean
  subscriptionPaid?: boolean
}

const DEFAULT_STATE_PATH = ".stripe-state.json"

export function resolveStatePath(statePath?: string): string {
  return statePath ?? path.join(process.cwd(), DEFAULT_STATE_PATH)
}

export async function loadStripeState(
  statePath?: string,
): Promise<StripeState> {
  const filePath = resolveStatePath(statePath)
  try {
    const raw = await fs.readFile(filePath, "utf8")
    return JSON.parse(raw) as StripeState
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {}
    }
    throw error
  }
}

export async function saveStripeState(
  state: StripeState,
  statePath?: string,
): Promise<void> {
  const filePath = resolveStatePath(statePath)
  await fs.writeFile(filePath, `${JSON.stringify(state, null, 2)}\n`, "utf8")
}

export async function updateStripeState(
  patch: Partial<StripeState>,
  statePath?: string,
): Promise<StripeState> {
  const current = await loadStripeState(statePath)
  const next = { ...current, ...patch }
  await saveStripeState(next, statePath)
  return next
}

export function requireAccountId(state: StripeState): string {
  if (!state.accountId) {
    throw new Error(
      "No connected account ID in state. Run `cubic-plugin stripe create-account` first.",
    )
  }
  return state.accountId
}

export function requireDefaultPriceId(state: StripeState): string {
  if (!state.defaultPriceId) {
    throw new Error(
      "No default price ID in state. Run `cubic-plugin stripe create-product` first.",
    )
  }
  return state.defaultPriceId
}

export function requireDefaultPaymentMethodId(state: StripeState): string {
  if (!state.defaultPaymentMethodId) {
    throw new Error(
      "No default payment method in state. Run `cubic-plugin stripe create-setup-intent` first.",
    )
  }
  return state.defaultPaymentMethodId
}
