# MCP Cost Tracker & Router

npm `mcp-cost-tracker-router` package

Local-first cost awareness for MCP agent workflows. Token counts are calculated offline using js-tiktoken — no proxy, no API round-trip, no spend data leaving your machine. When costs climb, routing suggestions point you to cheaper models before the invoice arrives.

[Tool reference](#tools) | [Configuration](#configuration) | [Contributing](#contributing) | [Troubleshooting](#troubleshooting)

## Key features

- **Per-tool cost breakdown**: See exactly which tool calls are consuming the most tokens and budget.
- **Budget alerts**: Set a session spend threshold and get warned at 80% and 100% before you exceed it.
- **Offline token counting**: Uses js-tiktoken for accurate counts — no API calls required.
- **Model routing suggestions**: Recommends cheaper models for the current task type (advisory, never enforced without opt-in).
- **Multi-provider pricing**: Tracks costs across Claude, OpenAI, and Gemini models from a single configurable pricing table.
- **Spend history**: Query daily, weekly, and monthly totals by model or tool.
- **Project cost allocation**: Tag sessions to named projects and generate chargeback reports.
- **HTML spend reports**: Export a single-file, self-contained HTML report with charts and budget status.
- **Audit log**: Append-only log of every budget enforcement decision.

## Why this over proxy-based cost trackers?

Most cost-tracking tools work by routing all your API traffic through their server and measuring tokens server-side. That means your prompts and responses transit a third-party service, and you're dependent on their uptime.

|                   | mcp-cost-tracker-router                     | Proxy-based trackers (Helicone, LLMonitor, etc.) |
| ----------------- | ------------------------------------------- | ------------------------------------------------ |
| Token counting    | Offline via js-tiktoken — no network call   | Counted server-side after traffic is proxied     |
| Data residency    | Local SQLite only                           | Prompts + responses pass through vendor servers  |
| Model routing     | Built-in `suggest_model_routing` tool       | Rarely included; usually a separate paid tier    |
| Multi-provider    | Claude, OpenAI, Gemini in one pricing table | Often single-provider or requires separate setup |
| Uptime dependency | None — fully offline                        | Breaks if proxy is down                          |

If your prompts contain sensitive information or you can't route traffic through a third party, this is the right tool. If you need a managed dashboard with team sharing, a proxy-based service may suit you better.

## Disclaimers

`mcp-cost-tracker-router` stores tool call metadata (token counts, model names, timestamps) locally in SQLite. It does not store prompt or response content. Cost calculations are estimates based on a local pricing table and may not exactly match your provider's invoice.

## Requirements

- Node.js v20.19 or newer.
- npm.

## Getting started

Add the following config to your MCP client:

```json
{
  "mcpServers": {
    "cost-tracker": {
      "command": "npx",
      "args": ["-y", "mcp-cost-tracker-router@latest"]
    }
  }
}
```

To set a session budget alert:

```json
{
  "mcpServers": {
    "cost-tracker": {
      "command": "npx",
      "args": ["-y", "mcp-cost-tracker-router@latest", "--budget-alert=5.00"]
    }
  }
}
```

### MCP Client configuration

Amp · Claude Code · Cline · Cursor · VS Code · Windsurf · Zed

## Your first prompt

Enter the following in your MCP client to verify everything is working:

```
How much has this session cost so far?
```

Your client should return a token and USD cost summary for the current session.

## Tools

### Session (4 tools)

- `get_session_cost` — Returns token totals and USD cost estimates for the current session. Read-only.
- `get_tool_costs` — Returns per-tool cost breakdown for the session, sorted by cost descending. Read-only.
- `reset_session` — Start a new cost-tracking session. Previous session data is retained in history.
- `record_usage` — Record token usage for a tool call. Takes `tool_name`, `model` (optional), `input_tokens`, and `output_tokens`. Emits a budget warning notification if 80% of threshold is reached.

### Budgets & routing (3 tools)

- `set_budget_alert` — Set a budget threshold in USD (`threshold_usd`). Warns at 80% and 100% of the threshold. Use with `--enforce-budget` to block calls beyond the limit.
- `suggest_model_routing` — Heuristic model recommendation by task type. Takes `task_description` and optional `constraints.max_cost_usd`. Returns recommended model with reasoning and estimated cost.
- `check_routing_policy` — Check whether a model is allowed for a given task type under the routing policy. Takes `task_type` and `model`.

### History & reports (4 tools)

- `get_spend_history` — Query historical spend aggregated by `period` (`day`/`week`/`month`). Returns breakdown by model and tool. Read-only.
- `estimate_workflow_cost` — Pre-run cost estimation for a multi-step workflow. Takes a `steps` array with `tool_name`, `estimated_input_tokens`, `estimated_output_tokens`, and optional `model`. Read-only.
- `export_spend_report` — Generate a single-file HTML spend report with session breakdown, historical spend, model cost comparison, and budget status. Read-only.
- `export_budget_audit` — Export the audit log of budget enforcement decisions. Accepts optional `from_date`, `to_date`, and `format` (`json`/`csv`). Read-only.

### Project allocation (4 tools)

- `set_project` — Create or update a project with an optional `budget_usd`. Takes `project_name`.
- `tag_session` — Tag the current session with a `project_name` for cost allocation.
- `get_project_costs` — Get cost report for a project. Takes `project_name` and optional `since` (ISO date). Read-only.
- `export_chargeback` — Generate a chargeback report for internal billing. Takes `from_date`, `to_date`, optional `group_by` (`project`/`session`), and optional `format` (`json`/`csv`). Read-only.

## Configuration

### `--budget-alert`

Session spend threshold in USD. A warning is returned when session costs reach 80% and again at 100% of this threshold.

Type: `number`

### `--db` / `--db-path`

Path to the SQLite database file used to store cost history.

Type: `string`
Default: `~/.mcp/costs.db`

### `--pricing-table`

Path to a JSON file containing custom model pricing ($/1K tokens). Merged with the built-in table; missing models fall back to defaults.

Type: `string`

### `--default-model`

Model name to attribute costs to when no model can be inferred from context.

Type: `string`
Default: `claude-sonnet-4-6`

### `--enforce-budget`

Block tool calls that would cause the session to exceed the budget alert threshold. Requires `--budget-alert` to be set.

Type: `boolean`
Default: `false`

### `--http-port`

Start in HTTP mode using Streamable HTTP transport instead of stdio. Useful for sharing a single cost-tracking instance across a team.

Type: `number`
Default: disabled (uses stdio)

Pass flags via the `args` property in your JSON config:

```json
{
  "mcpServers": {
    "cost-tracker": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-cost-tracker-router@latest",
        "--budget-alert=2.00",
        "--enforce-budget"
      ]
    }
  }
}
```

## Supported models and pricing

Built-in pricing table (USD per 1K tokens):

| Model             | Input     | Output    |
| ----------------- | --------- | --------- |
| claude-opus-4-6   | $0.0150   | $0.0750   |
| claude-sonnet-4-6 | $0.0030   | $0.0150   |
| claude-haiku-4-5  | $0.0008   | $0.0040   |
| gpt-4o            | $0.0025   | $0.0100   |
| gpt-4o-mini       | $0.000150 | $0.000600 |
| gemini-1.5-pro    | $0.001250 | $0.005000 |
| gemini-1.5-flash  | $0.000075 | $0.000300 |
| gemini-2.0-flash  | $0.000100 | $0.000400 |

Override individual model prices with `--pricing-table`. All costs are estimates.

## Verification

Before publishing a new version, verify the server with MCP Inspector to confirm all tools are exposed correctly and the protocol handshake succeeds.

**Interactive UI** (opens browser):

```bash
npm run build && npm run inspect
```

**CLI mode** (scripted / CI-friendly):

```bash
# List all tools
npx @modelcontextprotocol/inspector --cli node dist/index.js --method tools/list

# List resources and prompts
npx @modelcontextprotocol/inspector --cli node dist/index.js --method resources/list
npx @modelcontextprotocol/inspector --cli node dist/index.js --method prompts/list

# Call a read-only tool
npx @modelcontextprotocol/inspector --cli node dist/index.js \
  --method tools/call --tool-name get_session_cost

# Call record_usage with arguments
npx @modelcontextprotocol/inspector --cli node dist/index.js \
  --method tools/call --tool-name record_usage \
  --tool-arg tool_name=my_tool --tool-arg input_tokens=500 --tool-arg output_tokens=200
```

Run before publishing to catch regressions in tool registration and runtime startup.

## Contributing

Update `src/pricing.ts` when new models are released. All cost calculation changes must include unit tests with known token counts and expected USD values. Routing suggestions live in `src/tools/routing.ts`.

```bash
npm install && npm test
```

## MCP Registry & Marketplace

This plugin is available on:

- [MCP Registry](https://registry.modelcontextprotocol.io)
- [MCP Marketplace](https://marketplace.modelcontextprotocol.io)

Search for `mcp-cost-tracker-router`.
