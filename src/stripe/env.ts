import { promises as fs } from "fs"
import path from "path"

/**
 * Load KEY=VALUE pairs from a .env file into process.env (without overriding
 * values already set). Missing files are ignored.
 */
export async function loadEnvFile(
  filePath: string = path.resolve(process.cwd(), ".env"),
): Promise<void> {
  let raw: string
  try {
    raw = await fs.readFile(filePath, "utf8")
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === "ENOENT") return
    throw err
  }

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const eq = trimmed.indexOf("=")
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (process.env[key] === undefined) {
      process.env[key] = value
    }
  }
}

export function requireEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(
      `Missing ${name}. Set it in your environment or .env file. Obtain Stripe API keys from https://dashboard.stripe.com/apikeys`,
    )
  }
  return value
}

export function optionalEnv(name: string, fallback: string): string {
  const value = process.env[name]?.trim()
  return value || fallback
}
