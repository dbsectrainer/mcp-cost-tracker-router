import { describe, test, expect } from "vitest";
import { handleSuggestModelRouting } from "../src/tools/routing.js";
import { DEFAULT_PRICING } from "../src/pricing.js";

describe("handleSuggestModelRouting", () => {
  test("recommends claude-haiku-4-5 for simple Q&A tasks", () => {
    const result = handleSuggestModelRouting(
      { task_description: "classify this tweet as positive or negative" },
      DEFAULT_PRICING,
    );
    expect(result.recommended_model).toBe("claude-haiku-4-5");
    expect(result.task_type).toMatch(/classification/i);
  });

  test("recommends claude-sonnet-4-6 for code generation tasks", () => {
    const result = handleSuggestModelRouting(
      { task_description: "generate a REST API endpoint in TypeScript" },
      DEFAULT_PRICING,
    );
    expect(result.recommended_model).toBe("claude-sonnet-4-6");
  });

  test("recommends claude-sonnet-4-6 for debugging tasks", () => {
    const result = handleSuggestModelRouting(
      { task_description: "debug this function and fix the bug" },
      DEFAULT_PRICING,
    );
    expect(result.recommended_model).toBe("claude-sonnet-4-6");
  });

  test("recommends claude-opus-4-6 for complex analysis tasks", () => {
    const result = handleSuggestModelRouting(
      {
        task_description:
          "analyze this 200-page document and write a comprehensive research synthesis",
      },
      DEFAULT_PRICING,
    );
    expect(result.recommended_model).toBe("claude-opus-4-6");
  });

  test("recommends claude-haiku-4-5 for large context tasks without complex keywords", () => {
    const result = handleSuggestModelRouting(
      { task_description: "what is the capital of France?" },
      DEFAULT_PRICING,
    );
    expect(result.recommended_model).toBe("claude-haiku-4-5");
  });

  test("includes cost_per_1k_input and cost_per_1k_output for recommended model", () => {
    const result = handleSuggestModelRouting(
      { task_description: "classify this document" },
      DEFAULT_PRICING,
    );
    expect(typeof result.cost_per_1k_input).toBe("number");
    expect(typeof result.cost_per_1k_output).toBe("number");
    expect(result.cost_per_1k_input).toBeGreaterThan(0);
    expect(result.cost_per_1k_output).toBeGreaterThan(0);
  });

  test("includes alternatives array", () => {
    const result = handleSuggestModelRouting(
      { task_description: "generate code" },
      DEFAULT_PRICING,
    );
    expect(Array.isArray(result.alternatives)).toBe(true);
    expect(result.alternatives.length).toBeGreaterThan(0);
    for (const alt of result.alternatives) {
      expect(typeof alt.model).toBe("string");
      expect(typeof alt.rationale).toBe("string");
      expect(typeof alt.cost_per_1k_input).toBe("number");
      expect(typeof alt.cost_per_1k_output).toBe("number");
    }
  });

  test("includes disclaimer and note fields", () => {
    const result = handleSuggestModelRouting(
      { task_description: "simple query" },
      DEFAULT_PRICING,
    );
    expect(typeof result.disclaimer).toBe("string");
    expect(typeof result.note).toBe("string");
    expect(result.note).toContain("estimates");
  });

  test("downgrades model when cost constraint is tight", () => {
    // The constraint checker uses 100 input / 50 output token estimates.
    // opus ~$0.00525, sonnet ~$0.00105, haiku ~$0.00028, gemini-flash ~$0.0000225.
    // A max_cost_usd of 0.0001 is below haiku ($0.00028) but above gemini-1.5-flash
    // ($0.0000225), so the routing should downgrade from opus to gemini-1.5-flash.
    const result = handleSuggestModelRouting(
      {
        task_description: "analyze this large document comprehensively",
        constraints: { max_cost_usd: 0.0001 },
      },
      DEFAULT_PRICING,
    );
    // Should not recommend opus since it exceeds the constraint
    expect(result.recommended_model).not.toBe("claude-opus-4-6");
    expect(result.reasoning).toContain("cost constraint");
  });

  test("does not downgrade model when cost constraint is generous", () => {
    const result = handleSuggestModelRouting(
      {
        task_description: "analyze this large document comprehensively",
        constraints: { max_cost_usd: 10.0 },
      },
      DEFAULT_PRICING,
    );
    // With a generous budget, opus should be recommended for complex analysis
    expect(result.recommended_model).toBe("claude-opus-4-6");
  });

  test("haiku pricing matches DEFAULT_PRICING to 4 decimal places", () => {
    // "what is" does not trigger reasoning or complex keywords -> simple -> haiku
    const result = handleSuggestModelRouting(
      { task_description: "what is the capital of France?" },
      DEFAULT_PRICING,
    );
    expect(result.recommended_model).toBe("claude-haiku-4-5");
    expect(result.cost_per_1k_input).toBeCloseTo(
      DEFAULT_PRICING["claude-haiku-4-5"].input,
      4,
    );
    expect(result.cost_per_1k_output).toBeCloseTo(
      DEFAULT_PRICING["claude-haiku-4-5"].output,
      4,
    );
  });

  test("sonnet pricing matches DEFAULT_PRICING to 4 decimal places", () => {
    // "generate a sorting algorithm" -> reasoning keywords "generate" and "algorithm"
    const result = handleSuggestModelRouting(
      { task_description: "generate a sorting algorithm in Python" },
      DEFAULT_PRICING,
    );
    expect(result.recommended_model).toBe("claude-sonnet-4-6");
    expect(result.cost_per_1k_input).toBeCloseTo(
      DEFAULT_PRICING["claude-sonnet-4-6"].input,
      4,
    );
    expect(result.cost_per_1k_output).toBeCloseTo(
      DEFAULT_PRICING["claude-sonnet-4-6"].output,
      4,
    );
  });
});
