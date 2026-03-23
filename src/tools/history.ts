import Database from "better-sqlite3";
import { getSpendHistory } from "../db.js";
import type { SpendPeriod } from "../db.js";
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";

export async function handleGetSpendHistoryWithProgress(
  db: Database.Database,
  params: { period?: SpendPeriod; requestId?: string },
  server: Server,
): Promise<object> {
  const period: SpendPeriod = params.period ?? "week";
  const requestId = params.requestId ?? crypto.randomUUID();
  const progressToken = `spend-history-${requestId}`;

  // Notify start of aggregation (total steps: 3 — totals, by_model, by_tool)
  await server.notification({
    method: "notifications/progress",
    params: {
      progressToken,
      progress: 0,
      total: 3,
    },
  });

  const result = getSpendHistory(db, period);

  // Notify completion of all three aggregation queries
  await server.notification({
    method: "notifications/progress",
    params: {
      progressToken,
      progress: 3,
      total: 3,
    },
  });

  return {
    ...result,
    note: "All costs are estimates based on token approximations.",
  };
}

export function handleGetSpendHistory(
  db: Database.Database,
  params: { period?: SpendPeriod },
): object {
  const period: SpendPeriod = params.period ?? "week";
  const result = getSpendHistory(db, period);

  return {
    ...result,
    note: "All costs are estimates based on token approximations.",
  };
}
