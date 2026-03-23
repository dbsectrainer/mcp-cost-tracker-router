import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { tmpdir } from "os";
import { join } from "path";
import { unlinkSync, existsSync } from "fs";
import { initDb, createSession } from "../src/db.js";
import { isCancelled } from "../src/server.js";
import { handleGetSpendHistoryWithProgress } from "../src/tools/history.js";
import type Database from "better-sqlite3";

let db: Database.Database;
let dbPath: string;

beforeEach(() => {
  dbPath = join(tmpdir(), `test-server-${Date.now()}.db`);
  db = initDb(dbPath);
});

afterEach(() => {
  db.close();
  if (existsSync(dbPath)) {
    unlinkSync(dbPath);
  }
});

describe("isCancelled", () => {
  test("returns false for unknown requestId", () => {
    expect(isCancelled("nonexistent-request-id")).toBe(false);
  });

  test("returns false for a new random id", () => {
    expect(isCancelled(crypto.randomUUID())).toBe(false);
  });
});

describe("handleGetSpendHistoryWithProgress", () => {
  test("emits progress notifications and returns result", async () => {
    const sessionId = crypto.randomUUID();
    createSession(db, sessionId, "claude-sonnet-4-6");

    const notifications: Array<{ method: string; params: unknown }> = [];
    const mockServer = {
      notification: async (msg: { method: string; params: unknown }) => {
        notifications.push(msg);
      },
    } as any;

    const result = (await handleGetSpendHistoryWithProgress(
      db,
      { period: "week", requestId: "test-req-1" },
      mockServer,
    )) as Record<string, unknown>;

    // Should have emitted two progress notifications (start + end)
    const progressNotifications = notifications.filter(
      (n) => n.method === "notifications/progress",
    );
    expect(progressNotifications).toHaveLength(2);

    const firstProgress = progressNotifications[0].params as Record<
      string,
      unknown
    >;
    expect(firstProgress["progressToken"]).toBe("spend-history-test-req-1");
    expect(firstProgress["progress"]).toBe(0);
    expect(firstProgress["total"]).toBe(3);

    const lastProgress = progressNotifications[1].params as Record<
      string,
      unknown
    >;
    expect(lastProgress["progress"]).toBe(3);
    expect(lastProgress["total"]).toBe(3);

    // Result should include note
    expect(result.note).toBeTruthy();
    expect(result.period).toBe("week");
  });

  test("defaults to week period when none specified", async () => {
    const notifications: unknown[] = [];
    const mockServer = {
      notification: async (msg: unknown) => {
        notifications.push(msg);
      },
    } as any;

    const result = (await handleGetSpendHistoryWithProgress(
      db,
      {},
      mockServer,
    )) as Record<string, unknown>;

    expect(result.period).toBe("week");
  });

  test("uses provided period", async () => {
    const mockServer = {
      notification: async () => {},
    } as any;

    const result = (await handleGetSpendHistoryWithProgress(
      db,
      { period: "day" },
      mockServer,
    )) as Record<string, unknown>;

    expect(result.period).toBe("day");
  });

  test("generates requestId when not provided", async () => {
    const notifications: Array<{
      method: string;
      params: Record<string, unknown>;
    }> = [];
    const mockServer = {
      notification: async (msg: {
        method: string;
        params: Record<string, unknown>;
      }) => {
        notifications.push(msg);
      },
    } as any;

    await handleGetSpendHistoryWithProgress(
      db,
      { period: "month" },
      mockServer,
    );

    const progressNotifications = notifications.filter(
      (n) => n.method === "notifications/progress",
    );
    expect(progressNotifications).toHaveLength(2);
    const token = progressNotifications[0].params["progressToken"] as string;
    expect(token).toMatch(/^spend-history-.+$/);
  });
});
