# AGENTS.md

## Cursor Cloud specific instructions

This repo is the `@cubic-plugin/cubic-plugin` package: a Node.js/TypeScript CLI (built with `citty`) that installs the cubic AI code-review plugin (skills, slash commands, and MCP config) into AI coding tools (Claude Code, Cursor, OpenCode, Codex, Gemini, Droid, Pi, universal). It is a client-side CLI — there is **no server, database, or long-running service** required for the installer itself. External services it talks to (cubic MCP at `https://www.cubic.dev/api/mcp`, PostHog telemetry) are hosted; telemetry is enabled by default via a baked-in PostHog project API key in `src/posthog.ts` (`POSTHOG_API_KEY` overrides it; set to empty to disable).

Standard commands live in `package.json` scripts: `npm run build` (`tsc`, emits to gitignored `dist/`) and `npm test` (builds, then runs `node --test test/*.test.mjs`). There is no linter configured.

### Stripe Accounts v2 (embedded payments + platform subscriptions)

Optional `stripe` CLI subcommands under `src/stripe/` implement Connect Accounts v2 flows (create account / account link, direct-charge Checkout with application fee, platform subscription via `stripe_balance`). Resource IDs are persisted in `.cubic-stripe-store.json` (override with `STRIPE_STORE_PATH`).

- Copy `.env.example` → `.env` and set `STRIPE_SECRET_KEY` / `STRIPE_PUBLISHABLE_KEY` from the [Stripe Dashboard](https://dashboard.stripe.com/apikeys). Do not hardcode keys.
- Leave the Stripe SDK API version unset (client is constructed without an `apiVersion` argument).
- Local API + webhooks: `node dist/index.js stripe serve` (default `:4242`). Webhook endpoint: `POST /webhooks/stripe`.
- Example: `node dist/index.js stripe create-account` then `create-account-link`, `create-checkout-session`, `create-subscription-product`, `attach-balance-payment-method`, `create-subscription`.

Non-obvious notes:
- The compiled entrypoint is `dist/index.js`, so you must `npm run build` before running the CLI directly (`node dist/index.js install --help`). `npm test` builds first automatically.
- To exercise the installer without touching real editor config, pass `--output <dir>` (writes per-target under that dir) — e.g. `node dist/index.js install --to cursor --output /tmp/out`.
- Full (non-`--skills-only`) installs need a `CUBIC_API_KEY` (`cbk_*`). Interactive TTY prompting won't work in the cloud VM ("No TTY detected"); use `--json` mode which reads `CUBIC_API_KEY` from the env non-interactively (any `cbk_...` string works for a local dry run — the key is only inlined into the generated MCP config, not validated).
- During a full install the CLI temporarily rewrites the repo's `.mcp.json` to inline the key and restores it in a `finally` block; if a run is killed mid-install, check `git status` and restore `.mcp.json`.
- `node scripts/validate-template.mjs` validates the plugin template/marketplace files (the "no hooks/hooks.json" line is an expected warning, not a failure).
- Tests set `POSTHOG_API_KEY=` so the suite does not send telemetry. The CLI uses `posthog-js` (lazy init in `src/posthog.ts`); telemetry is on by default with a baked-in project key — set `POSTHOG_API_KEY=""` to disable locally.
