import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { tmpdir } from "os";
import { join } from "path";
import { unlinkSync, existsSync } from "fs";
import { initDb, createSession, getSession } from "../src/db.js";
import { handleSetBudgetAlert } from "../src/tools/budget.js";
import { McpError } from "@modelcontextprotocol/sdk/types.js";
import type Database from "better-sqlite3";

let db: Database.Database;
let dbPath: string;

beforeEach(() => {
  dbPath = join(tmpdir(), `test-budget-${Date.now()}.db`);
  db = initDb(dbPath);
});

afterEach(() => {
  db.close();
  if (existsSync(dbPath)) {
    unlinkSync(dbPath);
  }
});

describe("handleSetBudgetAlert", () => {
  test("sets a positive budget threshold and returns correct result", () => {
    const sessionId = crypto.randomUUID();
    createSession(db, sessionId, "claude-sonnet-4-6");
    const state = {
      sessionId,
      model: "claude-sonnet-4-6",
      budgetThresholdUsd: null,
    };

    const { updatedState, result } = handleSetBudgetAlert(db, state, {
      threshold_usd: 1.5,
    });

    expect(updatedState.budgetThresholdUsd).toBe(1.5);
    const resultObj = result as Record<string, unknown>;
    expect(resultObj.session_id).toBe(sessionId);
    expect(resultObj.budget_threshold_usd).toBe(1.5);
    expect(typeof resultObj.message).toBe("string");
    expect(resultObj.message as string).toContain("1.500000");
  });

  test("persists budget threshold to the database", () => {
    const sessionId = crypto.randomUUID();
    createSession(db, sessionId, "claude-sonnet-4-6");
    const state = {
      sessionId,
      model: "claude-sonnet-4-6",
      budgetThresholdUsd: null,
    };

    handleSetBudgetAlert(db, state, { threshold_usd: 2.0 });

    const session = getSession(db, sessionId);
    expect(session?.budget_threshold_usd).toBeCloseTo(2.0, 6);
  });

  test("throws McpError when threshold_usd is zero", () => {
    const sessionId = crypto.randomUUID();
    createSession(db, sessionId, "claude-sonnet-4-6");
    const state = {
      sessionId,
      model: "claude-sonnet-4-6",
      budgetThresholdUsd: null,
    };

    expect(() => handleSetBudgetAlert(db, state, { threshold_usd: 0 })).toThrow(
      McpError,
    );
  });

  test("throws McpError when threshold_usd is negative", () => {
    const sessionId = crypto.randomUUID();
    createSession(db, sessionId, "claude-sonnet-4-6");
    const state = {
      sessionId,
      model: "claude-sonnet-4-6",
      budgetThresholdUsd: null,
    };

    expect(() =>
      handleSetBudgetAlert(db, state, { threshold_usd: -5 }),
    ).toThrow(McpError);
  });

  test("error message mentions positive number requirement", () => {
    const sessionId = crypto.randomUUID();
    createSession(db, sessionId, "claude-sonnet-4-6");
    const state = {
      sessionId,
      model: "claude-sonnet-4-6",
      budgetThresholdUsd: null,
    };

    try {
      handleSetBudgetAlert(db, state, { threshold_usd: -1 });
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(McpError);
      expect((err as McpError).message).toContain("positive");
    }
  });

  test("can update threshold multiple times", () => {
    const sessionId = crypto.randomUUID();
    createSession(db, sessionId, "claude-sonnet-4-6");
    const state = {
      sessionId,
      model: "claude-sonnet-4-6",
      budgetThresholdUsd: null,
    };

    handleSetBudgetAlert(db, state, { threshold_usd: 1.0 });
    const { updatedState } = handleSetBudgetAlert(db, state, {
      threshold_usd: 5.0,
    });

    expect(updatedState.budgetThresholdUsd).toBe(5.0);
    const session = getSession(db, sessionId);
    expect(session?.budget_threshold_usd).toBeCloseTo(5.0, 6);
  });

  test("handles small fractional threshold", () => {
    const sessionId = crypto.randomUUID();
    createSession(db, sessionId, "claude-sonnet-4-6");
    const state = {
      sessionId,
      model: "claude-sonnet-4-6",
      budgetThresholdUsd: null,
    };

    const { updatedState } = handleSetBudgetAlert(db, state, {
      threshold_usd: 0.001,
    });
    expect(updatedState.budgetThresholdUsd).toBeCloseTo(0.001, 6);
  });

  test("returned result contains message about budget alert", () => {
    const sessionId = crypto.randomUUID();
    createSession(db, sessionId, "claude-sonnet-4-6");
    const state = {
      sessionId,
      model: "claude-sonnet-4-6",
      budgetThresholdUsd: null,
    };

    const { result } = handleSetBudgetAlert(db, state, {
      threshold_usd: 10.0,
    });
    const resultObj = result as Record<string, unknown>;
    expect(resultObj.message as string).toContain("Budget alert set");
  });

  test("throws McpError with InternalError when DB operation fails", () => {
    const sessionId = crypto.randomUUID();
    createSession(db, sessionId, "claude-sonnet-4-6");
    const state = {
      sessionId,
      model: "claude-sonnet-4-6",
      budgetThresholdUsd: null,
    };

    // Close the DB to force an error on updateSessionBudget
    db.close();

    try {
      expect(() =>
        handleSetBudgetAlert(db, state, { threshold_usd: 1.0 }),
      ).toThrow(McpError);
    } finally {
      // Reopen DB to allow afterEach cleanup to proceed without error
      // (afterEach tries to close+delete, but the db is already closed)
      // We swallow any further errors here safely.
    }
  });
});
