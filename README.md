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
```

The installer will prompt you for your API key during setup.

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

## Usage telemetry

The CLI sends operational telemetry to PostHog to help maintain the installer. It generates a new random identifier for each CLI process and keeps PostHog state in memory, so it does not persist a user or account identity.

Events cover install start, authentication success, install completion or failure, and uninstall. Properties include the selected target, install mode and method, plugin version, result counts, and failure reasons. A failure reason can contain details from an underlying filesystem error, such as a path. The CLI does not add your cubic API key, installed file contents, or source code to these events.

Telemetry uses a bundled public PostHog project key and the US PostHog endpoint by default. Disable it for a command by setting `POSTHOG_API_KEY` to an empty value:

```bash
POSTHOG_API_KEY= npx @cubic-plugin/cubic-plugin install
```

Set the empty value in your environment to opt out persistently. Developers can instead set `POSTHOG_API_KEY` to another project key and optionally set `POSTHOG_HOST` to another endpoint. `npm test` disables telemetry automatically.

> **Note:** `POSTHOG_API_KEY` is an analytics ingestion key. It is separate from the secret `CUBIC_API_KEY` (`cbk_*`) used to authenticate the cubic MCP connection.

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
```

Stripe resource ids are stored in `.cubic-stripe.json` (override with `CUBIC_STRIPE_STORE`). Use `stripe show-status [--seller <id>]` to print them when debugging seller wiring.

### Workbench Inspector + API Explorer

Peek under the hood of any Stripe API object (data map, related events, and request summaries), then edit it with Shell-style requests — the same workflow as [Dashboard Workbench](https://docs.stripe.com/workbench). Implementation lives in `src/stripe/inspect.ts`, `src/stripe/object-paths.ts`, and `src/stripe/request.ts`, wired through `src/stripe-cmd.ts`.

| Command | Workbench equivalent | Intent |
| --- | --- | --- |
| `stripe inspect-object --id <obj>` | Inspector | Retrieve JSON, related-object data map, related events, request-id summaries, and Dashboard deep links |
| `stripe api-request --method … --path …` | Shell / API Explorer | `GET` / `POST` / `DELETE` against a path or object id (prefer test mode for writes) |

```bash
# Inspector: object JSON + related ids / events / request summaries
node dist/index.js stripe inspect-object --id pi_...
node dist/index.js stripe inspect-object --id cus_... --related --events-limit 5
node dist/index.js stripe inspect-object --id acct_... --path /v2/core/accounts/acct_...

# Connected-account objects (Stripe-Account header)
node dist/index.js stripe inspect-object --id cus_... --stripe-account acct_...

# API Explorer / Shell: GET, POST, or DELETE
node dist/index.js stripe api-request --method GET --path pi_...
node dist/index.js stripe api-request --method POST --path /v1/customers/cus_... \
  --param "metadata[note]=from-cli"
node dist/index.js stripe api-request --method POST --path /v1/customers/cus_... \
  --json-body '{"description":"Updated from CLI"}'
```

#### Inspect flags

| Flag | Purpose |
| --- | --- |
| `--id` | Stripe object id (required) |
| `--path` | Absolute API path override when prefix resolution is wrong or unsupported |
| `--stripe-account` | Connected account id for the `Stripe-Account` header |
| `--events-limit` | Max related events (default `20`, clamped to 1–100) |
| `--related` | Also `GET` each related id one level deep (at most 10; failures are skipped) |

#### Inspect output

`inspect-object` prints JSON with:

- `data` — retrieved Stripe payload
- `dataMap` — `{ path, id, type }` entries for nested Stripe ids (root id excluded)
- `events` — related events via `/v1/events?related_object=…`, with a recent-events scan fallback if that query fails
- `logs` — request-id summaries derived from event `request` metadata (Dashboard Workbench Logs are not fully available via the public API)
- `related` — optional map of retrieved related objects when `--related` is set
- `workbench.inspector` / `shell` / `logs` / `events` — Dashboard Workbench deep links
- `apiPath` / `objectType` — resolved path and type label

Successful `api-request` responses that return an `id` include `inspectHint` with a follow-up `inspect-object` command.

#### Object id → path resolution

Both commands resolve bare object ids to REST paths (longest prefix wins). Unknown prefixes fail with a hint to pass an explicit `--path`.

| Prefix | Type | Path |
| --- | --- | --- |
| `acct_` | account | `/v2/core/accounts/{id}` |
| `cus_` | customer | `/v1/customers/{id}` |
| `pi_` | payment_intent | `/v1/payment_intents/{id}` |
| `ch_` / `py_` | charge | `/v1/charges/{id}` |
| `cs_test_` / `cs_live_` / `cs_` | checkout_session | `/v1/checkout/sessions/{id}` |
| `sub_` | subscription | `/v1/subscriptions/{id}` |
| `si_` | subscription_item | `/v1/subscription_items/{id}` |
| `in_` | invoice | `/v1/invoices/{id}` |
| `il_` | invoice_item | `/v1/invoiceitems/{id}` |
| `price_` / `prod_` | price / product | `/v1/prices/{id}` / `/v1/products/{id}` |
| `pm_` | payment_method | `/v1/payment_methods/{id}` |
| `seti_` | setup_intent | `/v1/setup_intents/{id}` |
| `evt_` | event | `/v1/events/{id}` |
| `re_` / `dp_` / `po_` / `tr_` | refund / dispute / payout / transfer | matching `/v1/…` collections |
| `txn_` / `qr_` / `src_` / `tok_` / `file_` / `link_` / `card_` | balance_transaction / quote / source / token / file / file_link / issuing card | matching `/v1/…` collections |

#### `api-request` params

- `--method` — `GET` (default), `POST`, or `DELETE` (case-insensitive)
- `--path` — absolute path (`/v1/…`, `v1/…`) or bare object id
- `--param key=value` — repeatable form fields; values coerce `true` / `false` / `null` / numbers; nested structures are **not** built from dotted keys — use `--json-body` instead
- `--json-body '{…}'` — JSON object merged into params (must be an object, not an array)
- `--stripe-account` — connected-account header

`POST` sends params as the request body. `GET` / `DELETE` append params as a query string (`rawRequest` only accepts a body on `POST`).

#### Common pitfalls

- Build first (`npm run build`) so `node dist/index.js stripe …` picks up these commands.
- Prefer a **test** secret key for writes; this CLI does not block live-mode `POST` / `DELETE`.
- Connected-account objects need `--stripe-account`; platform-scoped inspect against a connected object will 404 or return the wrong resource. There is no `--seller` lookup on these two commands — resolve the account id via `show-status` first.
- Unrecognized id prefixes need `--path` (inspect) or an absolute `--path` (api-request).
- `logs` are event-derived request summaries, not full Workbench request payloads.
- `--related` silently skips related ids that cannot be retrieved with the current key / account.

## License

MIT
