import { describe, it, before, after } from "node:test"
import assert from "node:assert/strict"
import { mkdir, writeFile, readFile, rm, lstat, access } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { tmpdir } from "node:os"
import { randomBytes } from "node:crypto"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DIST = path.join(__dirname, "..", "dist")
const TMP = path.join(tmpdir(), `utils-test-${randomBytes(4).toString("hex")}`)

let utils

async function freshDir(name) {
  const dir = path.join(TMP, name)
  await mkdir(dir, { recursive: true })
  return dir
}

before(async () => {
  utils = await import(pathToFileURL(path.join(DIST, "utils.js")).href)
  await mkdir(TMP, { recursive: true })
})

after(async () => {
  await rm(TMP, { recursive: true, force: true })
})

// ---------------------------------------------------------------------------
// inlineApiKey
// ---------------------------------------------------------------------------

describe("inlineApiKey", () => {
  it("replaces ${CUBIC_API_KEY} in header values", () => {
    const cfg = {
      cubic: {
        headers: { Authorization: "Bearer ${CUBIC_API_KEY}" },
      },
    }
    utils.inlineApiKey(cfg, "cbk_testkey123")
    assert.equal(cfg.cubic.headers.Authorization, "Bearer cbk_testkey123")
  })

  it("replaces all occurrences when the placeholder appears multiple times", () => {
    const cfg = {
      cubic: {
        headers: {
          "X-Key": "${CUBIC_API_KEY}:${CUBIC_API_KEY}",
        },
      },
    }
    utils.inlineApiKey(cfg, "cbk_abc")
    assert.equal(cfg.cubic.headers["X-Key"], "cbk_abc:cbk_abc")
  })

  it("does nothing when server has no headers", () => {
    const cfg = { cubic: { url: "https://example.com" } }
    assert.doesNotThrow(() => utils.inlineApiKey(cfg, "cbk_k"))
  })

  it("ignores non-object values in the config", () => {
    const cfg = { count: 42, label: "hello" }
    assert.doesNotThrow(() => utils.inlineApiKey(cfg, "cbk_k"))
  })
})

// ---------------------------------------------------------------------------
// pathExists
// ---------------------------------------------------------------------------

describe("pathExists", () => {
  it("returns true for an existing file", async () => {
    const dir = await freshDir("pathExists-file")
    const f = path.join(dir, "test.txt")
    await writeFile(f, "hello")
    assert.equal(await utils.pathExists(f), true)
  })

  it("returns true for an existing directory", async () => {
    const dir = await freshDir("pathExists-dir")
    assert.equal(await utils.pathExists(dir), true)
  })

  it("returns false for a non-existent path", async () => {
    assert.equal(await utils.pathExists(path.join(TMP, "does-not-exist")), false)
  })
})

// ---------------------------------------------------------------------------
// installFile
// ---------------------------------------------------------------------------

describe("installFile", () => {
  it("copies the source file in paste mode", async () => {
    const dir = await freshDir("installFile-paste")
    const src = path.join(dir, "source.txt")
    const tgt = path.join(dir, "target.txt")
    await writeFile(src, "content")
    await utils.installFile(src, tgt, "paste")
    assert.equal(await readFile(tgt, "utf-8"), "content")
  })

  it("creates a symlink in symlink mode", async () => {
    const dir = await freshDir("installFile-symlink")
    const src = path.join(dir, "source.txt")
    const tgt = path.join(dir, "target.txt")
    await writeFile(src, "sym-content")
    await utils.installFile(src, tgt, "symlink")
    const stat = await lstat(tgt)
    assert.ok(stat.isSymbolicLink(), "target should be a symlink")
    assert.equal(await readFile(tgt, "utf-8"), "sym-content")
  })

  it("overwrites an existing symlink in symlink mode", async () => {
    const dir = await freshDir("installFile-symlink-overwrite")
    const src1 = path.join(dir, "source1.txt")
    const src2 = path.join(dir, "source2.txt")
    const tgt = path.join(dir, "target.txt")
    await writeFile(src1, "first")
    await writeFile(src2, "second")
    await utils.installFile(src1, tgt, "symlink")
    await utils.installFile(src2, tgt, "symlink")
    assert.equal(await readFile(tgt, "utf-8"), "second")
  })
})

// ---------------------------------------------------------------------------
// parseFrontmatter
// ---------------------------------------------------------------------------

describe("parseFrontmatter", () => {
  it("parses YAML frontmatter correctly", () => {
    const content = "---\nname: test\ndescription: A test\n---\nBody text"
    const { data, body } = utils.parseFrontmatter(content)
    assert.equal(data.name, "test")
    assert.equal(data.description, "A test")
    assert.equal(body, "Body text")
  })

  it("returns empty data and full content when there is no frontmatter", () => {
    const content = "Just a plain body"
    const { data, body } = utils.parseFrontmatter(content)
    assert.deepEqual(data, {})
    assert.equal(body, "Just a plain body")
  })

  it("returns an empty body string when content ends immediately after ---", () => {
    const content = "---\nkey: val\n---\n"
    const { data, body } = utils.parseFrontmatter(content)
    assert.equal(data.key, "val")
    assert.equal(body, "")
  })

  it("handles numeric and boolean YAML values", () => {
    const content = "---\ncount: 5\nenabled: true\n---\nbody"
    const { data } = utils.parseFrontmatter(content)
    assert.equal(data.count, 5)
    assert.equal(data.enabled, true)
  })
})

// ---------------------------------------------------------------------------
// formatFrontmatter
// ---------------------------------------------------------------------------

describe("formatFrontmatter", () => {
  it("produces a valid frontmatter document", () => {
    const result = utils.formatFrontmatter({ description: "My cmd" }, "Body here")
    assert.ok(result.startsWith("---\n"))
    assert.ok(result.includes("description: My cmd"))
    assert.ok(result.includes("---\n"))
    assert.ok(result.endsWith("Body here"))
  })

  it("round-trips through parseFrontmatter", () => {
    const data = { name: "skill", version: 2 }
    const body = "Some body content\nwith multiple lines"
    const formatted = utils.formatFrontmatter(data, body)
    const { data: parsed, body: parsedBody } = utils.parseFrontmatter(formatted)
    assert.equal(parsed.name, "skill")
    assert.equal(parsed.version, 2)
    assert.equal(parsedBody, body)
  })
})

// ---------------------------------------------------------------------------
// convertMcpConfig
// ---------------------------------------------------------------------------

describe("convertMcpConfig", () => {
  it("converts an HTTP server to remote format", () => {
    const input = {
      cubic: {
        type: "http",
        url: "https://cubic.dev/api/mcp",
        headers: { Authorization: "Bearer ${CUBIC_API_KEY}" },
      },
    }
    const result = utils.convertMcpConfig(input)
    assert.equal(result.cubic.type, "remote")
    assert.equal(result.cubic.url, "https://cubic.dev/api/mcp")
    assert.equal(result.cubic.enabled, true)
    assert.equal(result.cubic.headers.Authorization, "Bearer {env:CUBIC_API_KEY}")
  })

  it("converts a command (local) server to local format", () => {
    const input = {
      myServer: {
        command: "node",
        args: ["server.js"],
        env: { FOO: "bar" },
      },
    }
    const result = utils.convertMcpConfig(input)
    assert.equal(result.myServer.type, "local")
    assert.deepEqual(result.myServer.command, ["node", "server.js"])
    assert.deepEqual(result.myServer.environment, { FOO: "bar" })
    assert.equal(result.myServer.enabled, true)
  })

  it("skips servers that are neither HTTP nor command-based", () => {
    const input = { weird: { someField: 1 } }
    const result = utils.convertMcpConfig(input)
    assert.equal(Object.keys(result).length, 0)
  })
})

// ---------------------------------------------------------------------------
// mergeJsonConfig
// ---------------------------------------------------------------------------

describe("mergeJsonConfig", () => {
  it("creates a new file when none exists", async () => {
    const dir = await freshDir("mergeJsonConfig-new")
    const cfg = path.join(dir, "mcp.json")
    await utils.mergeJsonConfig(cfg, { cubic: { url: "https://example.com" } })
    const parsed = JSON.parse(await readFile(cfg, "utf-8"))
    assert.equal(parsed.mcpServers.cubic.url, "https://example.com")
  })

  it("merges into an existing file without clobbering other entries", async () => {
    const dir = await freshDir("mergeJsonConfig-existing")
    const cfg = path.join(dir, "mcp.json")
    await writeFile(cfg, JSON.stringify({ mcpServers: { other: { url: "https://other.com" } } }))
    await utils.mergeJsonConfig(cfg, { cubic: { url: "https://cubic.com" } })
    const parsed = JSON.parse(await readFile(cfg, "utf-8"))
    assert.ok(parsed.mcpServers.other)
    assert.ok(parsed.mcpServers.cubic)
  })

  it("overwrites an existing cubic entry", async () => {
    const dir = await freshDir("mergeJsonConfig-overwrite")
    const cfg = path.join(dir, "mcp.json")
    await writeFile(cfg, JSON.stringify({ mcpServers: { cubic: { url: "old" } } }))
    await utils.mergeJsonConfig(cfg, { cubic: { url: "new" } })
    const parsed = JSON.parse(await readFile(cfg, "utf-8"))
    assert.equal(parsed.mcpServers.cubic.url, "new")
  })
})

// ---------------------------------------------------------------------------
// removeMcpFromJsonConfig
// ---------------------------------------------------------------------------

describe("removeMcpFromJsonConfig", () => {
  it("removes the specified key from mcpServers", async () => {
    const dir = await freshDir("removeMcpFromJsonConfig-remove")
    const cfg = path.join(dir, "mcp.json")
    await writeFile(cfg, JSON.stringify({ mcpServers: { cubic: { url: "x" }, other: { url: "y" } } }))
    await utils.removeMcpFromJsonConfig(cfg, "cubic")
    const parsed = JSON.parse(await readFile(cfg, "utf-8"))
    assert.ok(!parsed.mcpServers.cubic)
    assert.ok(parsed.mcpServers.other)
  })

  it("removes mcpServers entirely when it becomes empty", async () => {
    const dir = await freshDir("removeMcpFromJsonConfig-empty")
    const cfg = path.join(dir, "mcp.json")
    await writeFile(cfg, JSON.stringify({ mcpServers: { cubic: { url: "x" } } }))
    await utils.removeMcpFromJsonConfig(cfg, "cubic")
    const parsed = JSON.parse(await readFile(cfg, "utf-8"))
    assert.ok(!parsed.mcpServers)
  })

  it("does nothing when the file does not exist", async () => {
    const nonExistent = path.join(TMP, "no-such-file.json")
    await assert.doesNotReject(() => utils.removeMcpFromJsonConfig(nonExistent, "cubic"))
  })

  it("does nothing when the key is not present", async () => {
    const dir = await freshDir("removeMcpFromJsonConfig-missing-key")
    const cfg = path.join(dir, "mcp.json")
    await writeFile(cfg, JSON.stringify({ mcpServers: { other: { url: "y" } } }))
    await utils.removeMcpFromJsonConfig(cfg, "cubic")
    const parsed = JSON.parse(await readFile(cfg, "utf-8"))
    assert.ok(parsed.mcpServers.other)
  })
})

// ---------------------------------------------------------------------------
// mergeOpenCodeConfig
// ---------------------------------------------------------------------------

describe("mergeOpenCodeConfig", () => {
  it("creates a new file with $schema and mcp entry", async () => {
    const dir = await freshDir("mergeOpenCodeConfig-new")
    const cfg = path.join(dir, "config.json")
    await utils.mergeOpenCodeConfig(cfg, { mcp: { cubic: { type: "remote" } } })
    const parsed = JSON.parse(await readFile(cfg, "utf-8"))
    assert.ok(parsed.$schema)
    assert.ok(parsed.mcp.cubic)
  })

  it("merges into an existing config without overwriting other mcp entries", async () => {
    const dir = await freshDir("mergeOpenCodeConfig-merge")
    const cfg = path.join(dir, "config.json")
    await writeFile(
      cfg,
      JSON.stringify({ $schema: "https://opencode.ai/config.json", mcp: { existing: {} } }),
    )
    await utils.mergeOpenCodeConfig(cfg, { mcp: { cubic: { type: "remote" } } })
    const parsed = JSON.parse(await readFile(cfg, "utf-8"))
    assert.ok(parsed.mcp.existing !== undefined)
    assert.ok(parsed.mcp.cubic)
  })
})

// ---------------------------------------------------------------------------
// removeMcpFromConfig
// ---------------------------------------------------------------------------

describe("removeMcpFromConfig", () => {
  it("removes the cubic mcp entry", async () => {
    const dir = await freshDir("removeMcpFromConfig-remove")
    const cfg = path.join(dir, "config.json")
    await writeFile(cfg, JSON.stringify({ mcp: { cubic: {}, other: {} } }))
    await utils.removeMcpFromConfig(cfg)
    const parsed = JSON.parse(await readFile(cfg, "utf-8"))
    assert.ok(!parsed.mcp.cubic)
    assert.ok(parsed.mcp.other !== undefined)
  })

  it("removes mcp key entirely when it becomes empty", async () => {
    const dir = await freshDir("removeMcpFromConfig-empty")
    const cfg = path.join(dir, "config.json")
    await writeFile(cfg, JSON.stringify({ mcp: { cubic: {} } }))
    await utils.removeMcpFromConfig(cfg)
    const parsed = JSON.parse(await readFile(cfg, "utf-8"))
    assert.ok(!parsed.mcp)
  })

  it("does nothing when the file does not exist", async () => {
    const nonExistent = path.join(TMP, "no-such-opencode.json")
    await assert.doesNotReject(() => utils.removeMcpFromConfig(nonExistent))
  })
})

// ---------------------------------------------------------------------------
// mergeFlatMcpConfig
// ---------------------------------------------------------------------------

describe("mergeFlatMcpConfig", () => {
  it("creates a new file with the given entries", async () => {
    const dir = await freshDir("mergeFlatMcpConfig-new")
    const cfg = path.join(dir, "mcp.json")
    await utils.mergeFlatMcpConfig(cfg, { cubic: { url: "https://cubic.dev/api/mcp" } })
    const parsed = JSON.parse(await readFile(cfg, "utf-8"))
    assert.ok(parsed.cubic)
  })

  it("merges into an existing file", async () => {
    const dir = await freshDir("mergeFlatMcpConfig-existing")
    const cfg = path.join(dir, "mcp.json")
    await writeFile(cfg, JSON.stringify({ existing: { url: "https://other.com" } }))
    await utils.mergeFlatMcpConfig(cfg, { cubic: { url: "https://cubic.com" } })
    const parsed = JSON.parse(await readFile(cfg, "utf-8"))
    assert.ok(parsed.existing)
    assert.ok(parsed.cubic)
  })
})

// ---------------------------------------------------------------------------
// writeManifest / readManifest
// ---------------------------------------------------------------------------

describe("writeManifest / readManifest", () => {
  it("round-trips a manifest object", async () => {
    const dir = await freshDir("manifest-roundtrip")
    const manifest = {
      manifestVersion: 1,
      pluginVersion: "1.2.3",
      method: "paste",
      installedAt: new Date().toISOString(),
      target: "claude",
      entries: [
        { name: "run-review", type: "skill", file: "skills/run-review/SKILL.md", method: "paste" },
      ],
    }
    await utils.writeManifest(dir, manifest)
    const read = await utils.readManifest(dir)
    assert.equal(read.manifestVersion, 1)
    assert.equal(read.pluginVersion, "1.2.3")
    assert.equal(read.target, "claude")
    assert.equal(read.entries.length, 1)
    assert.equal(read.entries[0].name, "run-review")
  })

  it("readManifest returns null when no manifest file exists", async () => {
    const dir = await freshDir("manifest-missing")
    const result = await utils.readManifest(dir)
    assert.equal(result, null)
  })
})

// ---------------------------------------------------------------------------
// TARGET_LAYOUTS
// ---------------------------------------------------------------------------

describe("TARGET_LAYOUTS", () => {
  const targets = ["claude", "opencode", "cursor", "codex", "droid", "pi", "gemini", "universal"]

  for (const name of targets) {
    it(`${name} layout has required fields`, () => {
      const layout = utils.TARGET_LAYOUTS[name]
      assert.ok(layout, `missing layout for ${name}`)
      assert.ok(typeof layout.skillsDir === "function", "skillsDir must be a function")
      assert.ok(typeof layout.commandDir === "function", "commandDir must be a function")
      assert.ok(["original", "stripped", "toml"].includes(layout.commandFormat), "unknown commandFormat")
      assert.ok(typeof layout.commandFilename === "function", "commandFilename must be a function")
    })
  }

  it("claude uses original format and preserves filenames", () => {
    const layout = utils.TARGET_LAYOUTS.claude
    assert.equal(layout.commandFormat, "original")
    assert.equal(layout.commandFilename("run-review.md"), "run-review.md")
  })

  it("gemini uses toml format and renames .md to .toml", () => {
    const layout = utils.TARGET_LAYOUTS.gemini
    assert.equal(layout.commandFormat, "toml")
    assert.equal(layout.commandFilename("run-review.md"), "cubic-run-review.toml")
  })

  it("cursor uses stripped format and prefixes with cubic-", () => {
    const layout = utils.TARGET_LAYOUTS.cursor
    assert.equal(layout.commandFormat, "stripped")
    assert.equal(layout.commandFilename("run-review.md"), "cubic-run-review.md")
  })

  it("claude skillsDir is inside .claude/skills", () => {
    const layout = utils.TARGET_LAYOUTS.claude
    const root = "/home/user"
    assert.ok(layout.skillsDir(root).includes(".claude"))
    assert.ok(layout.skillsDir(root).includes("skills"))
  })

  it("universal skillsDir is inside .agents/skills", () => {
    const layout = utils.TARGET_LAYOUTS.universal
    const root = "/home/user"
    assert.ok(layout.skillsDir(root).includes(".agents"))
    assert.ok(layout.skillsDir(root).includes("skills"))
  })
})

// ---------------------------------------------------------------------------
// installReviewSkill
// ---------------------------------------------------------------------------

describe("installReviewSkill", () => {
  it("installs run-review SKILL.md into the target directory", async () => {
    const pluginRoot = path.join(__dirname, "..")
    const skillsDir = await freshDir("installReviewSkill-target")
    const installed = await utils.installReviewSkill(pluginRoot, skillsDir)
    assert.equal(installed, true)
    await access(path.join(skillsDir, "run-review", "SKILL.md"))
  })

  it("returns false when source SKILL.md does not exist", async () => {
    const fakeRoot = await freshDir("installReviewSkill-fakeroot")
    const skillsDir = await freshDir("installReviewSkill-target-2")
    const installed = await utils.installReviewSkill(fakeRoot, skillsDir)
    assert.equal(installed, false)
  })
})

// ---------------------------------------------------------------------------
// installReviewCommand
// ---------------------------------------------------------------------------

describe("installReviewCommand", () => {
  it("copies run-review.md verbatim in original format", async () => {
    const pluginRoot = path.join(__dirname, "..")
    const cmdDir = await freshDir("installReviewCommand-original")
    const layout = utils.TARGET_LAYOUTS.claude
    const installed = await utils.installReviewCommand(pluginRoot, cmdDir, layout)
    assert.equal(installed, true)
    await access(path.join(cmdDir, "run-review.md"))
  })

  it("strips frontmatter to only description in stripped format", async () => {
    const pluginRoot = path.join(__dirname, "..")
    const cmdDir = await freshDir("installReviewCommand-stripped")
    const layout = utils.TARGET_LAYOUTS.cursor
    const installed = await utils.installReviewCommand(pluginRoot, cmdDir, layout)
    assert.equal(installed, true)
    const content = await readFile(path.join(cmdDir, "cubic-run-review.md"), "utf-8")
    const { data } = utils.parseFrontmatter(content)
    assert.ok(data.description, "description should be present")
    assert.ok(!data.name, "name should be stripped")
    assert.ok(!data["allowed-tools"], "allowed-tools should be stripped")
  })

  it("produces valid TOML in toml format", async () => {
    const pluginRoot = path.join(__dirname, "..")
    const cmdDir = await freshDir("installReviewCommand-toml")
    const layout = utils.TARGET_LAYOUTS.gemini
    const installed = await utils.installReviewCommand(pluginRoot, cmdDir, layout)
    assert.equal(installed, true)
    const content = await readFile(path.join(cmdDir, "cubic-run-review.toml"), "utf-8")
    assert.ok(content.includes("description ="), "TOML should have a description field")
    assert.ok(content.includes('prompt = """'), "TOML should have a prompt triple-quoted string")
  })

  it("returns false when source command file does not exist", async () => {
    const fakeRoot = await freshDir("installReviewCommand-fakeroot")
    const cmdDir = await freshDir("installReviewCommand-target-missing")
    const layout = utils.TARGET_LAYOUTS.claude
    const result = await utils.installReviewCommand(fakeRoot, cmdDir, layout)
    assert.equal(result, false)
  })
})

// ---------------------------------------------------------------------------
// uninstallSkills / installSkills (additional edge cases)
// ---------------------------------------------------------------------------

describe("uninstallSkills edge cases", () => {
  it("returns 0 when none of the cubic skills are present", async () => {
    const emptyDir = await freshDir("uninstallSkills-empty")
    const count = await utils.uninstallSkills(emptyDir)
    assert.equal(count, 0)
  })

  it("removes only cubic skills, leaving unrelated directories", async () => {
    const dir = await freshDir("uninstallSkills-selective")
    await mkdir(path.join(dir, "run-review"), { recursive: true })
    await writeFile(path.join(dir, "run-review", "SKILL.md"), "")
    await mkdir(path.join(dir, "my-custom-skill"), { recursive: true })
    await utils.uninstallSkills(dir)
    await assert.rejects(access(path.join(dir, "run-review")))
    await access(path.join(dir, "my-custom-skill"))
  })
})
