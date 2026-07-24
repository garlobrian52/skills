/** Stripe API paths for Workbench-style inspect/update by object id prefix. */
export interface ObjectRoute {
  /** Human-readable resource label shown in CLI output. */
  resource: string
  /** GET path template; `{id}` is replaced with the object id. */
  retrievePath: string
  /** POST path template for updates; omitted when updates are unsupported. */
  updatePath?: string
  /** Query params appended to retrieve (e.g. expand). */
  retrieveQuery?: Record<string, string>
}

const ROUTES: Record<string, ObjectRoute> = {
  acct: {
    resource: "Account (v2)",
    retrievePath: "/v2/core/accounts/{id}",
    updatePath: "/v2/core/accounts/{id}",
  },
  cus: {
    resource: "Customer",
    retrievePath: "/v1/customers/{id}",
    updatePath: "/v1/customers/{id}",
  },
  pi: {
    resource: "PaymentIntent",
    retrievePath: "/v1/payment_intents/{id}",
    updatePath: "/v1/payment_intents/{id}",
  },
  cs: {
    resource: "CheckoutSession",
    retrievePath: "/v1/checkout/sessions/{id}",
    updatePath: "/v1/checkout/sessions/{id}",
  },
  sub: {
    resource: "Subscription",
    retrievePath: "/v1/subscriptions/{id}",
    updatePath: "/v1/subscriptions/{id}",
  },
  prod: {
    resource: "Product",
    retrievePath: "/v1/products/{id}",
    updatePath: "/v1/products/{id}",
  },
  price: {
    resource: "Price",
    retrievePath: "/v1/prices/{id}",
    updatePath: "/v1/prices/{id}",
  },
  in: {
    resource: "Invoice",
    retrievePath: "/v1/invoices/{id}",
    updatePath: "/v1/invoices/{id}",
  },
  seti: {
    resource: "SetupIntent",
    retrievePath: "/v1/setup_intents/{id}",
    updatePath: "/v1/setup_intents/{id}",
  },
  pm: {
    resource: "PaymentMethod",
    retrievePath: "/v1/payment_methods/{id}",
    updatePath: "/v1/payment_methods/{id}",
  },
  ch: {
    resource: "Charge",
    retrievePath: "/v1/charges/{id}",
    updatePath: "/v1/charges/{id}",
  },
  evt: {
    resource: "Event (v1)",
    retrievePath: "/v1/events/{id}",
  },
}

export function objectIdPrefix(objectId: string): string {
  const idx = objectId.indexOf("_")
  if (idx <= 0) {
    throw new Error(
      `Unrecognized object id "${objectId}". Expected a Stripe id such as acct_..., cus_..., or pi_....`,
    )
  }
  return objectId.slice(0, idx)
}

export function resolveObjectRoute(objectId: string): ObjectRoute & { prefix: string } {
  const prefix = objectIdPrefix(objectId)
  const route = ROUTES[prefix]
  if (!route) {
    throw new Error(
      `No built-in route for "${prefix}_..." objects. Use run-request with an explicit API path.`,
    )
  }
  return { ...route, prefix }
}

export function fillPath(template: string, objectId: string): string {
  return template.replace("{id}", objectId)
}

/** Foreign-key style fields commonly used to build a Workbench-like data map. */
const RELATION_KEYS = new Set([
  "account",
  "application",
  "charge",
  "customer",
  "customer_account",
  "invoice",
  "latest_charge",
  "on_behalf_of",
  "payment_intent",
  "payment_method",
  "price",
  "product",
  "setup_intent",
  "source",
  "subscription",
  "transfer",
])

export interface DataMapEntry {
  field: string
  id: string
  objectType?: string
}

/** Extract related object ids from a Stripe API object payload. */
export function buildDataMap(
  object: Record<string, unknown>,
  prefix = "",
): DataMapEntry[] {
  const entries: DataMapEntry[] = []

  for (const [key, value] of Object.entries(object)) {
    const path = prefix ? `${prefix}.${key}` : key

    if (typeof value === "string" && value.includes("_")) {
      const looksLikeId =
        RELATION_KEYS.has(key) || /^[a-z]{2,10}_[A-Za-z0-9]+$/.test(value)
      if (looksLikeId) {
        entries.push({
          field: path,
          id: value,
          objectType: value.split("_")[0],
        })
      }
      continue
    }

    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      "id" in value &&
      typeof (value as { id: unknown }).id === "string"
    ) {
      const nested = value as { id: string; object?: string }
      entries.push({
        field: path,
        id: nested.id,
        objectType: nested.object ?? nested.id.split("_")[0],
      })
    }
  }

  return entries
}

export function workbenchInspectorUrl(objectId: string, testMode: boolean): string {
  const base = testMode
    ? "https://dashboard.stripe.com/test/workbench/inspector"
    : "https://dashboard.stripe.com/workbench/inspector"
  return `${base}/${objectId}`
}

export function workbenchLogsUrl(objectId: string, testMode: boolean): string {
  const base = testMode
    ? "https://dashboard.stripe.com/test/workbench/logs"
    : "https://dashboard.stripe.com/workbench/logs"
  return `${base}?related_object=${encodeURIComponent(objectId)}`
}
