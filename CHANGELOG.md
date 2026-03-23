# Changelog

All notable changes to MCP Cost Tracker & Router will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - 2026-03-23

### Added

- `gemini-2.0-flash` added to the built-in pricing table (`input: $0.0001`, `output: $0.0004` per 1K tokens).

### Changed

- Token counting migrated from `tiktoken-lite` to `js-tiktoken` (`cl100k_base` encoding) for offline, dependency-free token estimates. Falls back to `char/4` approximation on encoding failure.
- `@modelcontextprotocol/sdk` upgraded from `^1.0.0` to `^1.12.0`.
- `@types/node` upgraded from `^20.x` to `^24.12.0` (Node 24 LTS).
- `eslint` upgraded from `^9.x` to `^10.0.3`; `eslint-config-prettier` from `^9.x` to `^10.1.8`.
- `yargs` upgraded from `^17.x` to `^18.0.0`.
- `@types/express` moved from `dependencies` to `devDependencies` — it is a type-only package with no runtime value.
- Added `author`, `license`, `repository`, `homepage`, and `engines` (`>=20.19.0`) fields to `package.json`.
- Added `prepublishOnly: npm run build` to ensure a fresh build before every `npm publish`.
- Added `.env.example` documenting `MCP_API_KEY`, `MCP_JWT_SECRET`, and `MCP_SLACK_WEBHOOK`.
- Notifications in `src/server.ts` wrapped in `tryNotify` helper to swallow unsupported-transport errors gracefully.

### Fixed

- Removed unused `base64urlDecode` function from `src/auth.ts`.
- Converted `require()` import in `tests/alerting.test.ts` to ESM `import` to comply with `no-require-imports` lint rule.
- Replaced untyped `Function` type with explicit call signatures in `tests/server-full.test.ts`.

### Security

- Resolved **GHSA-67mh-4wv8-2f99** (`esbuild` ≤ 0.24.2 dev-server cross-origin exposure) by upgrading `vitest` and `@vitest/coverage-v8` to `^4.1.0`. Affects local development only; not a production runtime concern.

## [0.2.0] - 2026-03-12

### Added

- **Alerting** (`src/alerting.ts`): configurable budget alerts delivered to Slack webhooks.
- **Audit log** (`src/audit-log.ts`): append-only JSONL audit trail of every cost-tracking tool call.
- **JWT / API-key auth middleware** (`src/auth.ts`): HTTP transport protected via `MCP_API_KEY` or `MCP_JWT_SECRET`. stdio is unaffected.
- **Per-client rate limiter** (`src/rate-limiter.ts`): sliding-window request throttle on the HTTP transport.
- **Chargeback allocation** (`src/chargeback.ts`): distribute session cost across configured projects by token share.
- **Project allocator** (`src/project-allocator.ts`): multi-project cost reporting and allocation tracking.
- **Routing enforcer** (`src/routing-enforcer.ts`): YAML-based routing rules to block, warn on, or allow model selections.
- **New tools**: `allocate_session_cost`, `get_project_report`, `enforce_routing`.
- **`npm run inspect` script**: launches MCP Inspector for interactive pre-publish verification.
- MCP Inspector verification instructions added to README.
- `js-yaml` moved to `dependencies` (used at runtime by the routing enforcer).
- Tests for alerting, audit log, auth, chargeback, project allocator, rate limiter, and routing enforcer.

## [0.1.0] - 2026-03-12

### Added

- Initial public release of `mcp-cost-tracker-router`.
- Per-tool-call and per-session token metering.
- Persistent spend history stored locally in SQLite.
- Model routing suggestions based on configurable cost thresholds.
- Built-in pricing table covering major model providers.
- Session budget alerts with configurable warning and hard-stop thresholds.
- Streamable HTTP transport via `--http-port` flag (default: disabled, uses stdio).
- GitHub Actions CI workflow running build, test, and lint on push/PR to `main`.
- Vitest test suite with coverage via `@vitest/coverage-v8`.
