# cubic Plugin for Claude Code

Access cubic's AI code review insights directly from Claude Code. Get PR review issues, browse AI-generated wikis, check codebase scans, and apply team review learnings — all without leaving your editor.

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

# Skills and companion commands only (no API key or MCP configuration)
npx @cubic-plugin/cubic-plugin install --skills-only
```

The installer will prompt you for your API key during setup.
`--skills-only` installs all bundled skills and commands without prompting for
an API key or changing MCP configuration.

To uninstall, use the same `--to` flag:

```bash
npx @cubic-plugin/cubic-plugin uninstall --to opencode
```

## Prerequisites

- [Claude Code](https://code.claude.com) v1.0.33+
- A [cubic](https://www.cubic.dev) account with an active installation
- A cubic API key (`cbk_*`)
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

The installer will prompt you for your API key during `npx @cubic-plugin/cubic-plugin install`. It opens your browser to the [cubic dashboard](https://www.cubic.dev/settings?tab=integrations&integration=mcp) where you can generate a key, then you paste it in the terminal. The key is saved directly into the MCP configuration.

You can also set `CUBIC_API_KEY` in your environment and the installer will detect it automatically.

### Non-interactive JSON mode (for wrappers/installers)

When using JSON mode (`--json`) from another CLI wrapper, installation is intentionally non-interactive. Set `CUBIC_API_KEY` first:

```bash
CUBIC_API_KEY="cbk_..." npx -y @cubic-plugin/cubic-plugin install --json --method symlink
```

If `CUBIC_API_KEY` is missing, JSON mode returns a structured `install_failed` event with `code: "AUTH_REQUIRED"`.

> **Tip:** In Claude Code, you can also just say "set up my cubic key" and paste your key — the installer will detect your OS and shell and save it automatically.

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
