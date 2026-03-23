import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { tmpdir } from "os";
import { join } from "path";
import { writeFileSync, rmSync, existsSync, mkdirSync } from "fs";
import { enforceRouting } from "../src/routing-enforcer.js";

let tmpDir: string;
let policyPath: string;

beforeEach(() => {
  tmpDir = join(tmpdir(), `routing-test-${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });
  policyPath = join(tmpDir, "routing-policy.yaml");
});

afterEach(() => {
  if (existsSync(tmpDir)) {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

function writePolicy(yaml: string): void {
  writeFileSync(policyPath, yaml, "utf-8");
}

describe("enforceRouting", () => {
  test("allows any model when no policy file exists", () => {
    const nonExistent = join(tmpDir, "nonexistent.yaml");
    const result = enforceRouting(
      "summarization",
      "claude-sonnet-4-6",
      nonExistent,
    );
    expect(result.allowed).toBe(true);
    expect(result.model).toBe("claude-sonnet-4-6");
  });

  test("allows model when no matching rule exists", () => {
    writePolicy(`
rules:
  - task_type: reasoning
    preferred_model: claude-opus-4-6
`);
    const result = enforceRouting(
      "summarization",
      "claude-sonnet-4-6",
      policyPath,
    );
    expect(result.allowed).toBe(true);
    expect(result.model).toBe("claude-sonnet-4-6");
  });

  test("allows correct model per policy", () => {
    writePolicy(`
rules:
  - task_type: summarization
    preferred_model: claude-haiku-4-5
`);
    const result = enforceRouting(
      "summarization",
      "claude-haiku-4-5",
      policyPath,
    );
    expect(result.allowed).toBe(true);
    expect(result.model).toBe("claude-haiku-4-5");
  });

  test("rejects wrong model and returns preferred", () => {
    writePolicy(`
rules:
  - task_type: summarization
    preferred_model: claude-haiku-4-5
`);
    const result = enforceRouting(
      "summarization",
      "claude-opus-4-6",
      policyPath,
    );
    expect(result.allowed).toBe(false);
    expect(result.model).toBe("claude-haiku-4-5");
    expect(result.reason).toContain("claude-haiku-4-5");
  });

  test("is case-insensitive for task type matching", () => {
    writePolicy(`
rules:
  - task_type: SUMMARIZATION
    preferred_model: claude-haiku-4-5
`);
    const result = enforceRouting(
      "summarization",
      "claude-sonnet-4-6",
      policyPath,
    );
    expect(result.allowed).toBe(false);
    expect(result.model).toBe("claude-haiku-4-5");
  });

  test("matches multiple rules correctly", () => {
    writePolicy(`
rules:
  - task_type: summarization
    preferred_model: claude-haiku-4-5
  - task_type: reasoning
    preferred_model: claude-opus-4-6
`);
    const r1 = enforceRouting("summarization", "claude-haiku-4-5", policyPath);
    expect(r1.allowed).toBe(true);

    const r2 = enforceRouting("reasoning", "claude-opus-4-6", policyPath);
    expect(r2.allowed).toBe(true);

    const r3 = enforceRouting("reasoning", "claude-haiku-4-5", policyPath);
    expect(r3.allowed).toBe(false);
    expect(r3.model).toBe("claude-opus-4-6");
  });

  test("handles empty rules list", () => {
    writePolicy("rules: []");
    const result = enforceRouting("anything", "any-model", policyPath);
    expect(result.allowed).toBe(true);
    expect(result.model).toBe("any-model");
  });

  test("handles malformed YAML gracefully", () => {
    writeFileSync(policyPath, "not: valid: yaml: ::::", "utf-8");
    // Should not throw, should fall back to allow
    const result = enforceRouting("task", "model", policyPath);
    expect(result.allowed).toBe(true);
  });
});
