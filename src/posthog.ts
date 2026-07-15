import { PostHog } from "posthog-node"
import { randomUUID } from "crypto"

export const runId = randomUUID()

// Project API key from PostHog project settings (phc_* is safe to ship in clients).
// Override with POSTHOG_API_KEY / POSTHOG_HOST for local or alternate projects.
const POSTHOG_API_KEY =
  process.env.POSTHOG_API_KEY ?? "phc_sUjxrcTH7saY1BYLPKfgwVmSDNr1F2L0qZmtIdsnyEz"

// CLI tools are client-like runtimes, not servers
export const posthog = new PostHog(POSTHOG_API_KEY, {
  host: process.env.POSTHOG_HOST ?? "https://us.i.posthog.com",
  flushAt: 1,
  flushInterval: 0,
  enableExceptionAutocapture: true,
  isServer: false,
  personProfiles: "identified_only",
})
