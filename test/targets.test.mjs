import { describe, it, before, after } from "node:test"
import assert from "node:assert/strict"
import { mkdir, writeFile, readFile, rm, access } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { tmpdir } from "node:os"
import { randomBytes } from "node:crypto"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DIST = path.join(__dirname, "..", "dist")
const PLUGIN_ROOT = path.join(__dirname, "..")
const TMP = path.join(tmpdir(), `targets-test-${randomBytes(4).toString("hex")}`)

let targets

async function freshDir(name) {
  const dir = path.join(TMP, name)
  await mkdir(dir, { recursive: true })
  return dir
}

before(async () => {
  targets = await import(pathToFileURL(path.join(DIST, "targets", "index.js")).href)
  await mkdir(TMP, { recursive: true })
})

after(async () => {
  await rm(TMP, { recursive: true, force: true })
})

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

async function fileExists(p) {
  try {
    await access(p)
    return true
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// authHeader
// ---------------------------------------------------------------------------

describe("authHeader", () => {
  it("returns a Bearer token when apiKey is provided", () => {
    const header = targets.authHeader("cbk_mykey")
    assert.equal(header, "Bearer cbk_mykey")
  })

  it("returns the placeholder when no apiKey is provided", () => {
    const header = targets.authHeader()
    assert.equal(header, "Bearer ${CUBIC_API_KEY}")
  })

  it("returns the placeholder for an empty string", () => {
    const header = targets.authHeader("")
    assert.equal(header, "Bearer ${CUBIC_API_KEY}")
  })
})

// ---------------------------------------------------------------------------
// target registry
// ---------------------------------------------------------------------------

describe("targets registry", () => {
  const EXPECTED = ["claude", "opencode", "codex", "cursor", "droid", "pi", "gemini", "universal"]

  it("exports all expected targets", () => {
    for (const name of EXPECTED) {
      assert.ok(targets.targets[name], `missing target: ${name}`)
    }
  })

  it("TARGET_NAMES matches keys in targets map", () => {
    assert.deepEqual(targets.TARGET_NAMES.sort(), Object.keys(targets.targets).sort())
  })

  for (const name of EXPECTED) {
    it(`${name} target has install, uninstall, defaultRoot methods`, () => {
      const t = targets.targets[name]
      assert.ok(typeof t.install === "function", "install must be a function")
      assert.ok(typeof t.uninstall === "function", "uninstall must be a function")
      assert.ok(typeof t.defaultRoot === "function", "defaultRoot must be a function")
    })

    it(`${name}.defaultRoot() returns a string`, () => {
      const root = targets.targets[name].defaultRoot()
      assert.ok(typeof root === "string" && root.length > 0)
    })
  }
})

// ---------------------------------------------------------------------------
// claude target
// ---------------------------------------------------------------------------

describe("claude target", () => {
  it("install creates .mcp.json with cubic server entry", async () => {
    const outDir = await freshDir("claude-install")
    const result = await targets.targets.claude.install(PLUGIN_ROOT, outDir, "cbk_test")
    const mcp = JSON.parse(await readFile(path.join(outDir, ".mcp.json"), "utf-8"))
    assert.ok(mcp.mcpServers.cubic, "cubic mcp server must be present")
    assert.equal(mcp.mcpServers.cubic.type, "http")
    assert.equal(mcp.mcpServers.cubic.headers.Authorization, "Bearer cbk_test")
    assert.equal(result.mcpServers, 1)
  })

  it("install installs skills into .claude/skills", async () => {
    const outDir = await freshDir("claude-install-skills")
    const result = await targets.targets.claude.install(PLUGIN_ROOT, outDir)
    assert.ok(result.skills > 0, "should install at least 1 skill")
    const skillMd = path.join(outDir, ".claude", "skills", "run-review", "SKILL.md")
    await access(skillMd)
  })

  it("install installs commands into .claude/commands", async () => {
    const outDir = await freshDir("claude-install-cmds")
    const result = await targets.targets.claude.install(PLUGIN_ROOT, outDir)
    assert.ok(result.commands > 0, "should install at least 1 command")
    await access(path.join(outDir, ".claude", "commands", "run-review.md"))
  })

  it("uninstall removes the cubic mcp entry from .mcp.json", async () => {
    const outDir = await freshDir("claude-uninstall")
    await targets.targets.claude.install(PLUGIN_ROOT, outDir)
    await targets.targets.claude.uninstall(outDir)
    const mcp = JSON.parse(await readFile(path.join(outDir, ".mcp.json"), "utf-8"))
    assert.ok(!mcp.mcpServers?.cubic, "cubic should have been removed")
  })

  it("uninstall removes skill directories from .claude/skills", async () => {
    const outDir = await freshDir("claude-uninstall-skills")
    await targets.targets.claude.install(PLUGIN_ROOT, outDir)
    await targets.targets.claude.uninstall(outDir)
    const skillDir = path.join(outDir, ".claude", "skills", "run-review")
    assert.equal(await fileExists(skillDir), false)
  })

  it("install uses ${CUBIC_API_KEY} placeholder when no apiKey supplied", async () => {
    const outDir = await freshDir("claude-install-nokey")
    await targets.targets.claude.install(PLUGIN_ROOT, outDir)
    const mcp = JSON.parse(await readFile(path.join(outDir, ".mcp.json"), "utf-8"))
    assert.ok(
      mcp.mcpServers.cubic.headers.Authorization.includes("CUBIC_API_KEY"),
      "should contain placeholder",
    )
  })
})

// ---------------------------------------------------------------------------
// cursor target
// ---------------------------------------------------------------------------

describe("cursor target", () => {
  it("install creates mcp.json with cubic server entry", async () => {
    const outDir = await freshDir("cursor-install")
    const result = await targets.targets.cursor.install(PLUGIN_ROOT, outDir, "cbk_cursor")
    const mcp = JSON.parse(await readFile(path.join(outDir, "mcp.json"), "utf-8"))
    assert.ok(mcp.mcpServers.cubic, "cubic entry must be present")
    assert.equal(mcp.mcpServers.cubic.headers.Authorization, "Bearer cbk_cursor")
    assert.equal(result.mcpServers, 1)
  })

  it("install prefixes commands with cubic- in commands/", async () => {
    const outDir = await freshDir("cursor-install-cmds")
    const result = await targets.targets.cursor.install(PLUGIN_ROOT, outDir)
    assert.ok(result.commands > 0)
    await access(path.join(outDir, "commands", "cubic-run-review.md"))
  })

  it("stripped commands contain only description in frontmatter", async () => {
    const outDir = await freshDir("cursor-stripped")
    await targets.targets.cursor.install(PLUGIN_ROOT, outDir)
    const content = await readFile(
      path.join(outDir, "commands", "cubic-run-review.md"),
      "utf-8",
    )
    assert.ok(content.includes("description:"), "should retain description")
    assert.ok(!content.includes("allowed-tools:"), "allowed-tools should be stripped")
    assert.ok(!content.includes("argument-hint:"), "argument-hint should be stripped")
  })

  it("uninstall removes the cubic mcp entry from mcp.json", async () => {
    const outDir = await freshDir("cursor-uninstall")
    await targets.targets.cursor.install(PLUGIN_ROOT, outDir)
    await targets.targets.cursor.uninstall(outDir)
    const mcp = JSON.parse(await readFile(path.join(outDir, "mcp.json"), "utf-8"))
    assert.ok(!mcp.mcpServers?.cubic)
  })

  it("uninstall removes prefixed command files", async () => {
    const outDir = await freshDir("cursor-uninstall-cmds")
    await targets.targets.cursor.install(PLUGIN_ROOT, outDir)
    await targets.targets.cursor.uninstall(outDir)
    const cmdFile = path.join(outDir, "commands", "cubic-run-review.md")
    assert.equal(await fileExists(cmdFile), false)
  })
})

// ---------------------------------------------------------------------------
// universal target
// ---------------------------------------------------------------------------

describe("universal target", () => {
  it("install creates .agents/skills directory", async () => {
    const outDir = await freshDir("universal-install")
    const result = await targets.targets.universal.install(PLUGIN_ROOT, outDir)
    assert.ok(result.skills > 0)
    await access(path.join(outDir, ".agents", "skills", "run-review", "SKILL.md"))
  })

  it("install creates prefixed commands in .agents/commands", async () => {
    const outDir = await freshDir("universal-cmds")
    const result = await targets.targets.universal.install(PLUGIN_ROOT, outDir)
    assert.ok(result.commands > 0)
    await access(path.join(outDir, ".agents", "commands", "cubic-run-review.md"))
  })

  it("install reports 0 mcpServers (universal has no MCP)", async () => {
    const outDir = await freshDir("universal-nomcp")
    const result = await targets.targets.universal.install(PLUGIN_ROOT, outDir)
    assert.equal(result.mcpServers, 0)
  })

  it("uninstall removes skills from .agents/skills", async () => {
    const outDir = await freshDir("universal-uninstall")
    await targets.targets.universal.install(PLUGIN_ROOT, outDir)
    await targets.targets.universal.uninstall(outDir)
    const skillDir = path.join(outDir, ".agents", "skills", "run-review")
    assert.equal(await fileExists(skillDir), false)
  })

  it("uninstall removes prefixed commands from .agents/commands", async () => {
    const outDir = await freshDir("universal-uninstall-cmds")
    await targets.targets.universal.install(PLUGIN_ROOT, outDir)
    await targets.targets.universal.uninstall(outDir)
    const cmdFile = path.join(outDir, ".agents", "commands", "cubic-run-review.md")
    assert.equal(await fileExists(cmdFile), false)
  })
})

// ---------------------------------------------------------------------------
// codex target
// ---------------------------------------------------------------------------

describe("codex target", () => {
  it("install creates config.toml with cubic mcp_servers entry", async () => {
    const outDir = await freshDir("codex-install")
    const result = await targets.targets.codex.install(PLUGIN_ROOT, outDir, "cbk_codex")
    const toml = await readFile(path.join(outDir, "config.toml"), "utf-8")
    assert.ok(toml.includes("[mcp_servers.cubic]"), "toml should have cubic section")
    assert.ok(toml.includes("cbk_codex"), "toml should contain the API key")
    assert.equal(result.mcpServers, 1)
  })

  it("install creates skills directory", async () => {
    const outDir = await freshDir("codex-skills")
    const result = await targets.targets.codex.install(PLUGIN_ROOT, outDir)
    assert.ok(result.skills > 0)
    await access(path.join(outDir, "skills", "run-review", "SKILL.md"))
  })

  it("install creates prompts (not commands) directory", async () => {
    const outDir = await freshDir("codex-prompts")
    const result = await targets.targets.codex.install(PLUGIN_ROOT, outDir)
    assert.ok(result.prompts > 0, "codex uses prompts, not commands")
    assert.equal(result.commands, 0)
    await access(path.join(outDir, "prompts", "cubic-run-review.md"))
  })

  it("merges into existing config.toml without clobbering other sections", async () => {
    const outDir = await freshDir("codex-merge-toml")
    const existing = "[other_server]\nfoo = 1\n"
    await writeFile(path.join(outDir, "config.toml"), existing)
    await targets.targets.codex.install(PLUGIN_ROOT, outDir)
    const toml = await readFile(path.join(outDir, "config.toml"), "utf-8")
    assert.ok(toml.includes("[other_server]"), "existing section should be preserved")
    assert.ok(toml.includes("[mcp_servers.cubic]"), "cubic section should be added")
  })

  it("uninstall removes the cubic section from config.toml", async () => {
    const outDir = await freshDir("codex-uninstall")
    await targets.targets.codex.install(PLUGIN_ROOT, outDir)
    await targets.targets.codex.uninstall(outDir)
    const exists = await fileExists(path.join(outDir, "config.toml"))
    if (exists) {
      const toml = await readFile(path.join(outDir, "config.toml"), "utf-8")
      assert.ok(!toml.includes("[mcp_servers.cubic]"), "cubic section should be removed")
    }
  })

  it("uninstall removes prompt files", async () => {
    const outDir = await freshDir("codex-uninstall-prompts")
    await targets.targets.codex.install(PLUGIN_ROOT, outDir)
    await targets.targets.codex.uninstall(outDir)
    const promptFile = path.join(outDir, "prompts", "cubic-run-review.md")
    assert.equal(await fileExists(promptFile), false)
  })
})

// ---------------------------------------------------------------------------
// gemini target
// ---------------------------------------------------------------------------

describe("gemini target", () => {
  it("install creates settings.json with cubic mcpServers entry", async () => {
    const outDir = await freshDir("gemini-install")
    const result = await targets.targets.gemini.install(PLUGIN_ROOT, outDir, "cbk_gemini")
    const settings = JSON.parse(await readFile(path.join(outDir, "settings.json"), "utf-8"))
    assert.ok(settings.mcpServers.cubic, "cubic entry must be present")
    assert.equal(settings.mcpServers.cubic.headers.Authorization, "Bearer cbk_gemini")
    assert.equal(result.mcpServers, 1)
  })

  it("install creates commands as .toml files", async () => {
    const outDir = await freshDir("gemini-toml-cmds")
    const result = await targets.targets.gemini.install(PLUGIN_ROOT, outDir)
    assert.ok(result.commands > 0)
    await access(path.join(outDir, "commands", "cubic-run-review.toml"))
  })

  it("toml commands have description and triple-quoted prompt", async () => {
    const outDir = await freshDir("gemini-toml-content")
    await targets.targets.gemini.install(PLUGIN_ROOT, outDir)
    const content = await readFile(
      path.join(outDir, "commands", "cubic-run-review.toml"),
      "utf-8",
    )
    assert.ok(content.includes("description ="), "toml should have description")
    assert.ok(content.includes('prompt = """'), "toml should have triple-quoted prompt")
  })

  it("uninstall removes the cubic entry from settings.json", async () => {
    const outDir = await freshDir("gemini-uninstall")
    await targets.targets.gemini.install(PLUGIN_ROOT, outDir)
    await targets.targets.gemini.uninstall(outDir)
    const settings = JSON.parse(await readFile(path.join(outDir, "settings.json"), "utf-8"))
    assert.ok(!settings.mcpServers?.cubic)
  })

  it("uninstall removes .toml command files", async () => {
    const outDir = await freshDir("gemini-uninstall-toml")
    await targets.targets.gemini.install(PLUGIN_ROOT, outDir)
    await targets.targets.gemini.uninstall(outDir)
    const tomlFile = path.join(outDir, "commands", "cubic-run-review.toml")
    assert.equal(await fileExists(tomlFile), false)
  })
})
