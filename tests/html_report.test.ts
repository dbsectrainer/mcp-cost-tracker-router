import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { tmpdir } from "os";
import { join } from "path";
import { unlinkSync, existsSync } from "fs";
import { initDb, createSession } from "../src/db.js";
import { handleRecordUsage } from "../src/tools/session.js";
import { handleExportSpendReport } from "../src/tools/html_report.js";
import { DEFAULT_PRICING } from "../src/pricing.js";
import type Database from "better-sqlite3";
import type { SessionState } from "../src/tools/session.js";

let db: Database.Database;
let dbPath: string;
let sessionId: string;
let state: SessionState;

beforeEach(() => {
  dbPath = join(tmpdir(), `test-html-report-${Date.now()}.db`);
  db = initDb(dbPath);
  sessionId = crypto.randomUUID();
  createSession(db, sessionId, "claude-sonnet-4-6");
  state = {
    sessionId,
    model: "claude-sonnet-4-6",
    budgetThresholdUsd: null,
  };
});

afterEach(() => {
  db.close();
  if (existsSync(dbPath)) {
    unlinkSync(dbPath);
  }
});

describe("handleExportSpendReport", () => {
  test("returns a non-empty string", () => {
    const html = handleExportSpendReport(db, state);
    expect(typeof html).toBe("string");
    expect(html.length).toBeGreaterThan(0);
  });

  test("returns valid HTML with doctype and html tags", () => {
    const html = handleExportSpendReport(db, state);
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("<html");
    expect(html).toContain("</html>");
  });

  test("contains the session ID", () => {
    const html = handleExportSpendReport(db, state);
    expect(html).toContain(sessionId);
  });

  test("contains ESTIMATE disclaimer", () => {
    const html = handleExportSpendReport(db, state);
    expect(html).toContain("ESTIMATE");
    expect(html).toContain("not actual billed amount");
  });

  test("contains estimates note", () => {
    const html = handleExportSpendReport(db, state);
    expect(html).toContain("estimates");
  });

  test("has no external CDN links (no http/https src or href to external domains)", () => {
    const html = handleExportSpendReport(db, state);
    // Should not reference any external URLs in src or href attributes
    expect(html).not.toMatch(/src=["']https?:\/\//);
    expect(html).not.toMatch(/href=["']https?:\/\//);
  });

  test("includes inline CSS (style tag)", () => {
    const html = handleExportSpendReport(db, state);
    expect(html).toContain("<style");
    expect(html).toContain("</style>");
  });

  test("includes section headings for key report sections", () => {
    const html = handleExportSpendReport(db, state);
    expect(html).toContain("Current Session Summary");
    expect(html).toContain("Per-Tool Breakdown");
    expect(html).toContain("Historical Spend by Period");
    expect(html).toContain("Model Cost Comparison");
  });

  test("includes historical period labels", () => {
    const html = handleExportSpendReport(db, state);
    expect(html).toContain("Last 24 hours");
    expect(html).toContain("Last 7 days");
    expect(html).toContain("Last 30 days");
  });

  test("displays zero cost for empty session", () => {
    const html = handleExportSpendReport(db, state);
    // Should show $0.000000 for total cost on an empty session
    expect(html).toContain("$0.000000");
  });

  test("includes tool usage data after recording", () => {
    handleRecordUsage(db, state, DEFAULT_PRICING, {
      tool_name: "my_test_tool",
      input_tokens: 1000,
      output_tokens: 500,
    });

    const html = handleExportSpendReport(db, state);
    expect(html).toContain("my_test_tool");
  });

  test("displays budget status when threshold is set", () => {
    const stateWithBudget: SessionState = {
      ...state,
      budgetThresholdUsd: 5.0,
    };

    const html = handleExportSpendReport(db, stateWithBudget);
    expect(html).toContain("Budget Status");
    expect(html).toContain("$5.000000");
  });

  test("does not display budget section when no threshold is set", () => {
    const html = handleExportSpendReport(db, state);
    // Without a budget, the budget status section should not appear
    expect(html).not.toContain("Budget Status");
  });

  test("contains the default model name", () => {
    const html = handleExportSpendReport(db, state);
    expect(html).toContain("claude-sonnet-4-6");
  });

  test("shows no usage message when session has no tool calls", () => {
    const html = handleExportSpendReport(db, state);
    expect(html).toContain("No tool usage recorded");
  });

  test("shows no model comparison data message when no historical data", () => {
    const html = handleExportSpendReport(db, state);
    // With no data, model bar items will be empty -> shows "No data available"
    expect(html).toContain("No data available");
  });
});
