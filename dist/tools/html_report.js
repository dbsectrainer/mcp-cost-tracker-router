import { getToolCosts, getSessionTotals, getSpendHistory } from "../db.js";
function escapeHtml(str) {
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}
function formatUsd(amount) {
    return `$${amount.toFixed(6)}`;
}
function formatNumber(n) {
    return n.toLocaleString("en-US");
}
function buildBarChart(items) {
    if (items.length === 0) {
        return "<p style='color:#666;font-style:italic;'>No data available.</p>";
    }
    const rows = items.map(({ label, value, maxValue }) => {
        const pct = maxValue > 0 ? Math.round((value / maxValue) * 100) : 0;
        return `
      <div style="margin-bottom:8px;">
        <div style="display:flex;align-items:center;gap:8px;">
          <span style="min-width:160px;font-size:13px;color:#333;">${escapeHtml(label)}</span>
          <div style="flex:1;background:#e8e8e8;border-radius:4px;height:18px;overflow:hidden;">
            <div style="width:${pct}%;background:#4a90d9;height:100%;border-radius:4px;transition:width 0.3s;"></div>
          </div>
          <span style="min-width:90px;text-align:right;font-size:13px;color:#333;">${formatUsd(value)}</span>
        </div>
      </div>`;
    });
    return rows.join("");
}
export function handleExportSpendReport(db, state) {
    const totals = getSessionTotals(db, state.sessionId);
    const toolCosts = getToolCosts(db, state.sessionId);
    const dayHistory = getSpendHistory(db, "day");
    const weekHistory = getSpendHistory(db, "week");
    const monthHistory = getSpendHistory(db, "month");
    // Build model comparison from monthly data
    const allModels = monthHistory.by_model;
    const maxModelCost = allModels.reduce((m, r) => Math.max(m, r.cost_usd), 0);
    const modelBarItems = allModels.map((r) => ({
        label: r.model,
        value: r.cost_usd,
        maxValue: maxModelCost,
    }));
    // Build tool breakdown bar chart for current session
    const maxToolCost = toolCosts.reduce((m, r) => Math.max(m, r.cost_usd), 0);
    const toolBarItems = toolCosts.map((r) => ({
        label: r.tool_name,
        value: r.cost_usd,
        maxValue: maxToolCost,
    }));
    const budgetStatus = state.budgetThresholdUsd !== null
        ? (() => {
            const pct = state.budgetThresholdUsd > 0
                ? Math.round((totals.total_cost_usd / state.budgetThresholdUsd) * 100)
                : 0;
            const remaining = state.budgetThresholdUsd - totals.total_cost_usd;
            const color = pct >= 100 ? "#c0392b" : pct >= 80 ? "#e67e22" : "#27ae60";
            return `
            <section style="margin-bottom:32px;">
              <h2 style="color:#333;border-bottom:2px solid #4a90d9;padding-bottom:8px;">Budget Status</h2>
              <p>Threshold: <strong>${formatUsd(state.budgetThresholdUsd)}</strong></p>
              <p>Consumed: <strong style="color:${color};">${pct}% (${formatUsd(totals.total_cost_usd)})</strong></p>
              <p>Remaining: <strong>${formatUsd(remaining)}</strong></p>
              <div style="background:#e8e8e8;border-radius:6px;height:24px;overflow:hidden;margin-top:8px;">
                <div style="width:${Math.min(pct, 100)}%;background:${color};height:100%;border-radius:6px;"></div>
              </div>
            </section>`;
        })()
        : "";
    const toolTableRows = toolCosts.length > 0
        ? toolCosts
            .map((t) => `
          <tr style="border-bottom:1px solid #eee;">
            <td style="padding:8px 12px;">${escapeHtml(t.tool_name)}</td>
            <td style="padding:8px 12px;text-align:right;">${formatNumber(t.input_tokens)}</td>
            <td style="padding:8px 12px;text-align:right;">${formatNumber(t.output_tokens)}</td>
            <td style="padding:8px 12px;text-align:right;">${t.call_count}</td>
            <td style="padding:8px 12px;text-align:right;font-weight:bold;">${formatUsd(t.cost_usd)}</td>
          </tr>`)
            .join("")
        : `<tr><td colspan="5" style="padding:16px;text-align:center;color:#666;font-style:italic;">No tool usage recorded in this session.</td></tr>`;
    const historyRows = [
        { label: "Last 24 hours", data: dayHistory },
        { label: "Last 7 days", data: weekHistory },
        { label: "Last 30 days", data: monthHistory },
    ]
        .map(({ label, data }) => `
        <tr style="border-bottom:1px solid #eee;">
          <td style="padding:8px 12px;">${label}</td>
          <td style="padding:8px 12px;text-align:right;">${formatNumber(data.total_input_tokens)}</td>
          <td style="padding:8px 12px;text-align:right;">${formatNumber(data.total_output_tokens)}</td>
          <td style="padding:8px 12px;text-align:right;font-weight:bold;">${formatUsd(data.total_cost_usd)}</td>
        </tr>`)
        .join("");
    const reportDate = new Date().toISOString();
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>MCP Cost Tracker Report</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f5f7fa;
      color: #333;
      padding: 32px;
      line-height: 1.5;
    }
    .container { max-width: 900px; margin: 0 auto; }
    header {
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
      color: #fff;
      padding: 32px;
      border-radius: 12px;
      margin-bottom: 32px;
    }
    header h1 { font-size: 28px; margin-bottom: 8px; }
    header p { opacity: 0.75; font-size: 14px; }
    section {
      background: #fff;
      border-radius: 12px;
      padding: 24px;
      margin-bottom: 24px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.06);
    }
    h2 {
      font-size: 18px;
      color: #1a1a2e;
      margin-bottom: 16px;
      padding-bottom: 8px;
      border-bottom: 2px solid #e8f0fe;
    }
    .stat-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: 16px;
      margin-bottom: 16px;
    }
    .stat-card {
      background: #f5f7fa;
      border-radius: 8px;
      padding: 16px;
      text-align: center;
    }
    .stat-card .label { font-size: 12px; color: #666; text-transform: uppercase; letter-spacing: 0.5px; }
    .stat-card .value { font-size: 22px; font-weight: 700; color: #1a1a2e; margin-top: 4px; }
    table { width: 100%; border-collapse: collapse; }
    th {
      background: #f5f7fa;
      padding: 10px 12px;
      text-align: left;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #666;
    }
    th:not(:first-child) { text-align: right; }
    footer {
      text-align: center;
      font-size: 12px;
      color: #999;
      margin-top: 24px;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>MCP Cost Tracker Report</h1>
      <p>Session: ${escapeHtml(state.sessionId)}</p>
      <p>Generated: ${reportDate}</p>
      <p style="margin-top:12px;font-size:12px;opacity:0.6;">ESTIMATE - not actual billed amount. All costs are estimates based on token approximations.</p>
    </header>

    <section>
      <h2>Current Session Summary</h2>
      <div class="stat-grid">
        <div class="stat-card">
          <div class="label">Total Cost</div>
          <div class="value">${formatUsd(totals.total_cost_usd)}</div>
        </div>
        <div class="stat-card">
          <div class="label">Input Tokens</div>
          <div class="value">${formatNumber(totals.input_tokens)}</div>
        </div>
        <div class="stat-card">
          <div class="label">Output Tokens</div>
          <div class="value">${formatNumber(totals.output_tokens)}</div>
        </div>
        <div class="stat-card">
          <div class="label">Default Model</div>
          <div class="value" style="font-size:14px;">${escapeHtml(state.model)}</div>
        </div>
      </div>
    </section>

    ${budgetStatus}

    <section>
      <h2>Per-Tool Breakdown (Current Session)</h2>
      <div style="margin-bottom:20px;">
        ${buildBarChart(toolBarItems)}
      </div>
      <table>
        <thead>
          <tr>
            <th>Tool</th>
            <th>Input Tokens</th>
            <th>Output Tokens</th>
            <th>Calls</th>
            <th>Est. Cost</th>
          </tr>
        </thead>
        <tbody>
          ${toolTableRows}
        </tbody>
      </table>
    </section>

    <section>
      <h2>Historical Spend by Period</h2>
      <table>
        <thead>
          <tr>
            <th>Period</th>
            <th>Input Tokens</th>
            <th>Output Tokens</th>
            <th>Est. Cost</th>
          </tr>
        </thead>
        <tbody>
          ${historyRows}
        </tbody>
      </table>
    </section>

    <section>
      <h2>Model Cost Comparison (Last 30 Days)</h2>
      ${buildBarChart(modelBarItems)}
    </section>

    <footer>
      <p>mcp-cost-tracker-router &mdash; All figures are estimates. Verify costs with your LLM provider billing dashboard.</p>
    </footer>
  </div>
</body>
</html>`;
    return html;
}
