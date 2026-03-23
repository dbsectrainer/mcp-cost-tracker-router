# Roadmap — MCP Cost Tracker & Router

## Phase 1: MVP ✅ Complete

### Goal

Give developers real-time cost awareness inside their MCP client — no more discovering a large bill at the end of the month.

### MCP Protocol Compliance

- [x] Implement stdio transport (required baseline for all MCP servers)
- [x] Strict JSON Schema for all tool inputs — `set_budget_alert` requires `threshold_usd: number`, `get_spend_history` accepts optional `period: "day"|"week"|"month"`
- [x] Tool annotations: `get_session_cost`, `get_tool_costs`, `get_spend_history` marked `readOnlyHint: true`; `set_budget_alert`, `reset_session` marked `readOnlyHint: false`
- [x] Proper MCP error codes: `invalid_params` for negative budget values, `internal_error` for storage failures
- [x] Verified with MCP Inspector before publish
- [x] `package.json` with correct `bin`, `files`, `keywords: ["mcp", "mcp-server", "cost-tracking", "llm-costs"]`

### Features

- [x] `get_session_cost` — token totals and USD cost for current session
- [x] `get_tool_costs` — per-tool cost breakdown for the session
- [x] `set_budget_alert` — threshold-based warning at 80% and 100% (respects `--budget-alert` flag)
- [x] `record_usage` — record token usage for a tool call; accepts `tool_name`, `model`, `input_tokens`, `output_tokens`
- [x] Pricing table: claude-opus-4-6, claude-sonnet-4-6, claude-haiku-4-5, gpt-4o, gpt-4o-mini, gemini-1.5-pro, gemini-1.5-flash, gemini-2.0-flash (input and output $/1K tokens)
- [x] Token counting via js-tiktoken (offline, no API calls; falls back to char/4 approximation)
- [x] SQLite storage for sessions and history (respects `--db` flag)
- [x] `reset_session` — start a new cost-tracking session
- [x] `--default-model` flag wired up for cost attribution fallback
- [x] TypeScript strict mode
- [x] Basic Jest/Vitest test suite with known token counts and expected USD values
- [x] `CHANGELOG.md` initialized
- [x] Semantic versioning from first release
- [x] Publish to npm

---

## Phase 2: Polish & Adoption ✅ Complete

### Goal

Make cost tracking useful enough that developers check it before and after every significant workflow — and that teams can govern spend systematically.

### MCP Best Practices

- [x] Progress notifications (`notifications/progress`) when computing large spend history aggregations
- [x] Cancellation support (`notifications/cancelled`) — abort long history queries cleanly
- [x] MCP logging (`notifications/message`) — emit warning-level events when budget threshold is approached (e.g. 80%)
- [x] Streamable HTTP transport (MCP 2025 spec) — share a single cost-tracking instance across a team
- [x] MCP Prompts primitive: `cost-review` prompt template to guide workflow cost analysis
- [x] MCP Resources primitive: expose session cost summaries as resources (`cost://{session_id}`)
- [x] Pricing table versioned and documented in `CHANGELOG.md` entries

### Features

- [x] `suggest_model_routing` — heuristic recommendations by task type (classification → Haiku, complex reasoning → Opus)
- [x] `get_spend_history` — daily/weekly/monthly aggregates with model breakdown
- [x] OpenAI (GPT-4o, GPT-4o-mini) and Gemini (1.5 Pro, 1.5 Flash) pricing tables
- [x] `--enforce-budget` flag: block tool calls that would exceed the budget threshold
- [x] Pre-run cost estimation — estimate cost of a described workflow before executing
- [x] `--pricing-table` custom JSON override wired up
- [x] HTML spend report artifact (single-file, shareable)
- [x] ESLint + Prettier enforced in CI
- [x] 90%+ test coverage — pricing accuracy tests must assert to 4 decimal places
- [x] GitHub Actions CI (lint, test, build)
- [x] Listed on MCP Registry
- [x] Listed on MCP Market

---

## Phase 3: Monetization & Enterprise ✅ Complete

### Goal

Serve teams that need shared cost visibility, budget governance, and chargeback reporting across projects and developers.

### MCP Enterprise Standards

- [x] OAuth 2.0 authorization (MCP 2025 spec) for the hosted dashboard API
- [x] Rate limiting on cost ingestion endpoints
- [x] API key authentication for team/project access
- [x] Multi-transport: stdio for local use, Streamable HTTP for shared team instance
- [x] Audit log of all budget enforcement decisions (which calls were blocked and why)

### Features

- [x] Team dashboard — aggregate spend across developers and projects
- [x] Project-level cost allocation (tag sessions to named projects)
- [x] Chargeback reports — export cost attribution for billing to internal teams
- [x] Automated model routing enforcement (policy-based, not just advisory)
- [x] Slack alerts when a session or project approaches its budget threshold
- [x] Paid tier: hosted dashboard, team budgets, policy enforcement, chargeback export

---

## Guiding Principles

- **Advisory routing by default** — suggestions never block the developer's choice without explicit `--enforce-budget` opt-in
- **Offline-first** — all cost calculations work without a network connection
- **Pricing accuracy** — update the pricing table within 24 hours of any model price change; version the update in `CHANGELOG.md`
- **No vendor lock-in** — track costs across Claude, OpenAI, Gemini, and local models from a single server
- **Transparent estimates** — always label outputs as estimates, not invoiced amounts
