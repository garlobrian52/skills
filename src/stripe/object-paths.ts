/**
 * Map Stripe object id prefixes to REST paths used by Workbench-style
 * inspect / API Explorer requests.
 *
 * Paths mirror the public Stripe API. Accounts v2 ids use `/v2/core/accounts`.
 */

export interface ObjectPathSpec {
  /** Human-readable object type (e.g. `payment_intent`). */
  type: string
  /** Absolute API path including the object id (e.g. `/v1/payment_intents/pi_…`). */
  path: string
  /** API surface: classic v1 or Accounts/Events v2. */
  api: "v1" | "v2"
}

/** Longest-prefix match so `cs_test_` / `seti_` win over shorter prefixes. */
const PREFIX_SPECS: Array<{
  prefix: string
  type: string
  collection: string
  api: "v1" | "v2"
}> = [
  { prefix: "cs_test_", type: "checkout_session", collection: "/v1/checkout/sessions", api: "v1" },
  { prefix: "cs_live_", type: "checkout_session", collection: "/v1/checkout/sessions", api: "v1" },
  { prefix: "acct_", type: "account", collection: "/v2/core/accounts", api: "v2" },
  { prefix: "price_", type: "price", collection: "/v1/prices", api: "v1" },
  { prefix: "prod_", type: "product", collection: "/v1/products", api: "v1" },
  { prefix: "seti_", type: "setup_intent", collection: "/v1/setup_intents", api: "v1" },
  { prefix: "file_", type: "file", collection: "/v1/files", api: "v1" },
  { prefix: "link_", type: "file_link", collection: "/v1/file_links", api: "v1" },
  { prefix: "card_", type: "card", collection: "/v1/issuing/cards", api: "v1" },
  { prefix: "txn_", type: "balance_transaction", collection: "/v1/balance_transactions", api: "v1" },
  { prefix: "cus_", type: "customer", collection: "/v1/customers", api: "v1" },
  { prefix: "pi_", type: "payment_intent", collection: "/v1/payment_intents", api: "v1" },
  { prefix: "ch_", type: "charge", collection: "/v1/charges", api: "v1" },
  { prefix: "py_", type: "charge", collection: "/v1/charges", api: "v1" },
  { prefix: "sub_", type: "subscription", collection: "/v1/subscriptions", api: "v1" },
  { prefix: "si_", type: "subscription_item", collection: "/v1/subscription_items", api: "v1" },
  { prefix: "in_", type: "invoice", collection: "/v1/invoices", api: "v1" },
  { prefix: "il_", type: "invoice_item", collection: "/v1/invoiceitems", api: "v1" },
  { prefix: "pm_", type: "payment_method", collection: "/v1/payment_methods", api: "v1" },
  { prefix: "cs_", type: "checkout_session", collection: "/v1/checkout/sessions", api: "v1" },
  { prefix: "evt_", type: "event", collection: "/v1/events", api: "v1" },
  { prefix: "re_", type: "refund", collection: "/v1/refunds", api: "v1" },
  { prefix: "dp_", type: "dispute", collection: "/v1/disputes", api: "v1" },
  { prefix: "po_", type: "payout", collection: "/v1/payouts", api: "v1" },
  { prefix: "tr_", type: "transfer", collection: "/v1/transfers", api: "v1" },
  { prefix: "qr_", type: "quote", collection: "/v1/quotes", api: "v1" },
  { prefix: "src_", type: "source", collection: "/v1/sources", api: "v1" },
  { prefix: "tok_", type: "token", collection: "/v1/tokens", api: "v1" },
]

/**
 * Resolve a Stripe object id to its REST path.
 * Throws when the prefix is unknown so callers can fall back to a raw path.
 */
export function resolveObjectPath(objectId: string): ObjectPathSpec {
  const id = objectId.trim()
  if (!id) {
    throw new Error("Object id is required")
  }
  const match = PREFIX_SPECS.find((spec) => id.startsWith(spec.prefix))
  if (!match) {
    throw new Error(
      `Unrecognized Stripe object id prefix for "${id}". Pass an explicit --path instead.`,
    )
  }
  return {
    type: match.type,
    path: `${match.collection}/${encodeURIComponent(id)}`,
    api: match.api,
  }
}

/** Best-effort type label from an id (unknown prefixes → `object`). */
export function guessObjectType(objectId: string): string {
  try {
    return resolveObjectPath(objectId).type
  } catch {
    return "object"
  }
}
