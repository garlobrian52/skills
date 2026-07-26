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

The CLI includes Stripe helpers under `src/stripe/` for Accounts v2 onboarding, destination charges (platform PaymentIntent with transfer to a connected account), Checkout sessions, and platform subscriptions billed from the connected account balance:

```bash
cp .env.example .env
# Set STRIPE_SECRET_KEY and STRIPE_PUBLISHABLE_KEY from https://dashboard.stripe.com/apikeys

npm run build

# Destination charge blueprint (platform PaymentIntent → connected account)
node dist/index.js stripe create-account --seller acme
node dist/index.js stripe create-account-link --seller acme
node dist/index.js stripe create-destination-charge --seller acme \
  --payment-method pm_card_visa

# Checkout / subscription sequence
node dist/index.js stripe create-product --seller acme
node dist/index.js stripe create-checkout-session --seller acme
node dist/index.js stripe create-subscription-plan --seller acme
node dist/index.js stripe attach-balance-payment-method --seller acme
node dist/index.js stripe create-subscription --seller acme
node dist/index.js stripe handle-webhooks --port 4242

# Workbench-style debugging (Inspector / API Explorer / Shell)
node dist/index.js stripe inspect cus_123 --seller acme
node dist/index.js stripe update cus_123 --params '{"description":"Updated from CLI"}'
node dist/index.js stripe run-request GET /v1/customers/cus_123 --seller acme
```

Stripe resource ids are stored in `.cubic-stripe.json` (override with `CUBIC_STRIPE_STORE` or `--store`).

### Destination charge blueprint

Implements Stripe’s “Create a destination charge” flow: a **confirmed** `PaymentIntent` on the **platform** account that transfers funds to a connected account and keeps an application fee.

1. **`stripe create-account --seller <id>`** — creates the connected account and stores `accountId` (used as the default transfer destination).
2. **`stripe create-destination-charge --seller <id>`** — calls `POST /v1/payment_intents` with:
   - `confirm: true` and `payment_method_types: ["card"]`
   - `transfer_data.destination` → seller’s `accountId`, or `STRIPE_TRANSFER_DESTINATION` / `--destination`
   - `application_fee_amount` → `STRIPE_APPLICATION_FEE` / `--application-fee` (default `123`)
   - `amount` → `STRIPE_CHARGE_AMOUNT` / `--amount` (default `10000`)
   - `currency` → `CURRENCY` / `--currency` (default `usd`)
   - `description` → `(created by Testing Blueprints)`
   - `return_url` → `STRIPE_PAYMENT_RETURN_URL` / `--return-url` (default `https://example.com/return`)
   - optional `payment_method` → `STRIPE_TEST_PAYMENT_METHOD` / `--payment-method`

Persists `paymentIntentId` on the seller record. JSON output includes `paymentIntentId`, `status`, and the resolved `destination`.

This is not the same as Checkout `--direct-charge` (session created on the connected account). Destination charges keep the PaymentIntent on the platform and use `transfer_data.destination`.

### Store fields to know

| Field | Set by | Used for |
| --- | --- | --- |
| `accountId` | `create-account` | Default `transfer_data.destination` for destination charges |
| `paymentIntentId` | `create-destination-charge` | Last destination-charge PaymentIntent (`pi_...`) |
| `checkoutProductId` / `checkoutPriceId` | `create-product` | Platform one-time Checkout line item |
| `checkoutSessionId` / `checkoutSessionUrl` / `checkoutCompleted` | checkout + webhooks | Checkout session lifecycle |

### Common pitfalls

- Run `create-account` before `create-destination-charge`; the CLI errors if the seller is missing or has no destination (and no `--destination` / `STRIPE_TRANSFER_DESTINATION` override).
- Confirming in test mode usually needs a payment method: pass `--payment-method pm_card_visa` or set `STRIPE_TEST_PAYMENT_METHOD`. Without it, Stripe may reject confirmation.
- Amounts and fees are in the smallest currency unit (for example `10000` = $100.00 USD, fee `123` = $1.23).
- Destination charge ≠ direct-charge Checkout. Use `create-destination-charge` for platform PaymentIntents with transfers; use `create-checkout-session --direct-charge` for Checkout on the connected account.
- Build first (`npm run build`) so `node dist/index.js stripe …` includes `create-destination-charge`.

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
