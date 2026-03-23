import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { tmpdir } from "os";
import { join } from "path";
import { unlinkSync, existsSync } from "fs";
import { initDb, createSession } from "../src/db.js";
import { handleRecordUsage } from "../src/tools/session.js";
import { handleGetSpendHistory } from "../src/tools/history.js";
import { DEFAULT_PRICING } from "../src/pricing.js";
import type Database from "better-sqlite3";

let db: Database.Database;
let dbPath: string;

beforeEach(() => {
  dbPath = join(tmpdir(), `test-history-${Date.now()}.db`);
  db = initDb(dbPath);
});

afterEach(() => {
  db.close();
  if (existsSync(dbPath)) {
    unlinkSync(dbPath);
  }
});

describe("handleGetSpendHistory", () => {
  test("returns empty results for period with no data", () => {
    const result = handleGetSpendHistory(db, {}) as Record<string, unknown>;
    expect(result.period).toBe("week");
    expect(result.total_cost_usd).toBe(0);
    expect(result.total_input_tokens).toBe(0);
    expect(result.total_output_tokens).toBe(0);
    expect(result.by_model).toEqual([]);
    expect(result.by_tool).toEqual([]);
  });

  test("defaults to week period when none specified", () => {
    const result = handleGetSpendHistory(db, {}) as Record<string, unknown>;
    expect(result.period).toBe("week");
  });

  test("respects day period", () => {
    const result = handleGetSpendHistory(db, { period: "day" }) as Record<
      string,
      unknown
    >;
    expect(result.period).toBe("day");
  });

  test("respects month period", () => {
    const result = handleGetSpendHistory(db, { period: "month" }) as Record<
      string,
      unknown
    >;
    expect(result.period).toBe("month");
  });

  test("aggregates spend from multiple sessions", () => {
    const sessionId1 = crypto.randomUUID();
    const sessionId2 = crypto.randomUUID();
    createSession(db, sessionId1, "claude-sonnet-4-6");
    createSession(db, sessionId2, "claude-opus-4-6");

    const state1 = {
      sessionId: sessionId1,
      model: "claude-sonnet-4-6",
      budgetThresholdUsd: null,
    };
    const state2 = {
      sessionId: sessionId2,
      model: "claude-opus-4-6",
      budgetThresholdUsd: null,
    };

    handleRecordUsage(db, state1, DEFAULT_PRICING, {
      tool_name: "search",
      input_tokens: 1000,
      output_tokens: 500,
      model: "claude-sonnet-4-6",
    });

    handleRecordUsage(db, state2, DEFAULT_PRICING, {
      tool_name: "write",
      input_tokens: 500,
      output_tokens: 250,
      model: "claude-opus-4-6",
    });

    const result = handleGetSpendHistory(db, { period: "week" }) as Record<
      string,
      unknown
    >;

    // sonnet: (1000 * 0.003 + 500 * 0.015) / 1000 = 0.0105
    // opus:   (500 * 0.015 + 250 * 0.075) / 1000 = 0.02625
    // total: 0.03675
    expect(result.total_cost_usd as number).toBeCloseTo(0.03675, 4);

    const byModel = result.by_model as Array<Record<string, unknown>>;
    expect(byModel).toHaveLength(2);

    const byTool = result.by_tool as Array<Record<string, unknown>>;
    expect(byTool).toHaveLength(2);
  });

  test("includes note about estimates", () => {
    const result = handleGetSpendHistory(db, {}) as Record<string, unknown>;
    expect(result.note).toBeTruthy();
    expect(typeof result.note).toBe("string");
  });

  test("includes from_ts timestamp", () => {
    const before = Date.now();
    const result = handleGetSpendHistory(db, { period: "day" }) as Record<
      string,
      unknown
    >;
    const after = Date.now();

    expect(result.from_ts).toBeDefined();
    const expectedFrom = before - 24 * 60 * 60 * 1000;
    // from_ts should be approximately 1 day ago
    expect(result.from_ts as number).toBeGreaterThanOrEqual(expectedFrom - 100);
    expect(result.from_ts as number).toBeLessThanOrEqual(after);
  });
});
