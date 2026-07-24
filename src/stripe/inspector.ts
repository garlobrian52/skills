import type Stripe from "stripe"
import { getStripeClient } from "./client.js"
import { isStripeTestKey } from "./env.js"

/** Known Stripe id prefixes → resource descriptor used by Workbench Inspector. */
export interface ResourceDescriptor {
  /** Human-readable resource name (e.g. `customer`). */
  resource: string
  /** API path template with `{id}` placeholder. */
  pathTemplate: string
  /** Stripe API family (`v1` or `v2`). */
  api: "v1" | "v2"
  /** Whether POST updates are supported for this resource via the public API. */
  updatable: boolean
  /** Optional include params for v2 retrieves. */
  include?: string[]
}

/**
 * Prefix → descriptor map. Longer / more specific prefixes should be matched
 * before shorter ones when resolving (sorted by prefix length descending).
 */
const RESOURCE_BY_PREFIX: Array<[string, ResourceDescriptor]> = [
  ["plink_", { resource: "payment_link", pathTemplate: "/v1/payment_links/{id}", api: "v1", updatable: true }],
  ["seti_", { resource: "setup_intent", pathTemplate: "/v1/setup_intents/{id}", api: "v1", updatable: true }],
  ["price_", { resource: "price", pathTemplate: "/v1/prices/{id}", api: "v1", updatable: true }],
  ["prod_", { resource: "product", pathTemplate: "/v1/products/{id}", api: "v1", updatable: true }],
  ["acct_", {
    resource: "account",
    pathTemplate: "/v2/core/accounts/{id}",
    api: "v2",
    updatable: true,
    include: ["configuration.merchant", "configuration.customer", "identity", "defaults"],
  }],
  ["file_", { resource: "file", pathTemplate: "/v1/files/{id}", api: "v1", updatable: false }],
  ["fee_", { resource: "application_fee", pathTemplate: "/v1/application_fees/{id}", api: "v1", updatable: false }],
  ["txn_", { resource: "balance_transaction", pathTemplate: "/v1/balance_transactions/{id}", api: "v1", updatable: false }],
  ["cus_", { resource: "customer", pathTemplate: "/v1/customers/{id}", api: "v1", updatable: true }],
  ["sub_", { resource: "subscription", pathTemplate: "/v1/subscriptions/{id}", api: "v1", updatable: true }],
  ["pi_", { resource: "payment_intent", pathTemplate: "/v1/payment_intents/{id}", api: "v1", updatable: true }],
  ["pm_", { resource: "payment_method", pathTemplate: "/v1/payment_methods/{id}", api: "v1", updatable: true }],
  ["cs_", { resource: "checkout.session", pathTemplate: "/v1/checkout/sessions/{id}", api: "v1", updatable: true }],
  ["ch_", { resource: "charge", pathTemplate: "/v1/charges/{id}", api: "v1", updatable: true }],
  ["re_", { resource: "refund", pathTemplate: "/v1/refunds/{id}", api: "v1", updatable: true }],
  ["dp_", { resource: "dispute", pathTemplate: "/v1/disputes/{id}", api: "v1", updatable: true }],
  ["po_", { resource: "payout", pathTemplate: "/v1/payouts/{id}", api: "v1", updatable: true }],
  ["tr_", { resource: "transfer", pathTemplate: "/v1/transfers/{id}", api: "v1", updatable: true }],
  ["evt_", { resource: "event", pathTemplate: "/v1/events/{id}", api: "v1", updatable: false }],
  ["si_", { resource: "subscription_item", pathTemplate: "/v1/subscription_items/{id}", api: "v1", updatable: true }],
  ["in_", { resource: "invoice", pathTemplate: "/v1/invoices/{id}", api: "v1", updatable: true }],
  ["ii_", { resource: "invoiceitem", pathTemplate: "/v1/invoiceitems/{id}", api: "v1", updatable: true }],
  ["qr_", { resource: "quote", pathTemplate: "/v1/quotes/{id}", api: "v1", updatable: true }],
]

/** Stripe object-id-looking strings found while walking object graphs. */
const OBJECT_ID_RE =
  /\b((?:pi|seti|cs_test|cs_live|cs|cus|sub|si|in|ii|prod|price|pm|ch|re|dp|po|tr|evt|acct|file|fee|txn|qr|plink)_[A-Za-z0-9]+)\b/g

export interface RelatedObjectRef {
  id: string
  resource: string | null
  path: string | null
  fieldPath: string
}

export interface RelatedEventSummary {
  id: string
  type: string
  created: number
  requestId: string | null
  objectId: string | null
}

export interface InspectResult {
  id: string
  resource: string
  path: string
  api: "v1" | "v2"
  workbenchUrl: string
  /** JSON view of the retrieved API object (Workbench Inspector Overview). */
  object: unknown
  /** Hierarchy of related API object ids discovered on the object (Data map). */
  dataMap: RelatedObjectRef[]
  /** Recently generated events that reference this object (Events tab). */
  events: RelatedEventSummary[]
  /**
   * Request logs are Dashboard/Workbench-only (no public Stripe API).
   * We surface event `request` ids and a deep link instead.
   */
  logs: {
    availableViaApi: false
    note: string
    workbenchLogsUrl: string
    requestIds: string[]
  }
  editHint: {
    updatable: boolean
    testMode: boolean
    apiExploreCommand: string
    note: string
  }
}

export interface ApiExploreInput {
  method: "GET" | "POST" | "DELETE"
  path: string
  /** Body params for POST (ignored for GET/DELETE — put query on the path). */
  params?: Record<string, unknown>
  /** Optional Stripe-Account header for connected-account requests. */
  stripeAccount?: string
  /** Allow mutating calls with a live-mode key (default: blocked). */
  allowLiveMutations?: boolean
}

function sortedPrefixes(): Array<[string, ResourceDescriptor]> {
  return [...RESOURCE_BY_PREFIX].sort((a, b) => b[0].length - a[0].length)
}

/** Resolve a Stripe object id to its resource descriptor. */
export function resolveResource(id: string): ResourceDescriptor {
  const trimmed = id.trim()
  if (!trimmed) {
    throw new Error("Object id is required")
  }
  for (const [prefix, descriptor] of sortedPrefixes()) {
    if (trimmed.startsWith(prefix)) return descriptor
  }
  throw new Error(
    `Unrecognized Stripe object id prefix for "${trimmed}". Pass an explicit --path for API Explorer calls, or use a standard id (cus_, pi_, sub_, acct_, …).`,
  )
}

export function resourcePath(descriptor: ResourceDescriptor, id: string): string {
  return descriptor.pathTemplate.replace("{id}", encodeURIComponent(id))
}

export function workbenchInspectorUrl(id: string, testMode = isStripeTestKey()): string {
  const base = testMode
    ? "https://dashboard.stripe.com/test/workbench/inspector"
    : "https://dashboard.stripe.com/workbench/inspector"
  return `${base}?object=${encodeURIComponent(id)}`
}

export function workbenchLogsUrl(testMode = isStripeTestKey()): string {
  return testMode
    ? "https://dashboard.stripe.com/test/workbench/logs"
    : "https://dashboard.stripe.com/workbench/logs"
}

/** Walk a JSON value and collect Stripe-looking object ids with field paths. */
export function collectRelatedObjectIds(
  value: unknown,
  rootId: string,
  fieldPath = "",
  out: RelatedObjectRef[] = [],
  seen = new Set<string>(),
): RelatedObjectRef[] {
  if (value == null) return out

  if (typeof value === "string") {
    OBJECT_ID_RE.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = OBJECT_ID_RE.exec(value)) !== null) {
      const id = match[1]
      if (id === rootId || seen.has(`${fieldPath}:${id}`)) continue
      seen.add(`${fieldPath}:${id}`)
      let resource: string | null = null
      let path: string | null = null
      try {
        const d = resolveResource(id)
        resource = d.resource
        path = resourcePath(d, id)
      } catch {
        // unknown prefix — still record the id
      }
      out.push({ id, resource, path, fieldPath: fieldPath || "(value)" })
    }
    return out
  }

  if (Array.isArray(value)) {
    value.forEach((item, i) =>
      collectRelatedObjectIds(item, rootId, `${fieldPath}[${i}]`, out, seen),
    )
    return out
  }

  if (typeof value === "object") {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (key === "id" && child === rootId) continue
      const next = fieldPath ? `${fieldPath}.${key}` : key
      collectRelatedObjectIds(child, rootId, next, out, seen)
    }
  }
  return out
}

function eventObjectId(event: Stripe.Event): string | null {
  const obj = event.data?.object as { id?: string } | undefined
  return typeof obj?.id === "string" ? obj.id : null
}

function eventMentionsId(event: Stripe.Event, id: string): boolean {
  if (event.id === id) return true
  if (eventObjectId(event) === id) return true
  try {
    return JSON.stringify(event.data).includes(id)
  } catch {
    return false
  }
}

/**
 * Inspect a Stripe API object the way Workbench Inspector does:
 * retrieve the object, build a related-object data map, and list related events.
 * Request logs are linked to Dashboard Workbench (no public Logs API).
 */
export async function inspectObject(
  id: string,
  options: {
    eventLimit?: number
    stripeAccount?: string
    pathOverride?: string
  } = {},
  stripe: Stripe = getStripeClient(),
): Promise<InspectResult> {
  const objectId = id.trim()
  let descriptor: ResourceDescriptor
  let path: string

  if (options.pathOverride) {
    const override = options.pathOverride.trim()
    path = override.includes("{id}")
      ? override.replace("{id}", encodeURIComponent(objectId))
      : override
    descriptor = {
      resource: "custom",
      pathTemplate: override.includes("{id}") ? override : `${override.replace(/\/$/, "")}/{id}`,
      api: path.startsWith("/v2/") ? "v2" : "v1",
      updatable: true,
    }
  } else {
    descriptor = resolveResource(objectId)
    path = resourcePath(descriptor, objectId)
  }

  const requestOpts: Stripe.RequestOptions = {}
  if (options.stripeAccount) {
    requestOpts.stripeAccount = options.stripeAccount
  }

  let object: unknown
  if (
    !options.pathOverride &&
    descriptor.api === "v2" &&
    descriptor.include?.length &&
    path.startsWith("/v2/core/accounts/")
  ) {
    // Prefer typed v2 retrieve with includes when inspecting Accounts v2.
    object = await stripe.v2.core.accounts.retrieve(objectId, {
      include:
        descriptor.include as Stripe.V2.Core.AccountRetrieveParams.Include[],
    })
    path = `/v2/core/accounts/${objectId}`
  } else {
    object = await stripe.rawRequest("GET", path, undefined, requestOpts)
  }

  const dataMap = collectRelatedObjectIds(object, objectId)

  const eventLimit = options.eventLimit ?? 50
  let events: RelatedEventSummary[] = []
  try {
    const listed = await stripe.events.list(
      { limit: Math.min(Math.max(eventLimit, 1), 100) },
      requestOpts,
    )
    events = listed.data
      .filter((evt) => eventMentionsId(evt, objectId))
      .map((evt) => ({
        id: evt.id,
        type: evt.type,
        created: evt.created,
        requestId:
          typeof evt.request === "string"
            ? evt.request
            : evt.request &&
                typeof evt.request === "object" &&
                "id" in evt.request
              ? (evt.request as { id: string | null }).id
              : null,
        objectId: eventObjectId(evt),
      }))
  } catch {
    // Events listing can fail for restricted keys — keep inspection useful without it.
    events = []
  }

  const requestIds = [
    ...new Set(
      events.map((e) => e.requestId).filter((x): x is string => Boolean(x)),
    ),
  ]
  const testMode = isStripeTestKey()
  const updatePath = path

  return {
    id: objectId,
    resource: descriptor.resource,
    path,
    api: descriptor.api,
    workbenchUrl: workbenchInspectorUrl(objectId, testMode),
    object,
    dataMap,
    events,
    logs: {
      availableViaApi: false,
      note: "Stripe request logs are available in Dashboard Workbench (Logs tab), not via the public API. Related request ids from Events are listed when present.",
      workbenchLogsUrl: workbenchLogsUrl(testMode),
      requestIds,
    },
    editHint: {
      updatable: descriptor.updatable,
      testMode,
      apiExploreCommand: descriptor.updatable
        ? `stripe api --method POST --path ${updatePath} --params '{"metadata":{"inspected":"true"}}'`
        : `stripe api --method GET --path ${updatePath}`,
      note: testMode
        ? "Use `stripe api` (API Explorer / Shell) to edit this object in test mode."
        : "Workbench Shell is read-only in live mode. Switch to a test key/sandbox before mutating objects.",
    },
  }
}

/**
 * Run a raw Stripe API request — mirrors Workbench Shell + API Explorer.
 * Mutating methods (POST/DELETE) are blocked for live-mode keys unless
 * `allowLiveMutations` is set (matching Workbench’s sandbox-only edits).
 */
export async function apiExplore(
  input: ApiExploreInput,
  stripe: Stripe = getStripeClient(),
): Promise<{ method: string; path: string; result: unknown }> {
  const method = input.method.toUpperCase() as ApiExploreInput["method"]
  if (!["GET", "POST", "DELETE"].includes(method)) {
    throw new Error(`Unsupported method ${input.method}. Use GET, POST, or DELETE.`)
  }

  let path = input.path.trim()
  if (!path.startsWith("/")) path = `/${path}`

  const mutating = method === "POST" || method === "DELETE"
  if (mutating && !isStripeTestKey() && !input.allowLiveMutations) {
    throw new Error(
      "Refusing to mutate Stripe objects with a live-mode key (Workbench Shell is read-only in live mode). Use a test key, or pass --allow-live-mutations.",
    )
  }

  const requestOpts: Stripe.RequestOptions = {}
  if (input.stripeAccount) {
    requestOpts.stripeAccount = input.stripeAccount
  }

  let result: unknown
  if (method === "GET" || method === "DELETE") {
    if (input.params && Object.keys(input.params).length > 0) {
      const qs = new URLSearchParams()
      for (const [k, v] of Object.entries(input.params)) {
        if (v === undefined || v === null) continue
        qs.set(k, typeof v === "string" ? v : String(v))
      }
      const query = qs.toString()
      if (query) path += (path.includes("?") ? "&" : "?") + query
    }
    result = await stripe.rawRequest(method, path, undefined, requestOpts)
  } else {
    result = await stripe.rawRequest(
      "POST",
      path,
      (input.params ?? {}) as Record<string, unknown>,
      requestOpts,
    )
  }

  return { method, path, result }
}

/**
 * Convenience: update an object by id with POST params (API Explorer edit flow).
 */
export async function updateObject(
  id: string,
  params: Record<string, unknown>,
  options: {
    pathOverride?: string
    stripeAccount?: string
    allowLiveMutations?: boolean
  } = {},
  stripe: Stripe = getStripeClient(),
): Promise<{ method: string; path: string; result: unknown }> {
  const descriptor = options.pathOverride
    ? null
    : resolveResource(id)
  if (descriptor && !descriptor.updatable) {
    throw new Error(`Resource "${descriptor.resource}" is not updatable via POST`)
  }
  const path =
    options.pathOverride ??
    (descriptor ? resourcePath(descriptor, id) : (() => { throw new Error("path required") })())

  return apiExplore(
    {
      method: "POST",
      path,
      params,
      stripeAccount: options.stripeAccount,
      allowLiveMutations: options.allowLiveMutations,
    },
    stripe,
  )
}
