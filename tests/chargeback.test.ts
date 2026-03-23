import { describe, test, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { tmpdir } from "os";
import { join } from "path";
import { unlinkSync, existsSync } from "fs";
import { initDb, createSession, recordToolUsage } from "../src/db.js";
import { initProjectTables, tagSession } from "../src/project-allocator.js";
import {
  generateChargebackReport,
  chargebackToCSV,
} from "../src/chargeback.js";

let db: Database.Database;
let dbPath: string;

beforeEach(() => {
  dbPath = join(tmpdir(), `chargeback-test-${Date.now()}.db`);
  db = initDb(dbPath);
  initProjectTables(db);
});

afterEach(() => {
  db.close();
  if (existsSync(dbPath)) {
    unlinkSync(dbPath);
  }
});

const FROM = "2024-01-01T00:00:00.000Z";
const TO = "2030-12-31T23:59:59.999Z";

function addUsage(
  sessionId: string,
  toolName: string,
  costUsd: number,
  ts?: number,
): void {
  recordToolUsage(db, {
    id: crypto.randomUUID(),
    session_id: sessionId,
    tool_name: toolName,
    model: "claude-sonnet-4-6",
    input_tokens: 100,
    output_tokens: 50,
    cost_usd: costUsd,
    recorded_at: ts ?? Date.now(),
  });
}

describe("generateChargebackReport - by session", () => {
  test("returns empty groups for no usage", () => {
    const report = generateChargebackReport(db, FROM, TO, "session");
    expect(report.groups).toEqual([]);
  });

  test("groups by session", () => {
    const sessionId = crypto.randomUUID();
    createSession(db, sessionId, "claude-sonnet-4-6");
    addUsage(sessionId, "search", 0.005);
    addUsage(sessionId, "write", 0.01);

    const report = generateChargebackReport(db, FROM, TO, "session");
    expect(report.groups).toHaveLength(1);
    expect(report.groups[0]?.name).toBe(sessionId);
    expect(report.groups[0]?.cost_usd).toBeCloseTo(0.015, 5);
    expect(report.groups[0]?.tool_breakdown).toHaveLength(2);
  });

  test("period is formatted correctly", () => {
    const report = generateChargebackReport(db, FROM, TO, "session");
    expect(report.period).toContain(FROM);
    expect(report.period).toContain(TO);
  });

  test("filters by date range", () => {
    const sessionId = crypto.randomUUID();
    createSession(db, sessionId, "claude-sonnet-4-6");

    const oldTs = new Date("2020-01-01").getTime();
    addUsage(sessionId, "old_tool", 0.1, oldTs);
    addUsage(sessionId, "new_tool", 0.005);

    const report = generateChargebackReport(
      db,
      "2023-01-01T00:00:00.000Z",
      TO,
      "session",
    );
    const group = report.groups.find((g) => g.name === sessionId);
    expect(group?.cost_usd).toBeCloseTo(0.005, 5);
  });
});

describe("generateChargebackReport - by project", () => {
  test("returns empty groups for no usage", () => {
    const report = generateChargebackReport(db, FROM, TO, "project");
    expect(report.groups).toEqual([]);
  });

  test("groups by project", () => {
    const sessionId = crypto.randomUUID();
    createSession(db, sessionId, "claude-sonnet-4-6");
    tagSession(db, sessionId, "proj-alpha");
    addUsage(sessionId, "search", 0.005);
    addUsage(sessionId, "write", 0.01);

    const report = generateChargebackReport(db, FROM, TO, "project");
    expect(report.groups).toHaveLength(1);
    expect(report.groups[0]?.name).toBe("proj-alpha");
    expect(report.groups[0]?.cost_usd).toBeCloseTo(0.015, 5);
  });

  test("separates costs by project", () => {
    const s1 = crypto.randomUUID();
    const s2 = crypto.randomUUID();
    createSession(db, s1, "claude-sonnet-4-6");
    createSession(db, s2, "claude-sonnet-4-6");
    tagSession(db, s1, "proj-a");
    tagSession(db, s2, "proj-b");
    addUsage(s1, "tool", 0.01);
    addUsage(s2, "tool", 0.02);

    const report = generateChargebackReport(db, FROM, TO, "project");
    expect(report.groups).toHaveLength(2);
    const projA = report.groups.find((g) => g.name === "proj-a");
    const projB = report.groups.find((g) => g.name === "proj-b");
    expect(projA?.cost_usd).toBeCloseTo(0.01, 5);
    expect(projB?.cost_usd).toBeCloseTo(0.02, 5);
  });
});

describe("chargebackToCSV", () => {
  test("generates CSV with header", () => {
    const report = generateChargebackReport(db, FROM, TO, "session");
    const csv = chargebackToCSV(report);
    expect(csv).toContain("group_name,cost_usd,sessions,tool,tool_cost");
  });

  test("includes group data", () => {
    const sessionId = crypto.randomUUID();
    createSession(db, sessionId, "claude-sonnet-4-6");
    addUsage(sessionId, "mytool", 0.005);

    const report = generateChargebackReport(db, FROM, TO, "session");
    const csv = chargebackToCSV(report);
    expect(csv).toContain("mytool");
    expect(csv).toContain("0.005");
  });
});
