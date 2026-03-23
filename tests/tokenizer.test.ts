import { describe, test, expect } from "vitest";
import { estimateTokens, estimateTokensFromObject } from "../src/tokenizer.js";

describe("estimateTokens", () => {
  test("returns 0 for empty string", () => {
    expect(estimateTokens("")).toBe(0);
  });

  test("returns positive integer for a simple string", () => {
    const result = estimateTokens("hello");
    expect(result).toBeGreaterThan(0);
    expect(Number.isInteger(result)).toBe(true);
  });

  test("returns positive integer for an exactly 4-char string", () => {
    const result = estimateTokens("abcd");
    expect(result).toBeGreaterThan(0);
    expect(Number.isInteger(result)).toBe(true);
  });

  test("handles longer string", () => {
    const text = "a".repeat(100);
    expect(estimateTokens(text)).toBeGreaterThan(0);
  });

  test("handles single character", () => {
    expect(estimateTokens("x")).toBeGreaterThan(0);
  });

  test("handles string with 3 chars", () => {
    expect(estimateTokens("abc")).toBeGreaterThan(0);
  });

  test("handles string with exactly 8 chars", () => {
    expect(estimateTokens("abcdefgh")).toBeGreaterThan(0);
  });

  test("handles multiline string", () => {
    expect(estimateTokens("line1\nline2\nline3")).toBeGreaterThan(0);
  });

  test("handles unicode characters", () => {
    expect(estimateTokens("héllo")).toBeGreaterThan(0);
  });

  test("longer text has at least as many tokens as shorter text", () => {
    const short = estimateTokens("hello");
    const long = estimateTokens("hello world this is a longer sentence");
    expect(long).toBeGreaterThanOrEqual(short);
  });
});

describe("estimateTokensFromObject", () => {
  test("returns 0 for non-serializable object", () => {
    // Objects with circular references can't be JSON.stringify'd
    const circular: Record<string, unknown> = {};
    circular["self"] = circular;
    expect(estimateTokensFromObject(circular)).toBe(0);
  });

  test("handles plain object", () => {
    expect(estimateTokensFromObject({ key: "value" })).toBeGreaterThan(0);
  });

  test("handles null", () => {
    // JSON.stringify(null) = "null"
    expect(estimateTokensFromObject(null)).toBeGreaterThan(0);
  });

  test("handles number", () => {
    expect(estimateTokensFromObject(42)).toBeGreaterThan(0);
  });

  test("handles array", () => {
    expect(estimateTokensFromObject([1, 2, 3, "hello"])).toBeGreaterThan(0);
  });

  test("handles nested object", () => {
    expect(
      estimateTokensFromObject({ a: { b: { c: "deep" } } }),
    ).toBeGreaterThan(0);
  });

  test("handles string value", () => {
    expect(estimateTokensFromObject("hello world")).toBeGreaterThan(0);
  });

  test("handles boolean", () => {
    expect(estimateTokensFromObject(true)).toBeGreaterThan(0);
    expect(estimateTokensFromObject(false)).toBeGreaterThan(0);
  });

  test("handles empty object", () => {
    expect(estimateTokensFromObject({})).toBeGreaterThan(0);
  });

  test("handles empty array", () => {
    expect(estimateTokensFromObject([])).toBeGreaterThan(0);
  });
});
