import { PostHog } from "posthog-node"
import { randomUUID } from "crypto"

export const runId = randomUUID()

// CLI tools are client-like runtimes, not servers
export const posthog = new PostHog(
  process.env.POSTHOG_API_KEY ?? "",
  {
    host: process.env.POSTHOG_HOST ?? "https://us.i.posthog.com",
    flushAt: 1,
    flushInterval: 0,
    enableExceptionAutocapture: true,
    isServer: false,
  }
)
