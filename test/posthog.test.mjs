import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import http from "node:http"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { gunzipSync } from "node:zlib"

const exec = promisify(execFile)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const POSTHOG_MODULE = path.join(__dirname, "..", "dist", "posthog.js")
const DEFAULT_API_KEY =
  "phc_sUjxrcTH7saY1BYLPKfgwVmSDNr1F2L0qZmtIdsnyEz"

async function captureApiKeys(apiKey, extraEnv = {}) {
  const payloads = []
  const server = http.createServer((request, response) => {
    const chunks = []
    request.on("data", (chunk) => chunks.push(chunk))
    request.on("end", () => {
      const rawBody = Buffer.concat(chunks)
      const body =
        rawBody[0] === 0x1f && rawBody[1] === 0x8b
          ? gunzipSync(rawBody)
          : rawBody
      payloads.push(JSON.parse(body.toString()))
      response.writeHead(200, { "content-type": "application/json" })
      response.end("{}")
    })
  })

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))

  try {
    const address = server.address()
    assert.ok(address && typeof address !== "string")

    const env = {
      ...process.env,
      POSTHOG_HOST: `http://127.0.0.1:${address.port}`,
      ...extraEnv,
    }
    if (apiKey === undefined) {
      delete env.POSTHOG_API_KEY
    } else {
      env.POSTHOG_API_KEY = apiKey
    }

    await exec(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `import { posthog } from ${JSON.stringify(POSTHOG_MODULE)};
posthog.capture("posthog_configuration_test");
setTimeout(() => process.exit(0), 250);`,
      ],
      { env },
    )
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    )
  }

  return payloads
    .flatMap((payload) => (Array.isArray(payload) ? payload : [payload]))
    .map((event) => event.properties?.token)
    .filter(Boolean)
}

describe("PostHog API key configuration", () => {
  it("uses the public project key when POSTHOG_API_KEY is unset", async () => {
    const apiKeys = await captureApiKeys(undefined)
    assert.deepEqual([...new Set(apiKeys)], [DEFAULT_API_KEY])
  })

  it("uses a non-empty POSTHOG_API_KEY override", async () => {
    const apiKeys = await captureApiKeys("phc_test_override")
    assert.deepEqual([...new Set(apiKeys)], ["phc_test_override"])
  })

  it("disables telemetry when POSTHOG_API_KEY is empty", async () => {
    const apiKeys = await captureApiKeys("")
    assert.deepEqual(apiKeys, [])
  })

  it("disables telemetry when DO_NOT_TRACK=1", async () => {
    const apiKeys = await captureApiKeys(undefined, { DO_NOT_TRACK: "1" })
    assert.deepEqual(apiKeys, [])
  })

  it("disables telemetry when NO_TELEMETRY=1", async () => {
    const apiKeys = await captureApiKeys(undefined, { NO_TELEMETRY: "1" })
    assert.deepEqual(apiKeys, [])
  })
})
