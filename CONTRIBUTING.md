# Contributing to MCP Cost Tracker & Router

Thank you for your interest in contributing to `mcp-cost-tracker-router`!

## Getting Started

```bash
git clone https://github.com/<org>/mcp-cost-tracker-router.git
cd mcp-cost-tracker-router
npm install
npm test
```

All tests must pass before submitting a pull request.

## Project Layout

```
src/
  tools/             # MCP tool handlers (session, budget, history, routing, estimation, html_report)
  db.ts              # SQLite schema, session and spend-history helpers
  pricing.ts         # Built-in pricing table and custom table loader
  tokenizer.ts       # Offline token counting via js-tiktoken (cl100k_base)
  server.ts          # MCP server factory — all tool/resource/prompt handlers
  http-server.ts     # Streamable HTTP transport (--http-port flag)
  audit-log.ts       # Append-only budget enforcement audit log
  alerting.ts        # Slack budget alert notifications
  auth.ts            # JWT / API-key auth middleware (HTTP transport)
  rate-limiter.ts    # Per-client sliding-window rate limiter (HTTP transport)
  chargeback.ts      # Chargeback report generation
  project-allocator.ts  # Multi-project cost tracking and allocation
  routing-enforcer.ts   # YAML-based routing policy enforcement
  index.ts           # Entry point — CLI flag parsing and transport selection
```

## How to Contribute

### Bug Reports

Open a GitHub issue with:

- Steps to reproduce.
- Expected vs. actual behavior.
- Node.js version and OS.

### Pricing Table Updates

The built-in pricing table lives in `src/pricing.ts` (`DEFAULT_PRICING`). Submit a pull request with updated prices and a link to the official pricing page as the source of truth. Version the change in `CHANGELOG.md`.

### Feature Requests

Open an issue describing the use case before writing code.

### Pull Requests

1. Fork the repository and create a branch from `main`.
2. Write or update tests for any changed behavior.
3. Run `npm test` and ensure all tests pass.
4. Follow the existing code style (run `npm run lint`).
5. Keep pull requests focused: one feature or fix per PR.
6. Reference the relevant issue in the PR description.

## Commit Messages

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(router): add cost-per-token routing threshold config
fix(meters): correct token count for streaming responses
chore(pricing): update Claude pricing table for March 2026
```

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). Please read it before contributing.
