import { PostHog } from "posthog-node"
import { randomUUID } from "crypto"

export const runId = randomUUID()

// Public project key (same as cubic.dev PostHog snippet). Override via POSTHOG_API_KEY;
// set POSTHOG_API_KEY= to disable telemetry.
const POSTHOG_PROJECT_KEY = "phc_sUjxrcTH7saY1BYLPKfgwVmSDNr1F2L0qZmtIdsnyEz"

// CLI tools are client-like runtimes, not servers
export const posthog = new PostHog(
  process.env.POSTHOG_API_KEY ?? POSTHOG_PROJECT_KEY,
  {
    host: process.env.POSTHOG_HOST ?? "https://us.i.posthog.com",
    personProfiles: "identified_only",
    flushAt: 1,
    flushInterval: 0,
    enableExceptionAutocapture: true,
    isServer: false,
  }
)
