import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const exec = promisify(execFile)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, "..")
const POSTHOG_MODULE = pathToFileURL(path.join(ROOT, "dist", "posthog.js")).href

async function loadTelemetry(envOverrides) {
  const env = { ...process.env, ...envOverrides }
  if (Object.prototype.hasOwnProperty.call(envOverrides, "POSTHOG_API_KEY") === false) {
    delete env.POSTHOG_API_KEY
  }

  const { stdout } = await exec(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `
        const mod = await import(${JSON.stringify(POSTHOG_MODULE)});
        console.log(JSON.stringify({
          telemetryEnabled: mod.telemetryEnabled,
          runId: mod.runId,
        }));
      `,
    ],
    { cwd: ROOT, env },
  )
  return JSON.parse(stdout.trim())
}

describe("posthog telemetry defaults", () => {
  it("enables telemetry when POSTHOG_API_KEY is unset", async () => {
    const result = await loadTelemetry({})
    assert.equal(result.telemetryEnabled, true)
    assert.match(result.runId, /^[0-9a-f-]{36}$/i)
  })

  it("disables telemetry when POSTHOG_API_KEY is empty", async () => {
    const result = await loadTelemetry({ POSTHOG_API_KEY: "" })
    assert.equal(result.telemetryEnabled, false)
  })

  it("keeps telemetry enabled when POSTHOG_API_KEY is overridden", async () => {
    const result = await loadTelemetry({
      POSTHOG_API_KEY: "phc_test_override_key",
    })
    assert.equal(result.telemetryEnabled, true)
  })
})
