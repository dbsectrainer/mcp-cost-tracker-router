import Database from "better-sqlite3";
import type { PricingTable } from "../pricing.js";
export interface SessionState {
  sessionId: string;
  model: string;
  budgetThresholdUsd: number | null;
}
export declare function handleGetSessionCost(
  db: Database.Database,
  state: SessionState,
): object;
export declare function handleGetToolCosts(
  db: Database.Database,
  state: SessionState,
): object;
export declare function handleResetSession(
  db: Database.Database,
  state: SessionState,
): {
  newSessionId: string;
  result: object;
};
export declare function handleRecordUsage(
  db: Database.Database,
  state: SessionState,
  pricingTable: PricingTable,
  params: {
    tool_name: string;
    input_tokens: number;
    output_tokens: number;
    model?: string;
  },
): object;
