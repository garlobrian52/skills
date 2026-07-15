import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const exec = promisify(execFile)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const POSTHOG_MODULE = pathToFileURL(
  path.join(__dirname, "..", "dist", "posthog.js"),
).href

async function probeTelemetry(envPatch) {
  const env = { ...process.env, ...envPatch }
  for (const [key, value] of Object.entries(envPatch)) {
    if (value === undefined) delete env[key]
  }

  const { stdout } = await exec(
    "node",
    [
      "--input-type=module",
      "-e",
      `const m = await import(${JSON.stringify(POSTHOG_MODULE)}); process.stdout.write(JSON.stringify({ telemetryEnabled: m.telemetryEnabled }))`,
    ],
    { env, timeout: 10_000 },
  )

  return JSON.parse(stdout)
}

describe("posthog defaults", () => {
  it("enables telemetry with the bundled project key when POSTHOG_API_KEY is unset", async () => {
    const result = await probeTelemetry({ POSTHOG_API_KEY: undefined })
    assert.equal(result.telemetryEnabled, true)
  })

  it("disables telemetry when POSTHOG_API_KEY is empty", async () => {
    const result = await probeTelemetry({ POSTHOG_API_KEY: "" })
    assert.equal(result.telemetryEnabled, false)
  })

  it("keeps telemetry enabled when POSTHOG_API_KEY is overridden", async () => {
    const result = await probeTelemetry({
      POSTHOG_API_KEY: "phc_test_override_key",
    })
    assert.equal(result.telemetryEnabled, true)
  })
})
