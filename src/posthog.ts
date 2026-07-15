import { PostHog } from "posthog-node"
import { randomUUID } from "crypto"

export const runId = randomUUID()

/** Public PostHog project API key (safe to ship in client/CLI builds). */
const POSTHOG_PROJECT_API_KEY =
  "phc_sUjxrcTH7saY1BYLPKfgwVmSDNr1F2L0qZmtIdsnyEz"

// CLI tools are client-like runtimes, not servers
export const posthog = new PostHog(
  process.env.POSTHOG_API_KEY ?? POSTHOG_PROJECT_API_KEY,
  {
    host: process.env.POSTHOG_HOST ?? "https://us.i.posthog.com",
    flushAt: 1,
    flushInterval: 0,
    enableExceptionAutocapture: true,
    isServer: false,
    personProfiles: "identified_only",
  }
)
