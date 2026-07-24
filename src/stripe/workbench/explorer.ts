import type Stripe from "stripe"
import { getStripeClient } from "../client.js"
import { isStripeTestKey } from "../env.js"
import { fillPath, resolveObjectRoute } from "./object-routes.js"

export interface UpdateObjectInput {
  objectId: string
  params: Record<string, unknown>
  stripeAccount?: string
  /** Allow updates when STRIPE_SECRET_KEY is a live key (Workbench Shell is read-only in live mode). */
  allowLive?: boolean
}

export interface UpdateObjectResult {
  objectId: string
  resource: string
  updatePath: string
  request: {
    method: "POST"
    body: Record<string, unknown>
  }
  object: unknown
}

function requestOptions(stripeAccount?: string): Stripe.RequestOptions | undefined {
  if (!stripeAccount) return undefined
  return { stripeAccount }
}

/**
 * Update a Stripe API object via POST — similar to Workbench API Explorer.
 * Blocked in live mode unless `allowLive` is set (Workbench Shell is read-only live).
 */
export async function updateObject(
  input: UpdateObjectInput,
  stripe: Stripe = getStripeClient(),
): Promise<UpdateObjectResult> {
  if (!input.allowLive && !isStripeTestKey()) {
    throw new Error(
      "Updates are read-only in live mode (same as Stripe Workbench Shell). Use a test key (sk_test_...) or pass --allow-live.",
    )
  }

  const route = resolveObjectRoute(input.objectId)
  if (!route.updatePath) {
    throw new Error(
      `Updates are not supported for ${route.resource} objects via built-in routes.`,
    )
  }

  const updatePath = fillPath(route.updatePath, input.objectId)
  const body = { ...input.params }
  const object = await stripe.rawRequest(
    "POST",
    updatePath,
    body,
    requestOptions(input.stripeAccount),
  )

  return {
    objectId: input.objectId,
    resource: route.resource,
    updatePath,
    request: {
      method: "POST",
      body,
    },
    object,
  }
}

export interface RunRequestInput {
  method: "GET" | "POST" | "DELETE"
  path: string
  params?: Record<string, unknown>
  stripeAccount?: string
  allowLive?: boolean
}

export interface RunRequestResult {
  method: RunRequestInput["method"]
  path: string
  response: unknown
}

/**
 * Run an arbitrary Stripe API request — Workbench Shell style.
 */
export async function runRequest(
  input: RunRequestInput,
  stripe: Stripe = getStripeClient(),
): Promise<RunRequestResult> {
  const mutating = input.method === "POST" || input.method === "DELETE"
  if (mutating && !input.allowLive && !isStripeTestKey()) {
    throw new Error(
      "Mutating requests are read-only in live mode. Use a test key or pass --allow-live.",
    )
  }

  const response = await stripe.rawRequest(
    input.method,
    input.path,
    input.params,
    requestOptions(input.stripeAccount),
  )

  return {
    method: input.method,
    path: input.path,
    response,
  }
}
