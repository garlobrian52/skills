import { posthog as posthogClient } from "posthog-js"
import { randomUUID } from "crypto"

export const runId = randomUUID()

/** Public PostHog project API key (safe to ship in client/CLI builds). */
const POSTHOG_PROJECT_API_KEY =
  "phc_sUjxrcTH7saY1BYLPKfgwVmSDNr1F2L0qZmtIdsnyEz"

// Override with POSTHOG_API_KEY; set POSTHOG_API_KEY="" to disable telemetry.
const apiKey = process.env.POSTHOG_API_KEY ?? POSTHOG_PROJECT_API_KEY

export const telemetryEnabled = apiKey.length > 0

let initialized = false

function ensureInit(): void {
  if (!telemetryEnabled || initialized) return

  posthogClient.init(apiKey, {
    api_host: process.env.POSTHOG_HOST ?? "https://us.i.posthog.com",
    defaults: "2026-05-30",
    persistence: "memory",
    disable_persistence: true,
    advanced_disable_flags: true,
    autocapture: false,
    capture_pageview: false,
  })
  posthogClient.identify(runId)
  initialized = true
}

export const posthog = {
  capture(event: string, properties?: Record<string, unknown>) {
    ensureInit()
    if (!telemetryEnabled) return
    posthogClient.capture(event, properties)
  },
  async shutdown() {
    if (!initialized) return
    await Promise.race([
      posthogClient.shutdown(),
      new Promise<void>((resolve) => setTimeout(resolve, 2000)),
    ])
    initialized = false
  },
}

export async function shutdownPosthogAndExit(): Promise<void> {
  await posthog.shutdown()
  if (telemetryEnabled) {
    process.exit(process.exitCode ?? 0)
  }
}
