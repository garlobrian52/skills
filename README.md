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
# Detected home-directory tools (default when --to all and no --output)
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

# Universal (.agents/skills) — opt-in; never auto-detected
npx @cubic-plugin/cubic-plugin install --to universal
```

### Default install behavior

- With `--to all` and no `--output`, the installer only installs into agents it detects via home-directory markers (for example `~/.cursor`, `~/.codex`, `~/.claude`). Undetected agents are skipped (`target_skipped` / `not_detected` in JSON mode).
- If nothing is detected, the command exits successfully and tells you to pass `--to <target>` or `--to universal`.
- Pass `--to <target>` to install a specific agent even when it is not detected.
- Pass `--output <dir>` to write under `<dir>/<target>/` and skip auto-detection (useful for sandboxing all targets).
- Default roots are each tool's home config location (not the current working directory).
- If a target is already installed at the matching plugin version/method/layout, the installer skips it. `--force` reinstalls selected/detected targets; it does not change which targets are selected by auto-detection.
- Full installs write OAuth-ready MCP configuration and never ask for a cubic API key. Authenticate later through your editor's MCP login flow.
- `--skills-only` installs the full skills and commands/prompts bundle and skips MCP entirely.

### Migrating from API-key MCP configs

Older installs may still have cubic MCP entries with `Authorization` headers, `CUBIC_API_KEY`, or Codex `http_headers`. Those configs are treated as incomplete, so a normal reinstall rewrites them to OAuth-ready entries (no headers). Recommended:

```bash
npx @cubic-plugin/cubic-plugin install --to all --force
```

Do not add API keys to MCP config by hand. Existing `cbk_*` values may appear in legacy files during migration — never commit or log them.

### Install options

| Option | Default | Description |
| --- | --- | --- |
| `--to <target>` | `all` | `claude`, `opencode`, `codex`, `cursor`, `droid`, `pi`, `gemini`, `universal`, or `all` |
| `-o, --output <dir>` | per-target home root | Write under `<dir>/<target>/` and disable auto-detection |
| `--skills-only` | `false` | Install skills + commands/prompts only (no MCP config) |
| `--json` | `false` | Emit NDJSON progress events on stdout (non-interactive) |
| `--method paste\|symlink` | `paste` | Copy files, or symlink when the source is stable |
| `--force` | `false` | Reinstall even when the target already matches the current install |

`symlink` from ephemeral `npx`/temp sources materializes a stable copy under `~/.cubic-plugin/plugin-source` so links keep working after the temp directory is removed. Transformed commands (stripped frontmatter / Gemini TOML) are always copied.

### Default install locations and MCP shapes

| Target | Default root | MCP config | OAuth-ready entry |
| --- | --- | --- | --- |
| Claude Code | `~` | `.mcp.json` | `mcpServers.cubic`: `{ type: "http", url }` |
| Cursor | `~/.cursor` | `mcp.json` | `mcpServers.cubic`: `{ type: "http", url }` |
| OpenCode | `~/.config/opencode` | `opencode.json` | `mcp.cubic`: `{ type: "remote", url, enabled: true }` |
| Codex | `~/.codex` | `config.toml` | `[mcp_servers.cubic]` with `url` only (no `http_headers`) |
| Factory Droid | `~/.factory` | `mcp.json` | `mcpServers.cubic`: `{ type: "http", url, disabled: false }` |
| Pi | `~` | `.config/mcp/mcp.json` | `mcpServers.cubic`: `{ auth: "oauth", url }` |
| Gemini CLI | `~/.gemini` | `settings.json` | `mcpServers.cubic`: `{ httpUrl }` |
| Universal | `~` | _(none)_ | Skills/commands only under `.agents/` |

All MCP URLs point at `https://www.cubic.dev/api/mcp`. Each successful install also writes `.cubic-manifest.<target>.json` at the destination root (legacy `.cubic-manifest.json` is still read for skip/reinstall detection).

To uninstall skills/commands and remove the cubic MCP entry for a target:

```bash
npx @cubic-plugin/cubic-plugin uninstall --to opencode
```

`uninstall` does not delete manifests. For a full home cleanup that also removes manifests (developers working from this repo):

```bash
npm run clean:home:dry-run -- --to cursor
npm run clean:home -- --to cursor
# or all targets:
npm run clean:home
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
npx -y @cubic-plugin/cubic-plugin install --json --to claude --output /tmp/cubic-plugin-out
```

No API key is required for JSON mode; users authenticate later through their MCP client. Each event includes `type`, `version` (`1`), `ts`, and `runId`, plus event-specific fields:

| `type` | Meaning |
| --- | --- |
| `install_started` | Install began (`mode`: `full` \| `skills-only`, `method`, `target`, `pluginVersion`) |
| `target_started` | A target install began |
| `target_skipped` | Target skipped (`reason`: currently `not_detected`) |
| `target_result` | Per-target counts and `status` (`ok` \| `failed`) |
| `install_summary` | Aggregated totals across targets |
| `install_completed` | Successful completion (`ok: true`) |
| `install_failed` | Fatal failure (`code`, `message`, `retryable`) |

There is no `auth_required` (or other API-key setup) event after the OAuth switch. Common `install_failed` codes include `UNKNOWN_TARGET`, `UNKNOWN_METHOD`, and `PLUGIN_RESOLVE_FAILED`.

### Troubleshooting

| Symptom | What to try |
| --- | --- |
| `No supported AI coding tools detected` | Install/open the editor once so its home marker exists, or pass `--to <target>` / `--to universal` |
| MCP tools return auth errors | Complete the editor MCP login flow listed above; reconnect if a prior API-key config was migrated |
| Install keeps rewriting MCP config | Legacy header/`http_headers` entries are intentionally migrated to OAuth on reinstall |
| Symlinks break after `npx` | Re-run with `--method symlink`; ephemeral sources are copied to `~/.cubic-plugin/plugin-source` |
| Want a clean local retest | `npm run clean:home:dry-run`, then `npm run clean:home`, then install again with `--output` or `--force` |

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

## License

MIT
