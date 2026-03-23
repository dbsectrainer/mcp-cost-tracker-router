import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { tmpdir } from "os";
import { join } from "path";
import { unlinkSync, existsSync } from "fs";
import { initDb, createSession, getSessionTotals } from "../src/db.js";
import {
  handleGetSessionCost,
  handleGetToolCosts,
  handleResetSession,
  handleRecordUsage,
} from "../src/tools/session.js";
import { DEFAULT_PRICING } from "../src/pricing.js";
import type Database from "better-sqlite3";

let db: Database.Database;
let dbPath: string;

beforeEach(() => {
  dbPath = join(tmpdir(), `test-costs-${Date.now()}.db`);
  db = initDb(dbPath);
});

afterEach(() => {
  db.close();
  if (existsSync(dbPath)) {
    unlinkSync(dbPath);
  }
});

describe("handleGetSessionCost", () => {
  test("returns zero costs for new session", () => {
    const sessionId = crypto.randomUUID();
    createSession(db, sessionId, "claude-sonnet-4-6");
    const state = {
      sessionId,
      model: "claude-sonnet-4-6",
      budgetThresholdUsd: null,
    };

    const result = handleGetSessionCost(db, state) as Record<string, unknown>;
    expect(result.session_id).toBe(sessionId);
    expect(result.input_tokens).toBe(0);
    expect(result.output_tokens).toBe(0);
    expect(result.total_cost_usd).toBe(0);
    expect(result.budget_threshold_usd).toBeNull();
    expect(result.budget_remaining_usd).toBeNull();
  });

  test("returns correct totals after recording usage", () => {
    const sessionId = crypto.randomUUID();
    createSession(db, sessionId, "claude-sonnet-4-6");
    const state = {
      sessionId,
      model: "claude-sonnet-4-6",
      budgetThresholdUsd: null,
    };

    handleRecordUsage(db, state, DEFAULT_PRICING, {
      tool_name: "test_tool",
      input_tokens: 1000,
      output_tokens: 500,
    });

    const result = handleGetSessionCost(db, state) as Record<string, unknown>;
    expect(result.input_tokens).toBe(1000);
    expect(result.output_tokens).toBe(500);
    // (1000 * 0.003 + 500 * 0.015) / 1000 = 0.0105
    expect(result.total_cost_usd as number).toBeCloseTo(0.0105, 4);
  });

  test("shows budget remaining when threshold is set", () => {
    const sessionId = crypto.randomUUID();
    createSession(db, sessionId, "claude-sonnet-4-6", 1.0);
    const state = {
      sessionId,
      model: "claude-sonnet-4-6",
      budgetThresholdUsd: 1.0,
    };

    const result = handleGetSessionCost(db, state) as Record<string, unknown>;
    expect(result.budget_threshold_usd).toBe(1.0);
    expect(result.budget_remaining_usd as number).toBeCloseTo(1.0, 4);
  });
});

describe("handleGetToolCosts", () => {
  test("returns empty tools array for new session", () => {
    const sessionId = crypto.randomUUID();
    createSession(db, sessionId, "claude-sonnet-4-6");
    const state = {
      sessionId,
      model: "claude-sonnet-4-6",
      budgetThresholdUsd: null,
    };

    const result = handleGetToolCosts(db, state) as Record<string, unknown>;
    expect(result.tools).toEqual([]);
  });

  test("aggregates costs by tool name", () => {
    const sessionId = crypto.randomUUID();
    createSession(db, sessionId, "claude-sonnet-4-6");
    const state = {
      sessionId,
      model: "claude-sonnet-4-6",
      budgetThresholdUsd: null,
    };

    handleRecordUsage(db, state, DEFAULT_PRICING, {
      tool_name: "search",
      input_tokens: 100,
      output_tokens: 50,
    });
    handleRecordUsage(db, state, DEFAULT_PRICING, {
      tool_name: "search",
      input_tokens: 200,
      output_tokens: 100,
    });
    handleRecordUsage(db, state, DEFAULT_PRICING, {
      tool_name: "write",
      input_tokens: 500,
      output_tokens: 200,
    });

    const result = handleGetToolCosts(db, state) as Record<string, unknown>;
    const tools = result.tools as Array<Record<string, unknown>>;
    expect(tools).toHaveLength(2);

    const searchTool = tools.find((t) => t.tool_name === "search");
    expect(searchTool?.call_count).toBe(2);
    expect(searchTool?.input_tokens).toBe(300);
    expect(searchTool?.output_tokens).toBe(150);
  });

  test("sorts tools by cost descending", () => {
    const sessionId = crypto.randomUUID();
    createSession(db, sessionId, "claude-opus-4-6");
    const state = {
      sessionId,
      model: "claude-opus-4-6",
      budgetThresholdUsd: null,
    };

    handleRecordUsage(db, state, DEFAULT_PRICING, {
      tool_name: "cheap_tool",
      input_tokens: 10,
      output_tokens: 5,
      model: "claude-haiku-4-5",
    });
    handleRecordUsage(db, state, DEFAULT_PRICING, {
      tool_name: "expensive_tool",
      input_tokens: 1000,
      output_tokens: 500,
      model: "claude-opus-4-6",
    });

    const result = handleGetToolCosts(db, state) as Record<string, unknown>;
    const tools = result.tools as Array<Record<string, unknown>>;
    expect(tools[0].tool_name).toBe("expensive_tool");
  });
});

describe("handleResetSession", () => {
  test("creates a new session and ends the old one", () => {
    const sessionId = crypto.randomUUID();
    createSession(db, sessionId, "claude-sonnet-4-6");
    const state = {
      sessionId,
      model: "claude-sonnet-4-6",
      budgetThresholdUsd: null,
    };

    const { newSessionId, result } = handleResetSession(db, state);
    expect(newSessionId).not.toBe(sessionId);
    const resultObj = result as Record<string, unknown>;
    expect(resultObj.previous_session_id).toBe(sessionId);
    expect(resultObj.new_session_id).toBe(newSessionId);
  });

  test("new session starts with zero costs", () => {
    const sessionId = crypto.randomUUID();
    createSession(db, sessionId, "claude-sonnet-4-6");
    const state = {
      sessionId,
      model: "claude-sonnet-4-6",
      budgetThresholdUsd: null,
    };

    handleRecordUsage(db, state, DEFAULT_PRICING, {
      tool_name: "some_tool",
      input_tokens: 1000,
      output_tokens: 500,
    });

    const { newSessionId } = handleResetSession(db, state);
    state.sessionId = newSessionId;

    const totals = getSessionTotals(db, newSessionId);
    expect(totals.total_cost_usd).toBe(0);
    expect(totals.input_tokens).toBe(0);
  });
});

describe("handleRecordUsage", () => {
  test("records usage and returns cost estimate", () => {
    const sessionId = crypto.randomUUID();
    createSession(db, sessionId, "claude-sonnet-4-6");
    const state = {
      sessionId,
      model: "claude-sonnet-4-6",
      budgetThresholdUsd: null,
    };

    const result = handleRecordUsage(db, state, DEFAULT_PRICING, {
      tool_name: "my_tool",
      input_tokens: 1000,
      output_tokens: 500,
    }) as Record<string, unknown>;

    expect(result.recorded).toBe(true);
    expect(result.tool_name).toBe("my_tool");
    expect(result.input_tokens).toBe(1000);
    expect(result.output_tokens).toBe(500);
    expect(result.cost_usd as number).toBeCloseTo(0.0105, 4);
    expect(result.budget_warning).toBeNull();
  });

  test("uses specified model for cost calculation", () => {
    const sessionId = crypto.randomUUID();
    createSession(db, sessionId, "claude-sonnet-4-6");
    const state = {
      sessionId,
      model: "claude-sonnet-4-6",
      budgetThresholdUsd: null,
    };

    const result = handleRecordUsage(db, state, DEFAULT_PRICING, {
      tool_name: "opus_tool",
      input_tokens: 1000,
      output_tokens: 500,
      model: "claude-opus-4-6",
    }) as Record<string, unknown>;

    // (1000 * 0.015 + 500 * 0.075) / 1000 = (15 + 37.5) / 1000 = 0.0525
    expect(result.cost_usd as number).toBeCloseTo(0.0525, 4);
    expect(result.model).toBe("claude-opus-4-6");
  });

  test("issues budget warning when threshold exceeded", () => {
    const sessionId = crypto.randomUUID();
    createSession(db, sessionId, "claude-sonnet-4-6", 0.001);
    const state = {
      sessionId,
      model: "claude-sonnet-4-6",
      budgetThresholdUsd: 0.001,
    };

    const result = handleRecordUsage(db, state, DEFAULT_PRICING, {
      tool_name: "big_call",
      input_tokens: 10000,
      output_tokens: 5000,
    }) as Record<string, unknown>;

    expect(result.budget_warning).toBeTruthy();
    expect(typeof result.budget_warning).toBe("string");
  });
});
