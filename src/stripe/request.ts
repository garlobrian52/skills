import type Stripe from "stripe"
import { getStripeClient } from "./client.js"
import { resolveObjectPath } from "./object-paths.js"

export type ApiHttpMethod = "GET" | "POST" | "DELETE"

export interface ApiRequestInput {
  method: ApiHttpMethod
  /**
   * Absolute API path (e.g. `/v1/customers/cus_xxx`) or a Stripe object id
   * (resolved via prefix → path, same as Workbench API Explorer).
   */
  path: string
  /**
   * Request body (POST) or querystring params (GET). Values are passed through
   * to `stripe.rawRequest` as form-encoded fields.
   */
  params?: Record<string, unknown>
  /** Connected-account header (`Stripe-Account`). */
  stripeAccount?: string
}

export interface ApiRequestResult {
  method: ApiHttpMethod
  path: string
  data: unknown
  /** Suggested follow-up: inspect the returned object id when present. */
  inspectHint: string | null
}

/**
 * Run a Stripe API request the way Workbench Shell / API Explorer does.
 * Use this to edit objects after inspecting them (sandbox / test mode).
 */
export async function apiRequest(
  input: ApiRequestInput,
  stripe: Stripe = getStripeClient(),
): Promise<ApiRequestResult> {
  const method = input.method.toUpperCase() as ApiHttpMethod
  if (!["GET", "POST", "DELETE"].includes(method)) {
    throw new Error(`Unsupported method "${input.method}". Use GET, POST, or DELETE.`)
  }

  let path = normalizePath(input.path)
  const requestOptions: Stripe.RequestOptions = {}
  if (input.stripeAccount) {
    requestOptions.stripeAccount = input.stripeAccount
  }

  // rawRequest only accepts a params body on POST; encode GET/DELETE as query.
  let body: Record<string, unknown> | undefined
  if (method === "POST") {
    body = input.params
  } else if (input.params && Object.keys(input.params).length > 0) {
    path = appendQuery(path, input.params)
  }

  const data = await stripe.rawRequest(method, path, body, requestOptions)

  const returnedId =
    data &&
    typeof data === "object" &&
    "id" in data &&
    typeof (data as { id: unknown }).id === "string"
      ? ((data as { id: string }).id)
      : null

  return {
    method,
    path,
    data,
    inspectHint: returnedId
      ? `node dist/index.js stripe inspect-object ${returnedId}`
      : null,
  }
}

function normalizePath(raw: string): string {
  const value = raw.trim()
  if (!value) {
    throw new Error("Path or object id is required")
  }
  if (value.startsWith("/")) return value
  if (value.startsWith("v1/") || value.startsWith("v2/")) return `/${value}`
  // Treat bare object ids as GET targets for the Explorer.
  return resolveObjectPath(value).path
}

function appendQuery(
  path: string,
  params: Record<string, unknown>,
): string {
  const qs = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue
    if (value !== null && typeof value === "object") {
      qs.set(key, JSON.stringify(value))
    } else {
      qs.set(key, String(value))
    }
  }
  const encoded = qs.toString()
  if (!encoded) return path
  return path.includes("?") ? `${path}&${encoded}` : `${path}?${encoded}`
}

/**
 * Parse `--param key=value` CLI pairs into a params object.
 * Nested keys are not supported; pass JSON via `--json-body` instead.
 */
export function parseParamPairs(pairs: string[] | string | undefined): Record<string, unknown> {
  if (!pairs) return {}
  const list = Array.isArray(pairs) ? pairs : [pairs]
  const out: Record<string, unknown> = {}
  for (const pair of list) {
    const idx = pair.indexOf("=")
    if (idx <= 0) {
      throw new Error(`Invalid --param "${pair}". Expected key=value.`)
    }
    const key = pair.slice(0, idx).trim()
    const rawValue = pair.slice(idx + 1)
    out[key] = coerceParamValue(rawValue)
  }
  return out
}

function coerceParamValue(raw: string): unknown {
  if (raw === "true") return true
  if (raw === "false") return false
  if (raw === "null") return null
  if (/^-?\d+$/.test(raw)) return Number(raw)
  if (/^-?\d+\.\d+$/.test(raw)) return Number(raw)
  try {
    if (
      (raw.startsWith("{") && raw.endsWith("}")) ||
      (raw.startsWith("[") && raw.endsWith("]"))
    ) {
      return JSON.parse(raw)
    }
  } catch {
    // fall through to string
  }
  return raw
}
