# AGENTS.md

## Cursor Cloud specific instructions

This repo is the `@cubic-plugin/cubic-plugin` package: a Node.js/TypeScript CLI (built with `citty`) that installs the cubic AI code-review plugin (skills, slash commands, and MCP config) into AI coding tools (Claude Code, Cursor, OpenCode, Codex, Gemini, Droid, Pi, universal). It is a client-side CLI — there is **no server, database, or long-running service** to start. External services it talks to (cubic MCP at `https://www.cubic.dev/api/mcp`, PostHog telemetry) are hosted; PostHog telemetry is enabled by default and no-ops when disabled via `POSTHOG_API_KEY=` (empty string).

Standard commands live in `package.json` scripts: `npm run build` (`tsc`, emits to gitignored `dist/`) and `npm test` (builds, then runs `node --test test/*.test.mjs`). There is no linter configured.

Non-obvious notes:
- The compiled entrypoint is `dist/index.js`, so you must `npm run build` before running the CLI directly (`node dist/index.js install --help`). `npm test` builds first automatically.
- To exercise the installer without touching real editor config, pass `--output <dir>` (writes per-target under that dir) — e.g. `node dist/index.js install --to cursor --output /tmp/out`.
- Full (non-`--skills-only`) installs need a `CUBIC_API_KEY` (`cbk_*`). Interactive TTY prompting won't work in the cloud VM ("No TTY detected"); use `--json` mode which reads `CUBIC_API_KEY` from the env non-interactively (any `cbk_...` string works for a local dry run — the key is only inlined into the generated MCP config, not validated).
- During a full install the CLI temporarily rewrites the repo's `.mcp.json` to inline the key and restores it in a `finally` block; if a run is killed mid-install, check `git status` and restore `.mcp.json`.
- `node scripts/validate-template.mjs` validates the plugin template/marketplace files (the "no hooks/hooks.json" line is an expected warning, not a failure).
- `posthog-node` prints an `EBADENGINE` warning on the VM's default Node (v22.14.0); it is harmless and install/build/test all succeed.
