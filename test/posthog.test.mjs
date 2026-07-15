import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const exec = promisify(execFile)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const posthogModuleUrl = pathToFileURL(
  path.join(__dirname, "..", "dist", "posthog.js"),
).href

async function probePosthog(apiKey) {
  const env = {
    ...process.env,
    POSTHOG_HOST: "http://127.0.0.1:1",
  }

  if (apiKey === undefined) {
    delete env.POSTHOG_API_KEY
  } else {
    env.POSTHOG_API_KEY = apiKey
  }

  const script = `
    import { posthog as posthogClient } from "posthog-js"
    import { posthog, telemetryEnabled } from ${JSON.stringify(posthogModuleUrl)}

    posthog.capture("configuration_probe")
    process.stdout.write(JSON.stringify({
      apiKey: posthogClient.config.token,
      telemetryEnabled,
    }))
    process.exit(0)
  `

  const { stdout } = await exec(process.execPath, [
    "--input-type=module",
    "--eval",
    script,
  ], { env })

  return JSON.parse(stdout)
}

describe("PostHog configuration", () => {
  it("uses the public project API key by default", async () => {
    const config = await probePosthog(undefined)

    assert.equal(config.telemetryEnabled, true)
    assert.equal(
      config.apiKey,
      "phc_sUjxrcTH7saY1BYLPKfgwVmSDNr1F2L0qZmtIdsnyEz",
    )
  })

  it("allows POSTHOG_API_KEY to override the default", async () => {
    const config = await probePosthog("phc_test_override")

    assert.equal(config.telemetryEnabled, true)
    assert.equal(config.apiKey, "phc_test_override")
  })

  it("disables telemetry when POSTHOG_API_KEY is empty", async () => {
    const config = await probePosthog("")

    assert.equal(config.telemetryEnabled, false)
  })
})
