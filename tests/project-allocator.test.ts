import { describe, test, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { tmpdir } from "os";
import { join } from "path";
import { unlinkSync, existsSync } from "fs";
import { initDb, createSession, recordToolUsage } from "../src/db.js";
import {
  initProjectTables,
  tagSession,
  setProjectBudget,
  getProjectCosts,
} from "../src/project-allocator.js";

let db: Database.Database;
let dbPath: string;

beforeEach(() => {
  dbPath = join(tmpdir(), `project-test-${Date.now()}.db`);
  db = initDb(dbPath);
  initProjectTables(db);
});

afterEach(() => {
  db.close();
  if (existsSync(dbPath)) {
    unlinkSync(dbPath);
  }
});

describe("initProjectTables", () => {
  test("creates projects table", () => {
    const row = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='projects'",
      )
      .get();
    expect(row).toBeDefined();
  });

  test("creates session_projects table", () => {
    const row = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='session_projects'",
      )
      .get();
    expect(row).toBeDefined();
  });
});

describe("tagSession", () => {
  test("creates project and tags session", () => {
    const sessionId = crypto.randomUUID();
    createSession(db, sessionId, "claude-sonnet-4-6");
    tagSession(db, sessionId, "my-project");

    const row = db
      .prepare(
        "SELECT * FROM session_projects WHERE session_id = ? AND project_name = ?",
      )
      .get(sessionId, "my-project");
    expect(row).toBeDefined();
  });

  test("creates project entry if it does not exist", () => {
    const sessionId = crypto.randomUUID();
    createSession(db, sessionId, "claude-sonnet-4-6");
    tagSession(db, sessionId, "new-project");

    const row = db
      .prepare("SELECT * FROM projects WHERE name = ?")
      .get("new-project");
    expect(row).toBeDefined();
  });

  test("allows re-tagging the same session to the same project", () => {
    const sessionId = crypto.randomUUID();
    createSession(db, sessionId, "claude-sonnet-4-6");
    tagSession(db, sessionId, "proj");
    tagSession(db, sessionId, "proj"); // should not throw
    const count = db
      .prepare(
        "SELECT COUNT(*) as cnt FROM session_projects WHERE session_id = ?",
      )
      .get(sessionId) as { cnt: number };
    expect(count.cnt).toBe(1);
  });
});

describe("setProjectBudget", () => {
  test("creates a project with a budget", () => {
    setProjectBudget(db, "budget-proj", 50.0);
    const row = db
      .prepare("SELECT * FROM projects WHERE name = ?")
      .get("budget-proj") as { budget_usd: number } | undefined;
    expect(row?.budget_usd).toBeCloseTo(50.0);
  });

  test("updates existing project budget", () => {
    setProjectBudget(db, "update-proj", 10.0);
    setProjectBudget(db, "update-proj", 20.0);
    const row = db
      .prepare("SELECT * FROM projects WHERE name = ?")
      .get("update-proj") as { budget_usd: number } | undefined;
    expect(row?.budget_usd).toBeCloseTo(20.0);
  });
});

describe("getProjectCosts", () => {
  test("returns zero costs for empty project", () => {
    setProjectBudget(db, "empty-proj", null);
    const report = getProjectCosts(db, "empty-proj");
    expect(report.project).toBe("empty-proj");
    expect(report.total_cost_usd).toBe(0);
    expect(report.session_count).toBe(0);
    expect(report.top_tools).toEqual([]);
  });

  test("aggregates costs from tagged sessions", () => {
    const sessionId = crypto.randomUUID();
    createSession(db, sessionId, "claude-sonnet-4-6");
    tagSession(db, sessionId, "cost-proj");

    recordToolUsage(db, {
      id: crypto.randomUUID(),
      session_id: sessionId,
      tool_name: "search",
      model: "claude-sonnet-4-6",
      input_tokens: 100,
      output_tokens: 50,
      cost_usd: 0.005,
      recorded_at: Date.now(),
    });
    recordToolUsage(db, {
      id: crypto.randomUUID(),
      session_id: sessionId,
      tool_name: "write",
      model: "claude-sonnet-4-6",
      input_tokens: 200,
      output_tokens: 100,
      cost_usd: 0.01,
      recorded_at: Date.now(),
    });

    const report = getProjectCosts(db, "cost-proj");
    expect(report.total_cost_usd).toBeCloseTo(0.015, 5);
    expect(report.session_count).toBe(1);
    expect(report.top_tools).toHaveLength(2);
    // top tool should be 'write' (higher cost)
    expect(report.top_tools[0]?.tool).toBe("write");
  });

  test("filters by since date", () => {
    const sessionId = crypto.randomUUID();
    createSession(db, sessionId, "claude-sonnet-4-6");
    tagSession(db, sessionId, "since-proj");

    const oldTs = Date.now() - 7 * 24 * 60 * 60 * 1000;
    recordToolUsage(db, {
      id: crypto.randomUUID(),
      session_id: sessionId,
      tool_name: "old_tool",
      model: "claude-sonnet-4-6",
      input_tokens: 100,
      output_tokens: 50,
      cost_usd: 0.005,
      recorded_at: oldTs,
    });
    recordToolUsage(db, {
      id: crypto.randomUUID(),
      session_id: sessionId,
      tool_name: "new_tool",
      model: "claude-sonnet-4-6",
      input_tokens: 100,
      output_tokens: 50,
      cost_usd: 0.001,
      recorded_at: Date.now(),
    });

    const since = new Date(Date.now() - 1000).toISOString();
    const report = getProjectCosts(db, "since-proj", since);
    expect(report.total_cost_usd).toBeCloseTo(0.001, 5);
    expect(report.top_tools).toHaveLength(1);
    expect(report.top_tools[0]?.tool).toBe("new_tool");
  });

  test("does not include costs from untagged sessions", () => {
    const sessionTagged = crypto.randomUUID();
    const sessionUntagged = crypto.randomUUID();
    createSession(db, sessionTagged, "claude-sonnet-4-6");
    createSession(db, sessionUntagged, "claude-sonnet-4-6");
    tagSession(db, sessionTagged, "tagged-proj");

    recordToolUsage(db, {
      id: crypto.randomUUID(),
      session_id: sessionTagged,
      tool_name: "tool",
      model: "claude-sonnet-4-6",
      input_tokens: 100,
      output_tokens: 50,
      cost_usd: 0.005,
      recorded_at: Date.now(),
    });
    recordToolUsage(db, {
      id: crypto.randomUUID(),
      session_id: sessionUntagged,
      tool_name: "tool",
      model: "claude-sonnet-4-6",
      input_tokens: 1000,
      output_tokens: 500,
      cost_usd: 0.1,
      recorded_at: Date.now(),
    });

    const report = getProjectCosts(db, "tagged-proj");
    expect(report.total_cost_usd).toBeCloseTo(0.005, 5);
  });
});
