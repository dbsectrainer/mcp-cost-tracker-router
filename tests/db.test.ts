import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { tmpdir } from "os";
import { join } from "path";
import { unlinkSync, existsSync } from "fs";
import {
  initDb,
  createSession,
  endSession,
  getSession,
  getSessionTotals,
  recordToolUsage,
  getToolCosts,
  updateSessionBudget,
  getSpendHistory,
  expandTilde,
} from "../src/db.js";
import type Database from "better-sqlite3";

let db: Database.Database;
let dbPath: string;

beforeEach(() => {
  dbPath = join(tmpdir(), `test-db-${Date.now()}.db`);
  db = initDb(dbPath);
});

afterEach(() => {
  db.close();
  if (existsSync(dbPath)) {
    unlinkSync(dbPath);
  }
});

describe("expandTilde", () => {
  test("expands tilde at start of path", () => {
    const result = expandTilde("~/foo/bar");
    expect(result).not.toContain("~");
    expect(result).toContain("foo/bar");
  });

  test("leaves path without tilde unchanged", () => {
    expect(expandTilde("/absolute/path")).toBe("/absolute/path");
    expect(expandTilde("relative/path")).toBe("relative/path");
  });
});

describe("initDb", () => {
  test("creates a usable SQLite database", () => {
    expect(db).toBeDefined();
  });

  test("creates sessions table", () => {
    const stmt = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='sessions'",
    );
    const row = stmt.get();
    expect(row).toBeDefined();
  });

  test("creates tool_usage table", () => {
    const stmt = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='tool_usage'",
    );
    const row = stmt.get();
    expect(row).toBeDefined();
  });
});

describe("createSession", () => {
  test("creates a session with correct fields", () => {
    const id = crypto.randomUUID();
    const session = createSession(db, id, "claude-sonnet-4-6", 1.0);
    expect(session.id).toBe(id);
    expect(session.model).toBe("claude-sonnet-4-6");
    expect(session.budget_threshold_usd).toBe(1.0);
    expect(session.ended_at).toBeNull();
  });

  test("creates session without budget threshold", () => {
    const id = crypto.randomUUID();
    const session = createSession(db, id, "claude-haiku-4-5");
    expect(session.budget_threshold_usd).toBeNull();
  });
});

describe("getSession", () => {
  test("returns undefined for unknown session", () => {
    const result = getSession(db, "nonexistent-id");
    expect(result).toBeUndefined();
  });

  test("returns session for existing id", () => {
    const id = crypto.randomUUID();
    createSession(db, id, "claude-sonnet-4-6");
    const session = getSession(db, id);
    expect(session).toBeDefined();
    expect(session?.id).toBe(id);
  });
});

describe("endSession", () => {
  test("sets ended_at timestamp", () => {
    const id = crypto.randomUUID();
    createSession(db, id, "claude-sonnet-4-6");
    const before = Date.now();
    endSession(db, id);
    const after = Date.now();
    const session = getSession(db, id);
    expect(session?.ended_at).not.toBeNull();
    expect(session?.ended_at as number).toBeGreaterThanOrEqual(before);
    expect(session?.ended_at as number).toBeLessThanOrEqual(after);
  });
});

describe("updateSessionBudget", () => {
  test("updates budget threshold for a session", () => {
    const id = crypto.randomUUID();
    createSession(db, id, "claude-sonnet-4-6");
    updateSessionBudget(db, id, 2.5);
    const session = getSession(db, id);
    expect(session?.budget_threshold_usd).toBeCloseTo(2.5, 6);
  });
});

describe("recordToolUsage and getSessionTotals", () => {
  test("records usage and returns correct totals", () => {
    const sessionId = crypto.randomUUID();
    createSession(db, sessionId, "claude-sonnet-4-6");
    recordToolUsage(db, {
      id: crypto.randomUUID(),
      session_id: sessionId,
      tool_name: "my_tool",
      model: "claude-sonnet-4-6",
      input_tokens: 500,
      output_tokens: 200,
      cost_usd: 0.0045,
      recorded_at: Date.now(),
    });

    const totals = getSessionTotals(db, sessionId);
    expect(totals.input_tokens).toBe(500);
    expect(totals.output_tokens).toBe(200);
    expect(totals.total_cost_usd).toBeCloseTo(0.0045, 6);
  });

  test("returns zero totals for empty session", () => {
    const sessionId = crypto.randomUUID();
    createSession(db, sessionId, "claude-sonnet-4-6");
    const totals = getSessionTotals(db, sessionId);
    expect(totals.input_tokens).toBe(0);
    expect(totals.output_tokens).toBe(0);
    expect(totals.total_cost_usd).toBe(0);
  });

  test("accumulates multiple tool usage records", () => {
    const sessionId = crypto.randomUUID();
    createSession(db, sessionId, "claude-sonnet-4-6");
    for (let i = 0; i < 3; i++) {
      recordToolUsage(db, {
        id: crypto.randomUUID(),
        session_id: sessionId,
        tool_name: "tool",
        model: "claude-sonnet-4-6",
        input_tokens: 100,
        output_tokens: 50,
        cost_usd: 0.001,
        recorded_at: Date.now(),
      });
    }
    const totals = getSessionTotals(db, sessionId);
    expect(totals.input_tokens).toBe(300);
    expect(totals.output_tokens).toBe(150);
    expect(totals.total_cost_usd).toBeCloseTo(0.003, 6);
  });
});

describe("getToolCosts", () => {
  test("groups by tool_name", () => {
    const sessionId = crypto.randomUUID();
    createSession(db, sessionId, "claude-sonnet-4-6");

    recordToolUsage(db, {
      id: crypto.randomUUID(),
      session_id: sessionId,
      tool_name: "search",
      model: "claude-sonnet-4-6",
      input_tokens: 100,
      output_tokens: 50,
      cost_usd: 0.001,
      recorded_at: Date.now(),
    });
    recordToolUsage(db, {
      id: crypto.randomUUID(),
      session_id: sessionId,
      tool_name: "search",
      model: "claude-sonnet-4-6",
      input_tokens: 200,
      output_tokens: 100,
      cost_usd: 0.002,
      recorded_at: Date.now(),
    });
    recordToolUsage(db, {
      id: crypto.randomUUID(),
      session_id: sessionId,
      tool_name: "write",
      model: "claude-sonnet-4-6",
      input_tokens: 500,
      output_tokens: 200,
      cost_usd: 0.005,
      recorded_at: Date.now(),
    });

    const costs = getToolCosts(db, sessionId);
    expect(costs).toHaveLength(2);
    const searchCost = costs.find((c) => c.tool_name === "search");
    expect(searchCost?.call_count).toBe(2);
    expect(searchCost?.input_tokens).toBe(300);
  });

  test("sorts by cost descending", () => {
    const sessionId = crypto.randomUUID();
    createSession(db, sessionId, "claude-sonnet-4-6");

    recordToolUsage(db, {
      id: crypto.randomUUID(),
      session_id: sessionId,
      tool_name: "cheap",
      model: "claude-haiku-4-5",
      input_tokens: 10,
      output_tokens: 5,
      cost_usd: 0.0001,
      recorded_at: Date.now(),
    });
    recordToolUsage(db, {
      id: crypto.randomUUID(),
      session_id: sessionId,
      tool_name: "expensive",
      model: "claude-opus-4-6",
      input_tokens: 1000,
      output_tokens: 500,
      cost_usd: 0.05,
      recorded_at: Date.now(),
    });

    const costs = getToolCosts(db, sessionId);
    expect(costs[0].tool_name).toBe("expensive");
    expect(costs[1].tool_name).toBe("cheap");
  });

  test("does not include records from other sessions", () => {
    const sessionId1 = crypto.randomUUID();
    const sessionId2 = crypto.randomUUID();
    createSession(db, sessionId1, "claude-sonnet-4-6");
    createSession(db, sessionId2, "claude-sonnet-4-6");

    recordToolUsage(db, {
      id: crypto.randomUUID(),
      session_id: sessionId2,
      tool_name: "other_session_tool",
      model: "claude-sonnet-4-6",
      input_tokens: 100,
      output_tokens: 50,
      cost_usd: 0.001,
      recorded_at: Date.now(),
    });

    const costs = getToolCosts(db, sessionId1);
    expect(costs).toHaveLength(0);
  });
});

describe("getSpendHistory", () => {
  test("returns empty result for no data", () => {
    const result = getSpendHistory(db, "week");
    expect(result.total_cost_usd).toBe(0);
    expect(result.by_model).toEqual([]);
    expect(result.by_tool).toEqual([]);
  });

  test("includes period and from_ts", () => {
    const result = getSpendHistory(db, "day");
    expect(result.period).toBe("day");
    expect(result.from_ts).toBeGreaterThan(0);
  });

  test("aggregates spend within period", () => {
    const sessionId = crypto.randomUUID();
    createSession(db, sessionId, "claude-sonnet-4-6");
    recordToolUsage(db, {
      id: crypto.randomUUID(),
      session_id: sessionId,
      tool_name: "tool",
      model: "claude-sonnet-4-6",
      input_tokens: 1000,
      output_tokens: 500,
      cost_usd: 0.0105,
      recorded_at: Date.now(),
    });

    const result = getSpendHistory(db, "week");
    expect(result.total_cost_usd).toBeCloseTo(0.0105, 6);
    expect(result.by_model).toHaveLength(1);
    expect(result.by_tool).toHaveLength(1);
  });

  test("excludes records older than the period", () => {
    const sessionId = crypto.randomUUID();
    createSession(db, sessionId, "claude-sonnet-4-6");
    // Record with a timestamp 31 days in the past
    const oldTimestamp = Date.now() - 31 * 24 * 60 * 60 * 1000;
    recordToolUsage(db, {
      id: crypto.randomUUID(),
      session_id: sessionId,
      tool_name: "old_tool",
      model: "claude-sonnet-4-6",
      input_tokens: 500,
      output_tokens: 200,
      cost_usd: 0.005,
      recorded_at: oldTimestamp,
    });

    const result = getSpendHistory(db, "month");
    expect(result.total_cost_usd).toBe(0);
  });
});
