# cubic Plugin for AI Coding Tools

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
```

By default, installs go to the user's home directory under `~` using each tool's standard config location.
If a target is already installed, the installer skips it; use `--force` to reinstall.

The installer writes OAuth-ready MCP configuration. It does not ask for a cubic API key.
After installing, use your coding tool's MCP login flow to authenticate cubic.

To uninstall, use the same `--to` flag:

```bash
npx @cubic-plugin/cubic-plugin uninstall --to opencode
```

## Prerequisites

- [Claude Code](https://code.claude.com) v1.0.33+
- A [cubic](https://www.cubic.dev) account with an active installation
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

The installer writes cubic's MCP server URL into each supported tool:

```text
https://www.cubic.dev/api/mcp
```

Use OAuth to authenticate from the tool after install:

- Claude Code: run `/mcp`, choose cubic, and complete the browser flow.
- Cursor: open **Settings** → **Tools and MCP**, then click **Connect** for cubic.
- Cursor Agent: run `cursor-agent mcp login cubic`.
- Codex: run `codex mcp login cubic`.
- Gemini CLI: run `/mcp auth cubic`.
- OpenCode: run `opencode mcp auth cubic`.
- Droid: open `/mcp`, choose cubic, and complete the browser flow.
- Pi: run `/mcp-auth cubic`.

### Non-interactive JSON mode (for wrappers/installers)

When using JSON mode (`--json`) from another CLI wrapper, installation is non-interactive and emits NDJSON progress events:

```bash
npx -y @cubic-plugin/cubic-plugin install --json --method symlink
```

No API key is required for JSON mode; users authenticate later through their MCP client.

## Usage telemetry

The CLI sends operational telemetry to PostHog to help maintain the installer. It generates a new random identifier for each CLI process and keeps PostHog state in memory, so it does not persist a user or account identity.

Events cover install start, install completion or failure, and uninstall. Properties include the selected target, install mode and method, plugin version, result counts, and failure reasons. A failure reason can contain details from an underlying filesystem error, such as a path. The CLI does not add your cubic API key, installed file contents, or source code to these events.

Telemetry uses a bundled public PostHog project key and the US PostHog endpoint by default. Disable it for a command by setting `POSTHOG_API_KEY` to an empty value:

```bash
POSTHOG_API_KEY= npx @cubic-plugin/cubic-plugin install
```

Set the empty value in your environment to opt out persistently. Developers can instead set `POSTHOG_API_KEY` to another project key and optionally set `POSTHOG_HOST` to another endpoint. `npm test` disables telemetry automatically.

> **Note:** `POSTHOG_API_KEY` is an analytics ingestion key. It is separate from cubic MCP OAuth authentication in your editor.

## Commands

| Command                          | Description                                                            |
| -------------------------------- | ---------------------------------------------------------------------- |
| `/cubic:comments [pr-number]`    | Show cubic's review comments on the current PR (auto-detects branch)   |
| `/cubic:run-review [flags]`      | Run a local cubic AI code review on uncommitted changes or branch diff |
| `/cubic:wiki [page-name]`        | Browse AI-generated codebase documentation                             |
| `/cubic:scan [issue-id]`         | View repository scan results or one issue's full details               |
| `/cubic:learnings [learning-id]` | Show team code review patterns and preferences                         |

## Skills (Auto-triggered)

These activate automatically based on what you're doing:

| Skill                  | Triggers when                                  | What it does                                                       |
| ---------------------- | ---------------------------------------------- | ------------------------------------------------------------------ |
| **check-pr-comments**    | "Check all PR comments", PR comments/issues, fixing review feedback | Fetches unresolved cubic PR comments, fixes worthwhile issues, commits/pushes, and resolves handled threads |
| **run-review**         | "Review my code", pre-commit/PR quality checks | Runs a local cubic AI code review via CLI and surfaces issues      |
| **cubic-loop**         | "Loop until clean", polishing before merge     | Iteratively reviews, fixes, and re-reviews until clean             |
| **handle-codebase-scan** | Codebase scan requests, CSV exports, or issue UUIDs | Retrieves full findings through MCP, verifies them, and fixes requested issues |
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
│   ├── handle-codebase-scan/ # Investigates and fixes codebase scan findings
│   │   └── SKILL.md
│   ├── codebase-context/  # Auto-queries wiki for architecture context
│   │   └── SKILL.md
│   └── review-patterns/   # Auto-applies team review learnings
│       └── SKILL.md
└── README.md
```

## Stripe Accounts v2 (platform payments)

The CLI also includes Stripe Accounts v2 helpers for onboarding connected sellers, accepting direct charges with an application fee, and charging platform subscriptions from the connected account balance:

```bash
cp .env.example .env
# Set STRIPE_SECRET_KEY and STRIPE_PUBLISHABLE_KEY from https://dashboard.stripe.com/apikeys

node dist/index.js stripe create-account --seller acme
node dist/index.js stripe create-account-link --seller acme
node dist/index.js stripe create-checkout-session --seller acme
node dist/index.js stripe create-subscription-plan --seller acme
node dist/index.js stripe attach-balance-payment-method --seller acme
node dist/index.js stripe create-subscription --seller acme
node dist/index.js stripe handle-webhooks --port 4242

# Embedded PaymentElement flow (client-side confirmation)
node dist/index.js stripe create-payment-intent --amount 5000            # platform charge
node dist/index.js stripe create-payment-intent --seller acme --application-fee 200  # direct charge
node dist/index.js stripe serve-payment --port 4242 --seller acme        # PaymentElement page + webhook

# Workbench-style debugging (Inspector / API Explorer / Shell)
node dist/index.js stripe inspect cus_123 --seller acme
node dist/index.js stripe update cus_123 --params '{"description":"Updated from CLI"}'
node dist/index.js stripe run-request GET /v1/customers/cus_123 --seller acme
```

Stripe resource ids are stored in `.cubic-stripe.json` (override with `CUBIC_STRIPE_STORE`).

### Workbench-style debugging

Inspired by [Stripe Workbench Inspector](https://docs.stripe.com/workbench/overview#use-the-inspector-to-learn-about-api-objects), the CLI can inspect API objects, list related events, and update objects from the terminal:

| Command | Workbench equivalent |
| --- | --- |
| `stripe inspect <id>` | Inspector — JSON view, data map, related events, dashboard links |
| `stripe update <id> --params '{...}'` | API Explorer — POST updates (test mode only, like Shell) |
| `stripe run-request <METHOD> <path>` | Shell — arbitrary GET/POST/DELETE requests |

Pass `--seller <id>` to set the `Stripe-Account` header from your local store when inspecting connected-account objects.

## Presentations

Board decks live under `presentations/` and are **not** part of the npm package (`package.json` `files` lists `dist/`, `skills/`, `commands/`, and `.mcp.json` only).

| Deck | Path |
|------|------|
| Apple FY2025 Environmental Progress | [`presentations/apple-fy2025-environmental/`](presentations/apple-fy2025-environmental/README.md) |

The Apple deck is a single self-contained HTML file (`index.html` with inline CSS and JS). There is no CLI command, no Node build, and no PowerPoint exporter on this branch. See that directory’s README for controls, chart-entry animations, and pitfalls.

## License

MIT

