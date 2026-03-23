import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import Database from "better-sqlite3";
import { tmpdir } from "os";
import { join } from "path";
import { unlinkSync, existsSync } from "fs";
import {
  initDb,
  createSession,
  recordToolUsage,
  updateSessionBudget,
} from "../src/db.js";
import { checkBudgetAlerts } from "../src/alerting.js";

// We mock the https module to avoid real network calls
import { EventEmitter } from "events";
vi.mock("https", () => {
  return {
    request: vi.fn((options: unknown, callback: (res: unknown) => void) => {
      const fakeRes = new EventEmitter();
      fakeRes.resume = vi.fn();
      callback(fakeRes);
      // Emit end to resolve the promise
      setTimeout(() => fakeRes.emit("end"), 0);
      return {
        on: vi.fn(),
        write: vi.fn(),
        end: vi.fn(),
      };
    }),
  };
});

let db: Database.Database;
let dbPath: string;

beforeEach(() => {
  dbPath = join(tmpdir(), `alerting-test-${Date.now()}.db`);
  db = initDb(dbPath);
  vi.clearAllMocks();
});

afterEach(() => {
  db.close();
  if (existsSync(dbPath)) {
    unlinkSync(dbPath);
  }
});

describe("checkBudgetAlerts", () => {
  test("does nothing when no slack webhook is configured", async () => {
    const { request } = await import("https");
    await checkBudgetAlerts(db, {});
    expect(request).not.toHaveBeenCalled();
  });

  test("does nothing when sessions have no budget threshold", async () => {
    const { request } = await import("https");
    const sessionId = crypto.randomUUID();
    createSession(db, sessionId, "claude-sonnet-4-6");
    recordToolUsage(db, {
      id: crypto.randomUUID(),
      session_id: sessionId,
      tool_name: "tool",
      model: "claude-sonnet-4-6",
      input_tokens: 100,
      output_tokens: 50,
      cost_usd: 0.5,
      recorded_at: Date.now(),
    });
    await checkBudgetAlerts(db, {
      slackWebhook: "https://hooks.slack.com/test",
    });
    expect(request).not.toHaveBeenCalled();
  });

  test("does not alert when below 80% threshold", async () => {
    const { request } = await import("https");
    const sessionId = crypto.randomUUID();
    createSession(db, sessionId, "claude-sonnet-4-6");
    updateSessionBudget(db, sessionId, 1.0);
    recordToolUsage(db, {
      id: crypto.randomUUID(),
      session_id: sessionId,
      tool_name: "tool",
      model: "claude-sonnet-4-6",
      input_tokens: 100,
      output_tokens: 50,
      cost_usd: 0.5, // 50% of budget
      recorded_at: Date.now(),
    });
    await checkBudgetAlerts(db, {
      slackWebhook: "https://hooks.slack.com/test",
    });
    expect(request).not.toHaveBeenCalled();
  });

  test("alerts when session reaches 80% threshold", async () => {
    const { request } = await import("https");
    const sessionId = crypto.randomUUID();
    createSession(db, sessionId, "claude-sonnet-4-6");
    updateSessionBudget(db, sessionId, 1.0);
    recordToolUsage(db, {
      id: crypto.randomUUID(),
      session_id: sessionId,
      tool_name: "tool",
      model: "claude-sonnet-4-6",
      input_tokens: 100,
      output_tokens: 50,
      cost_usd: 0.85, // 85% of budget
      recorded_at: Date.now(),
    });
    await checkBudgetAlerts(db, {
      slackWebhook: "https://hooks.slack.com/test",
    });
    expect(request).toHaveBeenCalledOnce();
  });

  test("alerts when session exceeds 100% threshold", async () => {
    const { request } = await import("https");
    const sessionId = crypto.randomUUID();
    createSession(db, sessionId, "claude-sonnet-4-6");
    updateSessionBudget(db, sessionId, 1.0);
    recordToolUsage(db, {
      id: crypto.randomUUID(),
      session_id: sessionId,
      tool_name: "tool",
      model: "claude-sonnet-4-6",
      input_tokens: 100,
      output_tokens: 50,
      cost_usd: 1.5, // 150% of budget
      recorded_at: Date.now(),
    });
    await checkBudgetAlerts(db, {
      slackWebhook: "https://hooks.slack.com/test",
    });
    expect(request).toHaveBeenCalledOnce();
  });

  test("sends alert for each session at or above threshold", async () => {
    const { request } = await import("https");

    for (let i = 0; i < 2; i++) {
      const sessionId = crypto.randomUUID();
      createSession(db, sessionId, "claude-sonnet-4-6");
      updateSessionBudget(db, sessionId, 1.0);
      recordToolUsage(db, {
        id: crypto.randomUUID(),
        session_id: sessionId,
        tool_name: "tool",
        model: "claude-sonnet-4-6",
        input_tokens: 100,
        output_tokens: 50,
        cost_usd: 0.9,
        recorded_at: Date.now(),
      });
    }

    await checkBudgetAlerts(db, {
      slackWebhook: "https://hooks.slack.com/test",
    });
    expect(request).toHaveBeenCalledTimes(2);
  });
});
