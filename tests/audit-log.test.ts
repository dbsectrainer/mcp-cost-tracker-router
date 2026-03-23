import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { tmpdir } from "os";
import { join } from "path";
import { rmSync, existsSync } from "fs";
import { AuditLog } from "../src/audit-log.js";
import type { AuditEntry } from "../src/audit-log.js";

function makeEntry(overrides: Partial<AuditEntry> = {}): AuditEntry {
  return {
    timestamp: new Date().toISOString(),
    session_id: "sess-1",
    tool_name: "test_tool",
    tokens: 100,
    cost_usd: 0.001,
    budget_usd: 1.0,
    decision: "allowed",
    reason: "Budget within threshold",
    ...overrides,
  };
}

let tmpDir: string;
let logPath: string;
let auditLog: AuditLog;

beforeEach(() => {
  tmpDir = join(tmpdir(), `audit-test-${Date.now()}`);
  logPath = join(tmpDir, "audit.jsonl");
  auditLog = new AuditLog(logPath);
});

afterEach(() => {
  if (existsSync(tmpDir)) {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

describe("AuditLog", () => {
  test("creates the log file directory if needed", () => {
    const entry = makeEntry();
    auditLog.record(entry);
    expect(existsSync(logPath)).toBe(true);
  });

  test("records a single entry and exports it", () => {
    const entry = makeEntry({ session_id: "sess-abc", tool_name: "my_tool" });
    auditLog.record(entry);
    const exported = auditLog.export();
    expect(exported).toHaveLength(1);
    expect(exported[0]?.session_id).toBe("sess-abc");
    expect(exported[0]?.tool_name).toBe("my_tool");
  });

  test("records multiple entries", () => {
    auditLog.record(makeEntry({ tool_name: "tool_a" }));
    auditLog.record(makeEntry({ tool_name: "tool_b" }));
    auditLog.record(makeEntry({ tool_name: "tool_c" }));
    const exported = auditLog.export();
    expect(exported).toHaveLength(3);
  });

  test("export returns empty array when file does not exist", () => {
    const emptyLog = new AuditLog(join(tmpDir, "nonexistent.jsonl"));
    const result = emptyLog.export();
    expect(result).toEqual([]);
  });

  test("filters by from date", () => {
    auditLog.record(
      makeEntry({ timestamp: "2024-01-01T00:00:00.000Z", tool_name: "old" }),
    );
    auditLog.record(
      makeEntry({ timestamp: "2025-06-01T00:00:00.000Z", tool_name: "new" }),
    );
    const result = auditLog.export("2025-01-01T00:00:00.000Z");
    expect(result).toHaveLength(1);
    expect(result[0]?.tool_name).toBe("new");
  });

  test("filters by to date", () => {
    auditLog.record(
      makeEntry({ timestamp: "2024-01-01T00:00:00.000Z", tool_name: "old" }),
    );
    auditLog.record(
      makeEntry({ timestamp: "2025-06-01T00:00:00.000Z", tool_name: "new" }),
    );
    const result = auditLog.export(undefined, "2024-12-31T23:59:59.999Z");
    expect(result).toHaveLength(1);
    expect(result[0]?.tool_name).toBe("old");
  });

  test("filters by both from and to date", () => {
    auditLog.record(
      makeEntry({
        timestamp: "2023-01-01T00:00:00.000Z",
        tool_name: "too_old",
      }),
    );
    auditLog.record(
      makeEntry({
        timestamp: "2024-06-01T00:00:00.000Z",
        tool_name: "in_range",
      }),
    );
    auditLog.record(
      makeEntry({
        timestamp: "2025-06-01T00:00:00.000Z",
        tool_name: "too_new",
      }),
    );
    const result = auditLog.export(
      "2024-01-01T00:00:00.000Z",
      "2024-12-31T23:59:59.999Z",
    );
    expect(result).toHaveLength(1);
    expect(result[0]?.tool_name).toBe("in_range");
  });

  test("records blocked decision entries", () => {
    const entry = makeEntry({ decision: "blocked", reason: "Budget exceeded" });
    auditLog.record(entry);
    const exported = auditLog.export();
    expect(exported[0]?.decision).toBe("blocked");
    expect(exported[0]?.reason).toBe("Budget exceeded");
  });
});
