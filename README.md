# cubic Plugin for AI Coding Tools

Access cubic's AI code review insights from Claude Code, Cursor, OpenCode, Codex, Gemini CLI, Factory Droid, Pi, and tools that support the universal `.agents` layout. Get PR review issues, browse AI-generated wikis, check codebase scans, and apply team review learnings — all without leaving your editor.

## Claude Code Install

```bash
/plugin marketplace add mrge-io/skills
/plugin install cubic@cubic
```

> **Requires** [Claude Code](https://code.claude.com) v1.0.33+

## CLI Install

```bash
# All targets (default)
npx @cubic-plugin/cubic-plugin install

# Claude Code
npx @cubic-plugin/cubic-plugin install --to claude

# OpenCode
npx @cubic-plugin/cubic-plugin install --to opencode

# Codex
npx @cubic-plugin/cubic-plugin install --to codex

# Cursor
npx @cubic-plugin/cubic-plugin install --to cursor

# Factory Droid
npx @cubic-plugin/cubic-plugin install --to droid

# Pi
npx @cubic-plugin/cubic-plugin install --to pi

# Gemini CLI
npx @cubic-plugin/cubic-plugin install --to gemini

# Universal (.agents/skills)
npx @cubic-plugin/cubic-plugin install --to universal
```

A full install configures MCP and needs a cubic API key. Interactive runs prompt for it; use `--skills-only` when you only need the `run-review` skill and command.

## CLI Reference

### Install options

```bash
npx @cubic-plugin/cubic-plugin install [options]
```

| Option | Default | Description |
| --- | --- | --- |
| `--to <target>` | `all` | Install to `claude`, `opencode`, `codex`, `cursor`, `droid`, `pi`, `gemini`, `universal`, or every target. |
| `-o, --output <dir>` | Target-specific | Override the destination root. The installer appends the target name, including when installing one target. |
| `--skills-only` | `false` | Install only the `run-review` skill and command, without MCP configuration or API-key setup. |
| `--json` | `false` | Write newline-delimited JSON (NDJSON) events to stdout and disable interactive authentication. |
| `--method paste\|symlink` | `paste` | Copy source files or symlink them. Commands that require format conversion are always copied. |

`symlink` requires a local package source containing `.mcp.json`. If the installer has to clone a temporary source, use `paste`.

### Default install locations

Paths beginning with `$PWD` are relative to the directory where you run the CLI.

| Target | Destination root | Installed content |
| --- | --- | --- |
| Claude Code | `$PWD` | `.claude/skills/`, `.claude/commands/`, `.mcp.json` |
| Cursor | `$PWD/.cursor` | `skills/`, `commands/`, `mcp.json` |
| OpenCode | `~/.config/opencode` | `skills/`, `commands/`, `opencode.json` |
| Codex | `~/.codex` | `skills/`, `prompts/`, `config.toml` |
| Factory Droid | `~/.factory` | `skills/`, `commands/`, `mcp.json` |
| Pi | `~/.pi/agent` | `skills/`, `prompts/`, `cubic/mcporter.json` |
| Gemini CLI | `$PWD/.gemini` | `skills/`, `commands/`, `settings.json` |
| Universal | `$PWD` | `.agents/skills/`, `.agents/commands/` (no MCP configuration) |

Each successful target install also writes `.cubic-manifest.json` at the destination root. It records the plugin version, install method, timestamp, target, and installed entries for diagnostics. Uninstall currently uses the target layout rather than this manifest.

Use `--output` to inspect an installation without changing editor configuration:

```bash
npm run build
node dist/index.js install --skills-only --to cursor --output /tmp/cubic-check
# Inspect /tmp/cubic-check/cursor/
node dist/index.js uninstall --to cursor --output /tmp/cubic-check
```

### Uninstall options

```bash
npx @cubic-plugin/cubic-plugin uninstall --to opencode
```

`uninstall` accepts `--to <target>` (default: `all`) and `-o, --output <dir>`. Use the same values supplied during installation, then restart the editor.

## Prerequisites

- One of the supported AI coding tools above. The Claude Code marketplace installation requires [Claude Code](https://code.claude.com) v1.0.33+.
- For a full MCP install, a [cubic](https://www.cubic.dev) account with an active installation and a cubic API key (`cbk_*`)
- (Optional) [cubic CLI](https://cubic.dev/install) for `/cubic:run-review`

## Installation

### From GitHub (recommended)

```bash
# Step 1: Add the cubic marketplace
/plugin marketplace add mrge-io/skills

# Step 2: Install the plugin
/plugin install cubic@cubic
```

> **Requires** [Claude Code](https://code.claude.com) v1.0.33+

### Team Auto-Install

To make cubic automatically available for all team members in a repository, add this to your project's `.claude/settings.json`:

```json
{
  "extraKnownMarketplaces": {
    "cubic": {
      "source": {
        "source": "github",
        "repo": "mrge-io/skills"
      }
    }
  },
  "enabledPlugins": {
    "cubic@cubic": true
  }
}
```

When team members open the project in Claude Code and trust the repository, they'll be prompted to install the plugin.

## Setup

During an interactive full install, the installer prompts for your API key. It opens your browser to the [cubic dashboard](https://www.cubic.dev/settings?tab=integrations&integration=mcp) where you can generate a key, then you paste it in the terminal. The key is saved directly into the MCP configuration.

You can also set `CUBIC_API_KEY` in your environment and the installer will detect it automatically.

### Non-interactive JSON mode (for wrappers/installers)

When using JSON mode (`--json`) from another CLI wrapper, installation is intentionally non-interactive. Set `CUBIC_API_KEY` first:

```bash
CUBIC_API_KEY="cbk_..." npx -y @cubic-plugin/cubic-plugin install --json --to cursor
```

Every stdout line is one event with `type`, schema `version: 1`, an ISO-8601 `ts`, and a `runId` shared by the run. A successful skills-only run emits:

1. `install_started`
2. `target_started` and `target_result` for each target
3. `install_summary`
4. `install_completed`

A full install first emits `auth_required` and either `auth_success` or authentication guidance. If `CUBIC_API_KEY` is missing, JSON mode ends with `install_failed` and `code: "AUTH_REQUIRED"`.

| Failure code | Meaning | Retryable |
| --- | --- | --- |
| `UNKNOWN_METHOD` | `--method` is not `paste` or `symlink`. | No |
| `UNKNOWN_TARGET` | `--to` does not name a supported target. | No |
| `AUTH_FAILED` | API-key setup raised an error. | Yes |
| `AUTH_REQUIRED` | JSON mode needs `CUBIC_API_KEY` for a full install. | Yes |
| `PLUGIN_RESOLVE_FAILED` | The package source could not be found or cloned. | Yes |
| `SYMLINK_NO_LOCAL_SOURCE` | Symlink mode only has a temporary cloned source. | No |
| `TARGET_WRITE_FAILED` | At least one target could not be written. | Yes |

> **Tip:** In Claude Code, you can also just say "set up my cubic key" and paste your key — the installer will detect your OS and shell and save it automatically.

### Troubleshooting

- **`No TTY detected`**: export `CUBIC_API_KEY=cbk_...` before a full install, or use `--skills-only`. JSON mode never prompts.
- **Install succeeded but files are missing**: check the target's destination above. With `--output /tmp/out`, files go under `/tmp/out/<target>/`.
- **`SYMLINK_NO_LOCAL_SOURCE`**: rerun with `--method paste`, or run the built CLI from a local checkout that contains `.mcp.json`.
- **`PLUGIN_RESOLVE_FAILED`**: make sure `git` is installed and the GitHub source is reachable.
- **Interrupted local install changed `.mcp.json`**: the installer normally restores this template in a `finally` block. In a checkout, restore the file before retrying.

## Commands

| Command                          | Description                                                            |
| -------------------------------- | ---------------------------------------------------------------------- |
| `/cubic:comments [pr-number]`    | Show cubic's review comments on the current PR (auto-detects branch)   |
| `/cubic:run-review [flags]`      | Run a local cubic AI code review on uncommitted changes or branch diff |
| `/cubic:wiki [page-name]`        | Browse AI-generated codebase documentation                             |
| `/cubic:scan [scan-id]`          | View codebase security scan results and issues                    |
| `/cubic:learnings [learning-id]` | Show team code review patterns and preferences                         |

## Skills (Auto-triggered)

These activate automatically based on what you're doing:

| Skill                  | Triggers when                                  | What it does                                                       |
| ---------------------- | ---------------------------------------------- | ------------------------------------------------------------------ |
| **check-pr-comments**    | Working on a PR branch, fixing review comments | Fetches cubic PR comments from GitHub, investigates each, and reports which are worth fixing |
| **run-review**         | "Review my code", pre-commit/PR quality checks | Runs a local cubic AI code review via CLI and surfaces issues      |
| **cubic-loop**         | "Loop until clean", polishing before merge     | Iteratively reviews, fixes, and re-reviews until clean             |
| **codebase-context**   | Asking about architecture or how things work   | Queries the cubic AI Wiki for architectural context                |
| **review-patterns**    | Writing or reviewing code                      | Pulls team learnings to apply coding conventions                   |

## MCP Tools

The plugin connects to cubic's MCP server, giving Claude access to 9 tools:

**Wiki**: `list_wikis`, `list_wiki_pages`, `get_wiki_page`
**Codebase Scans**: `list_scans`, `get_scan`, `get_issue`
**Review Learnings**: `list_learnings`, `get_learning`
**PR Reviews**: `get_pr_issues`

## Plugin Structure

```
skills/
├── .claude-plugin/
│   ├── marketplace.json   # Marketplace catalog for distribution
│   └── plugin.json        # Plugin metadata
├── .mcp.json              # cubic MCP server configuration
├── commands/
│   ├── comments.md        # /cubic:comments command
│   ├── run-review.md      # /cubic:run-review command (CLI)
│   ├── wiki.md            # /cubic:wiki command
│   ├── scan.md            # /cubic:scan command
│   └── learnings.md       # /cubic:learnings command
├── skills/
│   ├── check-pr-comments/ # Fetches, investigates, and triages PR review comments
│   │   └── SKILL.md
│   ├── run-review/        # Runs local AI code review via cubic CLI
│   │   └── SKILL.md
│   ├── cubic-loop/        # Iteratively reviews, fixes, and re-reviews until clean
│   │   └── SKILL.md
│   ├── codebase-context/  # Auto-queries wiki for architecture context
│   │   └── SKILL.md
│   └── review-patterns/   # Auto-applies team review learnings
│       └── SKILL.md
└── README.md
```

## License

MIT
