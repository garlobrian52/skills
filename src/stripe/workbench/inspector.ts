import type Stripe from "stripe"
import { getStripeClient } from "../client.js"
import { isStripeTestKey } from "../env.js"
import {
  buildDataMap,
  fillPath,
  resolveObjectRoute,
  workbenchInspectorUrl,
  workbenchLogsUrl,
  type DataMapEntry,
} from "./object-routes.js"

export interface InspectObjectInput {
  objectId: string
  expand?: string[]
  eventsLimit?: number
  includeEvents?: boolean
  stripeAccount?: string
}

export interface InspectEventSummary {
  id: string
  type: string
  created: string | number
  apiVersion?: string
  source: "v1" | "v2"
}

export interface InspectObjectResult {
  objectId: string
  resource: string
  retrievePath: string
  object: unknown
  dataMap: DataMapEntry[]
  events: InspectEventSummary[]
  workbench: {
    inspectorUrl: string
    logsUrl: string
    shellHint: string
  }
}

function requestOptions(stripeAccount?: string): Stripe.RequestOptions | undefined {
  if (!stripeAccount) return undefined
  return { stripeAccount }
}

function appendExpand(
  path: string,
  expand?: string[],
): string {
  if (!expand?.length) return path
  const params = new URLSearchParams()
  for (const field of expand) {
    params.append("expand[]", field)
  }
  const qs = params.toString()
  return qs ? `${path}?${qs}` : path
}

async function retrieveObject(
  stripe: Stripe,
  objectId: string,
  expand?: string[],
  stripeAccount?: string,
): Promise<{ route: ReturnType<typeof resolveObjectRoute>; object: unknown }> {
  const route = resolveObjectRoute(objectId)
  const path = appendExpand(fillPath(route.retrievePath, objectId), expand)
  const object = await stripe.rawRequest(
    "GET",
    path,
    undefined,
    requestOptions(stripeAccount),
  )
  return { route, object }
}

async function listV2Events(
  stripe: Stripe,
  objectId: string,
  limit: number,
  stripeAccount?: string,
): Promise<InspectEventSummary[]> {
  try {
    const page = await stripe.v2.core.events.list(
      { object_id: objectId, limit },
      requestOptions(stripeAccount),
    )
    return page.data.map((event) => ({
      id: event.id,
      type: event.type,
      created: event.created,
      source: "v2" as const,
    }))
  } catch {
    return []
  }
}

async function listV1Events(
  stripe: Stripe,
  objectId: string,
  limit: number,
  stripeAccount?: string,
): Promise<InspectEventSummary[]> {
  try {
    const response = (await stripe.rawRequest(
      "GET",
      "/v1/events",
      { related_object: objectId, limit },
      requestOptions(stripeAccount),
    )) as { data?: Array<Record<string, unknown>> }

    return (response.data ?? []).map((event) => ({
      id: String(event.id),
      type: String(event.type),
      created: (event.created as string | number) ?? "",
      apiVersion:
        typeof event.api_version === "string" ? event.api_version : undefined,
      source: "v1" as const,
    }))
  } catch {
    return []
  }
}

function mergeEvents(
  v1: InspectEventSummary[],
  v2: InspectEventSummary[],
  limit: number,
): InspectEventSummary[] {
  const seen = new Set<string>()
  const merged: InspectEventSummary[] = []

  for (const event of [...v2, ...v1]) {
    if (seen.has(event.id)) continue
    seen.add(event.id)
    merged.push(event)
    if (merged.length >= limit) break
  }

  return merged.sort((a, b) => {
    const aTime = typeof a.created === "number" ? a.created : Date.parse(String(a.created))
    const bTime = typeof b.created === "number" ? b.created : Date.parse(String(b.created))
    return bTime - aTime
  })
}

/**
 * Inspect a Stripe API object: retrieve its JSON, build a related-object data
 * map, and list recent events — similar to Stripe Workbench Inspector.
 */
export async function inspectObject(
  input: InspectObjectInput,
  stripe: Stripe = getStripeClient(),
): Promise<InspectObjectResult> {
  const eventsLimit = input.eventsLimit ?? 10
  const includeEvents = input.includeEvents ?? true
  const { route, object } = await retrieveObject(
    stripe,
    input.objectId,
    input.expand,
    input.stripeAccount,
  )

  const payload =
    object && typeof object === "object"
      ? (object as Record<string, unknown>)
      : {}

  let events: InspectEventSummary[] = []
  if (includeEvents) {
    const [v2Events, v1Events] = await Promise.all([
      listV2Events(stripe, input.objectId, eventsLimit, input.stripeAccount),
      listV1Events(stripe, input.objectId, eventsLimit, input.stripeAccount),
    ])
    events = mergeEvents(v1Events, v2Events, eventsLimit)
  }

  const testMode = isStripeTestKey()
  const updatePath = route.updatePath
    ? fillPath(route.updatePath, input.objectId)
    : null

  return {
    objectId: input.objectId,
    resource: route.resource,
    retrievePath: fillPath(route.retrievePath, input.objectId),
    object,
    dataMap: buildDataMap(payload),
    events,
    workbench: {
      inspectorUrl: workbenchInspectorUrl(input.objectId, testMode),
      logsUrl: workbenchLogsUrl(input.objectId, testMode),
      shellHint: updatePath
        ? `stripe update ${input.objectId} --params '{"..."}'`
        : `stripe run-request GET ${fillPath(route.retrievePath, input.objectId)}`,
    },
  }
}
