import Database from "better-sqlite3";
import { homedir } from "os";
import { mkdirSync } from "fs";
import { dirname } from "path";
export function expandTilde(filePath) {
  if (filePath.startsWith("~/")) {
    return filePath.replace("~/", `${homedir()}/`);
  }
  return filePath;
}
export function initDb(dbPath) {
  const resolvedPath = expandTilde(dbPath);
  // Ensure directory exists
  mkdirSync(dirname(resolvedPath), { recursive: true });
  const db = new Database(resolvedPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      started_at INTEGER NOT NULL,
      ended_at INTEGER,
      budget_threshold_usd REAL,
      model TEXT NOT NULL DEFAULT 'claude-sonnet-4-6'
    );

    CREATE TABLE IF NOT EXISTS tool_usage (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      tool_name TEXT NOT NULL,
      model TEXT NOT NULL,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      cost_usd REAL NOT NULL DEFAULT 0,
      recorded_at INTEGER NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(id)
    );
  `);
  return db;
}
// Session operations
export function createSession(db, id, model, budgetThresholdUsd) {
  const now = Date.now();
  const stmt = db.prepare(`
    INSERT INTO sessions (id, started_at, ended_at, budget_threshold_usd, model)
    VALUES (?, ?, NULL, ?, ?)
  `);
  stmt.run(id, now, budgetThresholdUsd ?? null, model);
  return {
    id,
    started_at: now,
    ended_at: null,
    budget_threshold_usd: budgetThresholdUsd ?? null,
    model,
  };
}
export function endSession(db, sessionId) {
  const stmt = db.prepare("UPDATE sessions SET ended_at = ? WHERE id = ?");
  stmt.run(Date.now(), sessionId);
}
export function updateSessionBudget(db, sessionId, thresholdUsd) {
  const stmt = db.prepare(
    "UPDATE sessions SET budget_threshold_usd = ? WHERE id = ?",
  );
  stmt.run(thresholdUsd, sessionId);
}
export function getSession(db, sessionId) {
  const stmt = db.prepare("SELECT * FROM sessions WHERE id = ?");
  return stmt.get(sessionId);
}
// Tool usage operations
export function recordToolUsage(db, usage) {
  const stmt = db.prepare(`
    INSERT INTO tool_usage (id, session_id, tool_name, model, input_tokens, output_tokens, cost_usd, recorded_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    usage.id,
    usage.session_id,
    usage.tool_name,
    usage.model,
    usage.input_tokens,
    usage.output_tokens,
    usage.cost_usd,
    usage.recorded_at,
  );
}
export function getSessionTotals(db, sessionId) {
  const stmt = db.prepare(`
    SELECT
      COALESCE(SUM(input_tokens), 0) AS input_tokens,
      COALESCE(SUM(output_tokens), 0) AS output_tokens,
      COALESCE(SUM(cost_usd), 0) AS total_cost_usd
    FROM tool_usage
    WHERE session_id = ?
  `);
  return stmt.get(sessionId);
}
export function getToolCosts(db, sessionId) {
  const stmt = db.prepare(`
    SELECT
      tool_name,
      SUM(input_tokens) AS input_tokens,
      SUM(output_tokens) AS output_tokens,
      SUM(cost_usd) AS cost_usd,
      COUNT(*) AS call_count
    FROM tool_usage
    WHERE session_id = ?
    GROUP BY tool_name
    ORDER BY cost_usd DESC
  `);
  return stmt.all(sessionId);
}
function periodToMs(period) {
  switch (period) {
    case "day":
      return 24 * 60 * 60 * 1000;
    case "week":
      return 7 * 24 * 60 * 60 * 1000;
    case "month":
      return 30 * 24 * 60 * 60 * 1000;
  }
}
export function getSpendHistory(db, period) {
  const fromTs = Date.now() - periodToMs(period);
  const totalStmt = db.prepare(`
    SELECT
      COALESCE(SUM(cost_usd), 0) AS total_cost_usd,
      COALESCE(SUM(input_tokens), 0) AS total_input_tokens,
      COALESCE(SUM(output_tokens), 0) AS total_output_tokens
    FROM tool_usage
    WHERE recorded_at >= ?
  `);
  const totals = totalStmt.get(fromTs);
  const byModelStmt = db.prepare(`
    SELECT
      model,
      SUM(input_tokens) AS input_tokens,
      SUM(output_tokens) AS output_tokens,
      SUM(cost_usd) AS cost_usd,
      COUNT(*) AS call_count
    FROM tool_usage
    WHERE recorded_at >= ?
    GROUP BY model
    ORDER BY cost_usd DESC
  `);
  const byModel = byModelStmt.all(fromTs);
  const byToolStmt = db.prepare(`
    SELECT
      tool_name,
      SUM(input_tokens) AS input_tokens,
      SUM(output_tokens) AS output_tokens,
      SUM(cost_usd) AS cost_usd,
      COUNT(*) AS call_count
    FROM tool_usage
    WHERE recorded_at >= ?
    GROUP BY tool_name
    ORDER BY cost_usd DESC
  `);
  const byTool = byToolStmt.all(fromTs);
  return {
    period,
    from_ts: fromTs,
    total_cost_usd: totals.total_cost_usd,
    total_input_tokens: totals.total_input_tokens,
    total_output_tokens: totals.total_output_tokens,
    by_model: byModel,
    by_tool: byTool,
  };
}
