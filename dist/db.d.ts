import Database from "better-sqlite3";
export interface Session {
  id: string;
  started_at: number;
  ended_at: number | null;
  budget_threshold_usd: number | null;
  model: string;
}
export interface ToolUsage {
  id: string;
  session_id: string;
  tool_name: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  recorded_at: number;
}
export declare function expandTilde(filePath: string): string;
export declare function initDb(dbPath: string): Database.Database;
export declare function createSession(
  db: Database.Database,
  id: string,
  model: string,
  budgetThresholdUsd?: number,
): Session;
export declare function endSession(
  db: Database.Database,
  sessionId: string,
): void;
export declare function updateSessionBudget(
  db: Database.Database,
  sessionId: string,
  thresholdUsd: number,
): void;
export declare function getSession(
  db: Database.Database,
  sessionId: string,
): Session | undefined;
export declare function recordToolUsage(
  db: Database.Database,
  usage: ToolUsage,
): void;
export interface SessionTotals {
  input_tokens: number;
  output_tokens: number;
  total_cost_usd: number;
}
export declare function getSessionTotals(
  db: Database.Database,
  sessionId: string,
): SessionTotals;
export interface ToolCostRow {
  tool_name: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  call_count: number;
}
export declare function getToolCosts(
  db: Database.Database,
  sessionId: string,
): ToolCostRow[];
export type SpendPeriod = "day" | "week" | "month";
export interface SpendHistoryByModel {
  model: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  call_count: number;
}
export interface SpendHistoryByTool {
  tool_name: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  call_count: number;
}
export interface SpendHistoryResult {
  period: SpendPeriod;
  from_ts: number;
  total_cost_usd: number;
  total_input_tokens: number;
  total_output_tokens: number;
  by_model: SpendHistoryByModel[];
  by_tool: SpendHistoryByTool[];
}
export declare function getSpendHistory(
  db: Database.Database,
  period: SpendPeriod,
): SpendHistoryResult;
