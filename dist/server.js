import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  CancelledNotificationSchema,
  McpError,
  ErrorCode,
} from "@modelcontextprotocol/sdk/types.js";
import { initDb, createSession, getSessionTotals } from "./db.js";
import { loadPricingTable } from "./pricing.js";
import {
  handleGetSessionCost,
  handleGetToolCosts,
  handleResetSession,
  handleRecordUsage,
} from "./tools/session.js";
import { handleSetBudgetAlert } from "./tools/budget.js";
import { handleGetSpendHistoryWithProgress } from "./tools/history.js";
import { handleSuggestModelRouting } from "./tools/routing.js";
import { handleEstimateWorkflowCost } from "./tools/estimation.js";
import { handleExportSpendReport } from "./tools/html_report.js";
import { AuditLog } from "./audit-log.js";
import {
  initProjectTables,
  tagSession,
  setProjectBudget,
  getProjectCosts,
} from "./project-allocator.js";
import { generateChargebackReport, chargebackToCSV } from "./chargeback.js";
import { enforceRouting } from "./routing-enforcer.js";
import { checkBudgetAlerts } from "./alerting.js";
// ─── Cancellation Registry ─────────────────────────────────────────────────
const cancellationRegistry = new Map();
export function isCancelled(requestId) {
  return cancellationRegistry.get(requestId) === true;
}
// Best-effort notification — swallows errors when transport doesn't support logging
async function tryNotify(server, level, logger, data) {
  try {
    await server.notification({
      method: "notifications/message",
      params: { level, logger, data },
    });
  } catch {
    // Transport doesn't support logging notifications; ignore
  }
}
function makeTextContent(result) {
  return {
    content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
  };
}
/**
 * Creates a fully configured MCP Server instance with all request handlers
 * registered but without connecting to any transport. Use this when you need
 * to attach your own transport (e.g. StreamableHTTPServerTransport).
 */
export function createServer(config) {
  const resolvedConfig = config ?? {
    dbPath: "~/.mcp/costs.db",
    defaultModel: "claude-sonnet-4-6",
    enforceBudget: false,
  };
  let db;
  try {
    db = initDb(resolvedConfig.dbPath);
    initProjectTables(db);
  } catch (err) {
    throw new McpError(
      ErrorCode.InternalError,
      `Failed to initialize database: ${String(err)}`,
    );
  }
  const auditLog = new AuditLog();
  const pricingTable = loadPricingTable(resolvedConfig.pricingTablePath);
  const initialSessionId = crypto.randomUUID();
  createSession(
    db,
    initialSessionId,
    resolvedConfig.defaultModel,
    resolvedConfig.budgetAlert,
  );
  const state = {
    sessionId: initialSessionId,
    model: resolvedConfig.defaultModel,
    budgetThresholdUsd: resolvedConfig.budgetAlert ?? null,
  };
  const server = new Server(
    { name: "mcp-cost-tracker-router", version: "0.2.0" },
    { capabilities: { tools: {}, resources: {}, prompts: {} } },
  );
  // Cancellation handler
  server.setNotificationHandler(
    CancelledNotificationSchema,
    async (notification) => {
      const requestId = notification.params?.requestId;
      if (requestId) cancellationRegistry.set(String(requestId), true);
    },
  );
  // ─── List Tools ───────────────────────────────────────────────────────────
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: "get_session_cost",
          description:
            "Returns token totals and USD cost estimates for the current session. All costs are estimates; verify with your LLM provider's billing dashboard.",
          annotations: { readOnlyHint: true },
          inputSchema: {
            type: "object",
            properties: {},
            additionalProperties: false,
          },
        },
        {
          name: "get_tool_costs",
          description:
            "Returns per-tool cost breakdown for the current session, sorted by cost descending. Useful for identifying the most expensive operations. All costs are estimates.",
          annotations: { readOnlyHint: true },
          inputSchema: {
            type: "object",
            properties: {},
            additionalProperties: false,
          },
        },
        {
          name: "set_budget_alert",
          description:
            "Set a budget threshold in USD. A warning is emitted when session costs reach 80% or 100% of this threshold. Use with --enforce-budget to block calls beyond the limit.",
          annotations: { readOnlyHint: false },
          inputSchema: {
            type: "object",
            properties: {
              threshold_usd: {
                type: "number",
                description: "Budget threshold in USD (must be > 0)",
              },
            },
            required: ["threshold_usd"],
            additionalProperties: false,
          },
        },
        {
          name: "reset_session",
          description:
            "Start a new cost-tracking session. Previous session data is retained in history and accessible via get_spend_history.",
          annotations: { readOnlyHint: false },
          inputSchema: {
            type: "object",
            properties: {},
            additionalProperties: false,
          },
        },
        {
          name: "get_spend_history",
          description:
            "Query historical spend aggregated by time period (day/week/month). Returns breakdown by model and tool across all sessions. All costs are estimates.",
          annotations: { readOnlyHint: true },
          inputSchema: {
            type: "object",
            properties: {
              period: {
                type: "string",
                enum: ["day", "week", "month"],
                description: 'Time period to aggregate. Defaults to "week".',
              },
            },
            additionalProperties: false,
          },
        },
        {
          name: "record_usage",
          description:
            "Record token usage for a tool call. Logs LLM API cost estimates into the tracker. Emits a budget warning (notifications/message) if 80% of threshold is reached. Pricing table versions are tracked in CHANGELOG.md.",
          annotations: { readOnlyHint: false },
          inputSchema: {
            type: "object",
            properties: {
              tool_name: {
                type: "string",
                description: "Name of the tool or operation being recorded",
              },
              input_tokens: {
                type: "number",
                description: "Number of input/prompt tokens (estimate)",
              },
              output_tokens: {
                type: "number",
                description: "Number of output/completion tokens (estimate)",
              },
              model: {
                type: "string",
                description:
                  "Model used (e.g. claude-sonnet-4-6). Defaults to server default model.",
              },
            },
            required: ["tool_name", "input_tokens", "output_tokens"],
            additionalProperties: false,
          },
        },
        {
          name: "suggest_model_routing",
          description:
            "Heuristic model recommendation by task type. Analyzes the task description and returns a recommended model with reasoning and estimated cost per 1K tokens. Optionally factors in cost constraints.",
          annotations: { readOnlyHint: true },
          inputSchema: {
            type: "object",
            properties: {
              task_description: {
                type: "string",
                description:
                  "Description of the task (e.g. 'classify this tweet', 'generate a REST API', 'analyze this 50-page document')",
              },
              constraints: {
                type: "object",
                properties: {
                  max_cost_usd: {
                    type: "number",
                    description:
                      "Maximum acceptable cost per ~1K input / 500 output tokens in USD",
                  },
                },
                additionalProperties: false,
              },
            },
            required: ["task_description"],
            additionalProperties: false,
          },
        },
        {
          name: "estimate_workflow_cost",
          description:
            "Pre-run cost estimation for a multi-step workflow. Provide a list of tool steps with estimated token counts and models to get total and per-step cost estimates. Output is clearly labeled as ESTIMATE.",
          annotations: { readOnlyHint: true },
          inputSchema: {
            type: "object",
            properties: {
              steps: {
                type: "array",
                description: "List of workflow steps to estimate",
                items: {
                  type: "object",
                  properties: {
                    tool_name: {
                      type: "string",
                      description: "Name of the tool or step",
                    },
                    estimated_input_tokens: {
                      type: "number",
                      description: "Estimated number of input tokens",
                    },
                    estimated_output_tokens: {
                      type: "number",
                      description: "Estimated number of output tokens",
                    },
                    model: {
                      type: "string",
                      description:
                        "Model to use for this step. Defaults to server default.",
                    },
                  },
                  required: [
                    "tool_name",
                    "estimated_input_tokens",
                    "estimated_output_tokens",
                  ],
                  additionalProperties: false,
                },
              },
            },
            required: ["steps"],
            additionalProperties: false,
          },
        },
        {
          name: "export_spend_report",
          description:
            "Generate a single-file HTML spend report with session cost breakdown, historical spend by period, model cost comparison chart (CSS bars), and budget status. No external CDN dependencies.",
          annotations: { readOnlyHint: true },
          inputSchema: {
            type: "object",
            properties: {},
            additionalProperties: false,
          },
        },
        {
          name: "export_budget_audit",
          description:
            "Export audit log of budget enforcement decisions. Optionally filter by date range and format as JSON or CSV.",
          annotations: { readOnlyHint: true },
          inputSchema: {
            type: "object",
            properties: {
              from_date: {
                type: "string",
                description: "ISO date start filter",
              },
              to_date: { type: "string", description: "ISO date end filter" },
              format: {
                type: "string",
                enum: ["json", "csv"],
                description: 'Output format. Defaults to "json".',
              },
            },
            additionalProperties: false,
          },
        },
        {
          name: "set_project",
          description:
            "Create or update a project with an optional budget in USD.",
          annotations: { readOnlyHint: false },
          inputSchema: {
            type: "object",
            properties: {
              project_name: {
                type: "string",
                description: "Unique project name",
              },
              budget_usd: {
                type: "number",
                description: "Optional budget in USD for the project",
              },
            },
            required: ["project_name"],
            additionalProperties: false,
          },
        },
        {
          name: "get_project_costs",
          description:
            "Get cost report for a project, optionally filtered by a since date.",
          annotations: { readOnlyHint: true },
          inputSchema: {
            type: "object",
            properties: {
              project_name: { type: "string", description: "Project name" },
              since: {
                type: "string",
                description: "ISO date to filter from",
              },
            },
            required: ["project_name"],
            additionalProperties: false,
          },
        },
        {
          name: "tag_session",
          description:
            "Tag the current session with a project name for cost allocation.",
          annotations: { readOnlyHint: false },
          inputSchema: {
            type: "object",
            properties: {
              project_name: {
                type: "string",
                description: "Project name to associate with this session",
              },
            },
            required: ["project_name"],
            additionalProperties: false,
          },
        },
        {
          name: "export_chargeback",
          description:
            "Generate a chargeback report for internal team billing, grouped by project or session.",
          annotations: { readOnlyHint: true },
          inputSchema: {
            type: "object",
            properties: {
              from_date: {
                type: "string",
                description: "ISO date start of period",
              },
              to_date: {
                type: "string",
                description: "ISO date end of period",
              },
              group_by: {
                type: "string",
                enum: ["project", "session"],
                description:
                  'Group by "project" or "session". Defaults to "project".',
              },
              format: {
                type: "string",
                enum: ["json", "csv"],
                description: 'Output format. Defaults to "json".',
              },
            },
            required: ["from_date", "to_date"],
            additionalProperties: false,
          },
        },
        {
          name: "check_routing_policy",
          description:
            "Check whether a model is allowed for a given task type under the routing policy.",
          annotations: { readOnlyHint: true },
          inputSchema: {
            type: "object",
            properties: {
              task_type: {
                type: "string",
                description: "Task type (e.g. summarization, reasoning)",
              },
              model: {
                type: "string",
                description: "Model name to check",
              },
            },
            required: ["task_type", "model"],
            additionalProperties: false,
          },
        },
      ],
    };
  });
  // ─── List Resources ───────────────────────────────────────────────────────
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    return {
      resources: [
        {
          uri: `cost://${state.sessionId}`,
          name: `Session cost summary: ${state.sessionId}`,
          description:
            "Current session token totals and USD cost estimate. All costs are estimates.",
          mimeType: "application/json",
        },
      ],
    };
  });
  // ─── Read Resource ─────────────────────────────────────────────────────────
  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const uri = request.params.uri;
    const prefix = "cost://";
    if (!uri.startsWith(prefix)) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Unsupported resource URI: ${uri}`,
      );
    }
    const sessionId = uri.slice(prefix.length);
    const totals = getSessionTotals(db, sessionId);
    const summary = {
      session_id: sessionId,
      input_tokens: totals.input_tokens,
      output_tokens: totals.output_tokens,
      total_cost_usd: totals.total_cost_usd,
      note: "All costs are estimates based on token approximations.",
    };
    return {
      contents: [
        {
          uri,
          mimeType: "application/json",
          text: JSON.stringify(summary, null, 2),
        },
      ],
    };
  });
  // ─── List Prompts ──────────────────────────────────────────────────────────
  server.setRequestHandler(ListPromptsRequestSchema, async () => {
    return {
      prompts: [
        {
          name: "cost-review",
          description:
            "Guided workflow cost analysis prompt. Helps review session spending, identify expensive operations, compare models, and decide whether to continue or optimize.",
          arguments: [
            {
              name: "focus",
              description:
                'Optional focus area: "session", "history", "routing", or "optimization"',
              required: false,
            },
          ],
        },
      ],
    };
  });
  // ─── Get Prompt ────────────────────────────────────────────────────────────
  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    if (request.params.name !== "cost-review") {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Unknown prompt: ${request.params.name}`,
      );
    }
    const focus = request.params.arguments?.["focus"] ?? "session";
    const focusInstructions = {
      session: `
## Step 1 – Current Session
Call \`get_session_cost\` to retrieve current session totals.
Summarize: total cost, token counts, and budget status.

## Step 2 – Per-Tool Breakdown
Call \`get_tool_costs\` to see which tools consumed the most cost.
Identify the top 3 most expensive tools.

## Step 3 – Recommendations
Based on spend patterns, suggest:
- Which tools could use a cheaper model
- Whether the current budget threshold is appropriate
- Whether to call \`reset_session\` to start fresh`,
      history: `
## Step 1 – Historical Context
Call \`get_spend_history\` with periods: "day", "week", "month".
Compare spending trends across periods.

## Step 2 – Model Distribution
Review the \`by_model\` breakdown for each period.
Flag any models with unexpectedly high cost share.

## Step 3 – Forecast
Based on daily rate, project weekly and monthly costs.
Recommend budget adjustments if needed.`,
      routing: `
## Step 1 – Understand Current Workload
Call \`get_tool_costs\` to see what operations are running.

## Step 2 – Model Routing Review
For each high-cost tool, call \`suggest_model_routing\` with the tool's task description.
Compare recommended model vs. model currently being used.

## Step 3 – Estimated Savings
Call \`estimate_workflow_cost\` with recommended models applied.
Calculate potential savings and recommend a routing strategy.`,
      optimization: `
## Step 1 – Cost Baseline
Call \`get_session_cost\` and \`get_spend_history\` (week) to establish baseline.

## Step 2 – Identify Expensive Steps
Call \`get_tool_costs\` to identify the top cost contributors.

## Step 3 – Estimate Optimized Workflow
Call \`estimate_workflow_cost\` with lower-cost model alternatives for each step.
Show the estimated savings from switching models.

## Step 4 – Generate Report
Call \`export_spend_report\` to generate a full HTML report for stakeholder review.`,
    };
    const instruction =
      focusInstructions[focus] ?? focusInstructions["session"];
    return {
      description: `Guided cost review workflow (focus: ${focus})`,
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Please conduct a cost review of the current MCP session.
${instruction}

Note: All costs displayed are estimates based on token approximations and the pricing table defined in pricing.ts. Actual billed amounts may differ. Pricing table versions are tracked in CHANGELOG.md.`,
          },
        },
      ],
    };
  });
  // ─── Call Tool ─────────────────────────────────────────────────────────────
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const safeArgs = args ?? {};
    // Budget enforcement check for record_usage
    if (
      resolvedConfig.enforceBudget &&
      state.budgetThresholdUsd !== null &&
      name === "record_usage"
    ) {
      const totals = getSessionTotals(db, state.sessionId);
      if (totals.total_cost_usd >= state.budgetThresholdUsd) {
        // Audit the blocked decision
        const blockedEntry = {
          timestamp: new Date().toISOString(),
          session_id: state.sessionId,
          tool_name: String(safeArgs["tool_name"] ?? "unknown"),
          tokens:
            Number(safeArgs["input_tokens"] ?? 0) +
            Number(safeArgs["output_tokens"] ?? 0),
          cost_usd: 0,
          budget_usd: state.budgetThresholdUsd,
          decision: "blocked",
          reason: `Session cost $${totals.total_cost_usd.toFixed(6)} >= threshold $${state.budgetThresholdUsd.toFixed(6)}`,
        };
        auditLog.record(blockedEntry);
        // Emit warning notification before throwing
        await tryNotify(
          server,
          "warning",
          "mcp-cost-tracker-router",
          `Budget enforcement: call blocked. Session cost $${totals.total_cost_usd.toFixed(6)} >= threshold $${state.budgetThresholdUsd.toFixed(6)}.`,
        );
        throw new McpError(
          ErrorCode.InvalidRequest,
          `Budget limit of $${state.budgetThresholdUsd.toFixed(6)} exceeded. Current session cost: $${totals.total_cost_usd.toFixed(6)}. Use reset_session to start fresh or increase budget with set_budget_alert.`,
        );
      }
    }
    switch (name) {
      case "get_session_cost": {
        const result = handleGetSessionCost(db, state);
        await tryNotify(
          server,
          "info",
          "cost-tracker-router",
          `Budget check: session=${state.sessionId} cost=$${result["total_cost_usd"]} threshold=${state.budgetThresholdUsd ?? "none"}`,
        );
        return makeTextContent(result);
      }
      case "get_tool_costs": {
        const result = handleGetToolCosts(db, state);
        return makeTextContent(result);
      }
      case "set_budget_alert": {
        const thresholdUsd = safeArgs["threshold_usd"];
        if (typeof thresholdUsd !== "number") {
          throw new McpError(
            ErrorCode.InvalidParams,
            "threshold_usd must be a number",
          );
        }
        const { updatedState, result } = handleSetBudgetAlert(db, state, {
          threshold_usd: thresholdUsd,
        });
        state.budgetThresholdUsd = updatedState.budgetThresholdUsd;
        await tryNotify(
          server,
          "info",
          "cost-tracker-router",
          `Budget check: threshold set to $${thresholdUsd.toFixed(6)} for session=${state.sessionId}`,
        );
        return makeTextContent(result);
      }
      case "reset_session": {
        const { newSessionId, result } = handleResetSession(db, state);
        state.sessionId = newSessionId;
        return makeTextContent(result);
      }
      case "get_spend_history": {
        const period = safeArgs["period"];
        if (
          period !== undefined &&
          !["day", "week", "month"].includes(period)
        ) {
          throw new McpError(
            ErrorCode.InvalidParams,
            'period must be one of "day", "week", "month"',
          );
        }
        const requestId = crypto.randomUUID();
        const result = await handleGetSpendHistoryWithProgress(
          db,
          { period, requestId },
          server,
        );
        await tryNotify(
          server,
          "info",
          "cost-tracker-router",
          `Spend aggregated: period=${period ?? "week"} total_cost=$${result["total_cost_usd"]}`,
        );
        return makeTextContent(result);
      }
      case "record_usage": {
        const toolName = safeArgs["tool_name"];
        const inputTokens = safeArgs["input_tokens"];
        const outputTokens = safeArgs["output_tokens"];
        const model = safeArgs["model"];
        if (typeof toolName !== "string" || toolName.trim() === "") {
          throw new McpError(
            ErrorCode.InvalidParams,
            "tool_name must be a non-empty string",
          );
        }
        if (typeof inputTokens !== "number" || inputTokens < 0) {
          throw new McpError(
            ErrorCode.InvalidParams,
            "input_tokens must be a non-negative number",
          );
        }
        if (typeof outputTokens !== "number" || outputTokens < 0) {
          throw new McpError(
            ErrorCode.InvalidParams,
            "output_tokens must be a non-negative number",
          );
        }
        if (model !== undefined && typeof model !== "string") {
          throw new McpError(
            ErrorCode.InvalidParams,
            "model must be a string if provided",
          );
        }
        const result = handleRecordUsage(db, state, pricingTable, {
          tool_name: toolName,
          input_tokens: inputTokens,
          output_tokens: outputTokens,
          model: typeof model === "string" ? model : undefined,
        });
        const effectiveModel = typeof model === "string" ? model : state.model;
        const costUsd = result["cost_usd"];
        // Emit MCP log for cost tracked
        await tryNotify(
          server,
          "info",
          "cost-tracker-router",
          `Cost tracked: ${effectiveModel} - input=${inputTokens} output=${outputTokens} cost=$${costUsd.toFixed(6)}`,
        );
        // Emit notification/message warning if 80% of budget is consumed
        if (typeof result["budget_warning_80pct"] === "string") {
          await tryNotify(
            server,
            "warning",
            "mcp-cost-tracker-router",
            result["budget_warning_80pct"],
          );
        }
        // Audit the allowed decision
        const allowedEntry = {
          timestamp: new Date().toISOString(),
          session_id: state.sessionId,
          tool_name: toolName,
          tokens: inputTokens + outputTokens,
          cost_usd: costUsd,
          budget_usd: state.budgetThresholdUsd,
          decision: "allowed",
          reason: "Budget within threshold",
        };
        auditLog.record(allowedEntry);
        // Check budget alerts (Slack notifications)
        const slackWebhook = process.env["MCP_SLACK_WEBHOOK"];
        if (slackWebhook) {
          await checkBudgetAlerts(db, { slackWebhook });
        }
        return makeTextContent(result);
      }
      case "suggest_model_routing": {
        const taskDescription = safeArgs["task_description"];
        if (
          typeof taskDescription !== "string" ||
          taskDescription.trim() === ""
        ) {
          throw new McpError(
            ErrorCode.InvalidParams,
            "task_description must be a non-empty string",
          );
        }
        const constraints = safeArgs["constraints"];
        const routingParams = {
          task_description: taskDescription,
          constraints,
        };
        const result = handleSuggestModelRouting(routingParams, pricingTable);
        await tryNotify(
          server,
          "info",
          "cost-tracker-router",
          `Routing decision made: recommended=${result.recommended_model} task_type=${result.task_type}`,
        );
        return makeTextContent(result);
      }
      case "estimate_workflow_cost": {
        const stepsRaw = safeArgs["steps"];
        if (!Array.isArray(stepsRaw) || stepsRaw.length === 0) {
          throw new McpError(
            ErrorCode.InvalidParams,
            "steps must be a non-empty array",
          );
        }
        const steps = stepsRaw.map((s, i) => {
          const step = s;
          if (typeof step["tool_name"] !== "string") {
            throw new McpError(
              ErrorCode.InvalidParams,
              `steps[${i}].tool_name must be a string`,
            );
          }
          if (
            typeof step["estimated_input_tokens"] !== "number" ||
            step["estimated_input_tokens"] < 0
          ) {
            throw new McpError(
              ErrorCode.InvalidParams,
              `steps[${i}].estimated_input_tokens must be a non-negative number`,
            );
          }
          if (
            typeof step["estimated_output_tokens"] !== "number" ||
            step["estimated_output_tokens"] < 0
          ) {
            throw new McpError(
              ErrorCode.InvalidParams,
              `steps[${i}].estimated_output_tokens must be a non-negative number`,
            );
          }
          return {
            tool_name: step["tool_name"],
            estimated_input_tokens: step["estimated_input_tokens"],
            estimated_output_tokens: step["estimated_output_tokens"],
            model:
              typeof step["model"] === "string" ? step["model"] : undefined,
          };
        });
        const result = handleEstimateWorkflowCost(
          { steps },
          state,
          pricingTable,
        );
        return makeTextContent(result);
      }
      case "export_spend_report": {
        const html = handleExportSpendReport(db, state);
        return {
          content: [{ type: "text", text: html }],
        };
      }
      case "export_budget_audit": {
        const fromDate = safeArgs["from_date"];
        const toDate = safeArgs["to_date"];
        const auditFormat = safeArgs["format"] ?? "json";
        const entries = auditLog.export(fromDate, toDate);
        if (auditFormat === "csv") {
          const header =
            "timestamp,session_id,tool_name,tokens,cost_usd,budget_usd,decision,reason";
          const rows = entries.map(
            (e) =>
              `"${e.timestamp}","${e.session_id}","${e.tool_name}",${e.tokens},${e.cost_usd},${e.budget_usd ?? ""},"${e.decision}","${e.reason}"`,
          );
          return makeTextContent({ csv: [header, ...rows].join("\n") });
        }
        return makeTextContent({ entries });
      }
      case "set_project": {
        const projectName = safeArgs["project_name"];
        if (typeof projectName !== "string" || projectName.trim() === "") {
          throw new McpError(
            ErrorCode.InvalidParams,
            "project_name must be a non-empty string",
          );
        }
        const budgetUsd = safeArgs["budget_usd"];
        setProjectBudget(db, projectName, budgetUsd ?? null);
        return makeTextContent({
          success: true,
          project_name: projectName,
          budget_usd: budgetUsd ?? null,
        });
      }
      case "get_project_costs": {
        const projectName = safeArgs["project_name"];
        if (typeof projectName !== "string" || projectName.trim() === "") {
          throw new McpError(
            ErrorCode.InvalidParams,
            "project_name must be a non-empty string",
          );
        }
        const since = safeArgs["since"];
        const report = getProjectCosts(db, projectName, since);
        return makeTextContent(report);
      }
      case "tag_session": {
        const projectName = safeArgs["project_name"];
        if (typeof projectName !== "string" || projectName.trim() === "") {
          throw new McpError(
            ErrorCode.InvalidParams,
            "project_name must be a non-empty string",
          );
        }
        tagSession(db, state.sessionId, projectName);
        return makeTextContent({
          success: true,
          session_id: state.sessionId,
          project_name: projectName,
        });
      }
      case "export_chargeback": {
        const fromDate = safeArgs["from_date"];
        const toDate = safeArgs["to_date"];
        if (typeof fromDate !== "string" || typeof toDate !== "string") {
          throw new McpError(
            ErrorCode.InvalidParams,
            "from_date and to_date are required strings",
          );
        }
        const groupBy = safeArgs["group_by"] ?? "project";
        const cbFormat = safeArgs["format"] ?? "json";
        const report = generateChargebackReport(db, fromDate, toDate, groupBy);
        if (cbFormat === "csv") {
          return makeTextContent({ csv: chargebackToCSV(report) });
        }
        return makeTextContent(report);
      }
      case "check_routing_policy": {
        const taskType = safeArgs["task_type"];
        const model = safeArgs["model"];
        if (typeof taskType !== "string" || taskType.trim() === "") {
          throw new McpError(
            ErrorCode.InvalidParams,
            "task_type must be a non-empty string",
          );
        }
        if (typeof model !== "string" || model.trim() === "") {
          throw new McpError(
            ErrorCode.InvalidParams,
            "model must be a non-empty string",
          );
        }
        const decision = enforceRouting(taskType, model);
        return makeTextContent(decision);
      }
      default:
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }
  });
  return server;
}
export async function createMcpServer(config) {
  const server = createServer(config);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
