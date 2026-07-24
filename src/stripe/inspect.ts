import type Stripe from "stripe"
import { getStripeClient } from "./client.js"
import { guessObjectType, resolveObjectPath } from "./object-paths.js"

export interface DataMapEntry {
  /** Dot-path within the inspected object JSON (e.g. `customer`). */
  path: string
  /** Referenced Stripe object id. */
  id: string
  /** Best-effort object type from the id prefix. */
  type: string
}

export interface RelatedEventSummary {
  id: string
  type: string
  created: number
  requestId: string | null
  livemode: boolean
}

export interface InspectObjectResult {
  objectId: string
  objectType: string
  apiPath: string
  /** Full JSON of the retrieved API object. */
  data: unknown
  /** Hierarchy of related object ids discovered in `data`. */
  dataMap: DataMapEntry[]
  /** Recently generated events related to this object (best-effort). */
  events: RelatedEventSummary[]
  /**
   * Request-log style entries derived from event `request` metadata.
   * Dashboard Workbench Logs are not fully available via the public API;
   * these summaries mirror the Inspector Logs tab as closely as possible.
   */
  logs: Array<{
    requestId: string
    eventId: string
    eventType: string
    created: number
  }>
  /** Deep links into Dashboard Workbench for further inspection / editing. */
  workbench: {
    inspector: string
    shell: string
    logs: string
    events: string
  }
}

export interface InspectObjectInput {
  objectId: string
  /** Optional absolute path override (e.g. `/v1/customers/cus_…`). */
  path?: string
  /** Connected-account header (`Stripe-Account`). */
  stripeAccount?: string
  /** Max related events to fetch (default 20). */
  eventsLimit?: number
  /** When true, also retrieve each related object one level deep. */
  fetchRelated?: boolean
}

const STRIPE_ID_RE =
  /\b((?:acct|cus|pi|ch|py|sub|si|in|il|price|prod|pm|seti|cs_test|cs_live|cs|evt|re|dp|po|tr|txn|card|qr|src|tok|file|link)_[A-Za-z0-9]+)\b/g

/**
 * Walk a JSON value and collect Stripe object id references (excluding the root id).
 */
export function buildDataMap(
  value: unknown,
  rootId: string,
  basePath = "",
): DataMapEntry[] {
  const seen = new Set<string>()
  const entries: DataMapEntry[] = []

  function visit(node: unknown, path: string): void {
    if (node == null) return
    if (typeof node === "string") {
      if (node !== rootId && looksLikeStripeId(node) && !seen.has(node)) {
        seen.add(node)
        entries.push({
          path: path || "(value)",
          id: node,
          type: guessObjectType(node),
        })
      }
      return
    }
    if (typeof node !== "object") return
    if (Array.isArray(node)) {
      node.forEach((item, i) => visit(item, path ? `${path}[${i}]` : `[${i}]`))
      return
    }
    for (const [key, child] of Object.entries(node as Record<string, unknown>)) {
      const next = path ? `${path}.${key}` : key
      if (key === "id" && typeof child === "string" && child === rootId) {
        continue
      }
      visit(child, next)
    }
  }

  visit(value, basePath)
  return entries
}

function looksLikeStripeId(value: string): boolean {
  STRIPE_ID_RE.lastIndex = 0
  const match = STRIPE_ID_RE.exec(value)
  return Boolean(match && match[0] === value)
}

function workbenchLinks(objectId: string) {
  const q = encodeURIComponent(objectId)
  return {
    inspector: `https://dashboard.stripe.com/workbench/inspector?object=${q}`,
    shell: `https://dashboard.stripe.com/workbench/shell`,
    logs: `https://dashboard.stripe.com/workbench/logs`,
    events: `https://dashboard.stripe.com/workbench/events?object=${q}`,
  }
}

/**
 * Inspect a Stripe API object the way Workbench Inspector does: return its
 * JSON, a related-object data map, and related events / request summaries.
 */
export async function inspectObject(
  input: InspectObjectInput,
  stripe: Stripe = getStripeClient(),
): Promise<InspectObjectResult> {
  const objectId = input.objectId.trim()
  if (!objectId) {
    throw new Error("Object id is required")
  }

  const resolved = input.path
    ? {
        type: guessObjectType(objectId),
        path: input.path.startsWith("/") ? input.path : `/${input.path}`,
        api: input.path.includes("/v2/") ? ("v2" as const) : ("v1" as const),
      }
    : resolveObjectPath(objectId)

  const requestOptions: Stripe.RequestOptions = {}
  if (input.stripeAccount) {
    requestOptions.stripeAccount = input.stripeAccount
  }

  const data = await stripe.rawRequest(
    "GET",
    resolved.path,
    undefined,
    requestOptions,
  )

  const dataMap = buildDataMap(data, objectId)
  const events = await listRelatedEvents(
    stripe,
    objectId,
    input.eventsLimit ?? 20,
    requestOptions,
  )

  const logs = events
    .filter((e) => e.requestId)
    .map((e) => ({
      requestId: e.requestId as string,
      eventId: e.id,
      eventType: e.type,
      created: e.created,
    }))

  let related: Record<string, unknown> | undefined
  if (input.fetchRelated && dataMap.length > 0) {
    related = {}
    for (const entry of dataMap.slice(0, 10)) {
      try {
        const spec = resolveObjectPath(entry.id)
        related[entry.id] = await stripe.rawRequest(
          "GET",
          spec.path,
          undefined,
          requestOptions,
        )
      } catch {
        // Skip related ids that cannot be retrieved with this key / account.
      }
    }
  }

  const result: InspectObjectResult & { related?: Record<string, unknown> } = {
    objectId,
    objectType: resolved.type,
    apiPath: resolved.path,
    data,
    dataMap,
    events,
    logs,
    workbench: workbenchLinks(objectId),
  }
  if (related) result.related = related
  return result
}

async function listRelatedEvents(
  stripe: Stripe,
  objectId: string,
  limit: number,
  requestOptions: Stripe.RequestOptions,
): Promise<RelatedEventSummary[]> {
  const capped = Math.min(Math.max(limit, 1), 100)
  // Workbench / Dashboard use `related_object` on /v1/events. rawRequest only
  // accepts a body on POST, so GET query params go on the path.
  const qs = new URLSearchParams({
    related_object: objectId,
    limit: String(capped),
  })
  try {
    const listed = (await stripe.rawRequest(
      "GET",
      `/v1/events?${qs.toString()}`,
      undefined,
      requestOptions,
    )) as { data?: Array<Record<string, unknown>> }

    const rows = Array.isArray(listed?.data) ? listed.data : []
    return rows.map((row) => summarizeEvent(row))
  } catch {
    // Fall back to scanning recent events for a matching object id.
    try {
      const listed = await stripe.events.list(
        { limit: Math.min(Math.max(limit * 2, 10), 100) },
        requestOptions,
      )
      return listed.data
        .filter((evt) => eventMentionsObject(evt, objectId))
        .slice(0, limit)
        .map((evt) =>
          summarizeEvent({
            id: evt.id,
            type: evt.type,
            created: evt.created,
            livemode: evt.livemode,
            request: evt.request,
          }),
        )
    } catch {
      return []
    }
  }
}

function summarizeEvent(row: Record<string, unknown>): RelatedEventSummary {
  const request = row.request as
    | { id?: string | null }
    | string
    | null
    | undefined
  let requestId: string | null = null
  if (typeof request === "string") requestId = request
  else if (request && typeof request === "object") {
    requestId = typeof request.id === "string" ? request.id : null
  }
  return {
    id: String(row.id ?? ""),
    type: String(row.type ?? ""),
    created: Number(row.created ?? 0),
    requestId,
    livemode: Boolean(row.livemode),
  }
}

function eventMentionsObject(
  evt: Stripe.Event,
  objectId: string,
): boolean {
  try {
    const json = JSON.stringify(evt.data?.object ?? {})
    return json.includes(objectId)
  } catch {
    return false
  }
}
