import { describe, test, expect } from "vitest";
import { handleEstimateWorkflowCost } from "../src/tools/estimation.js";
import { DEFAULT_PRICING } from "../src/pricing.js";
import type { SessionState } from "../src/tools/session.js";

const baseState: SessionState = {
  sessionId: "test-session-id",
  model: "claude-sonnet-4-6",
  budgetThresholdUsd: null,
};

describe("handleEstimateWorkflowCost", () => {
  test("calculates cost for a single step using default model", () => {
    const result = handleEstimateWorkflowCost(
      {
        steps: [
          {
            tool_name: "search",
            estimated_input_tokens: 1000,
            estimated_output_tokens: 500,
          },
        ],
      },
      baseState,
      DEFAULT_PRICING,
    );

    // (1000 * 0.003 + 500 * 0.015) / 1000 = 0.0105
    expect(result.total_estimated_cost_usd).toBeCloseTo(0.0105, 4);
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0].tool_name).toBe("search");
    expect(result.steps[0].model).toBe("claude-sonnet-4-6");
    expect(result.steps[0].estimated_cost_usd).toBeCloseTo(0.0105, 4);
  });

  test("uses specified model for a step", () => {
    const result = handleEstimateWorkflowCost(
      {
        steps: [
          {
            tool_name: "expensive_step",
            estimated_input_tokens: 2000,
            estimated_output_tokens: 1000,
            model: "claude-opus-4-6",
          },
        ],
      },
      baseState,
      DEFAULT_PRICING,
    );

    // (2000 * 0.015 + 1000 * 0.075) / 1000 = (30 + 75) / 1000 = 0.105
    expect(result.total_estimated_cost_usd).toBeCloseTo(0.105, 4);
    expect(result.steps[0].model).toBe("claude-opus-4-6");
  });

  test("sums costs across multiple steps", () => {
    const result = handleEstimateWorkflowCost(
      {
        steps: [
          {
            tool_name: "step1",
            estimated_input_tokens: 1000,
            estimated_output_tokens: 500,
            model: "claude-haiku-4-5",
          },
          {
            tool_name: "step2",
            estimated_input_tokens: 1000,
            estimated_output_tokens: 500,
            model: "claude-sonnet-4-6",
          },
        ],
      },
      baseState,
      DEFAULT_PRICING,
    );

    // haiku: (1000 * 0.0008 + 500 * 0.004) / 1000 = 0.0028
    // sonnet: (1000 * 0.003 + 500 * 0.015) / 1000 = 0.0105
    // total: 0.0133
    expect(result.steps).toHaveLength(2);
    expect(result.total_estimated_cost_usd).toBeCloseTo(0.0133, 4);
  });

  test("includes disclaimer labeled as ESTIMATE", () => {
    const result = handleEstimateWorkflowCost(
      {
        steps: [
          {
            tool_name: "tool",
            estimated_input_tokens: 100,
            estimated_output_tokens: 50,
          },
        ],
      },
      baseState,
      DEFAULT_PRICING,
    );

    expect(result.disclaimer).toContain("ESTIMATE");
    expect(result.disclaimer).toContain("not actual billed amount");
  });

  test("includes note about estimates", () => {
    const result = handleEstimateWorkflowCost(
      {
        steps: [
          {
            tool_name: "tool",
            estimated_input_tokens: 100,
            estimated_output_tokens: 50,
          },
        ],
      },
      baseState,
      DEFAULT_PRICING,
    );

    expect(result.note).toBeTruthy();
    expect(result.note).toContain("estimates");
  });

  test("emits high_cost_warning when total exceeds $1.00", () => {
    const result = handleEstimateWorkflowCost(
      {
        steps: [
          {
            tool_name: "large_step",
            estimated_input_tokens: 100000,
            estimated_output_tokens: 50000,
            model: "claude-opus-4-6",
          },
        ],
      },
      baseState,
      DEFAULT_PRICING,
    );

    // (100000 * 0.015 + 50000 * 0.075) / 1000 = (1500 + 3750) / 1000 = 5.25
    expect(result.total_estimated_cost_usd).toBeGreaterThan(1.0);
    expect(result.high_cost_warning).toBeTruthy();
    expect(typeof result.high_cost_warning).toBe("string");
  });

  test("does not emit high_cost_warning for cheap workflows", () => {
    const result = handleEstimateWorkflowCost(
      {
        steps: [
          {
            tool_name: "tiny_step",
            estimated_input_tokens: 10,
            estimated_output_tokens: 5,
            model: "claude-haiku-4-5",
          },
        ],
      },
      baseState,
      DEFAULT_PRICING,
    );

    expect(result.total_estimated_cost_usd).toBeLessThan(1.0);
    expect(result.high_cost_warning).toBeUndefined();
  });

  test("falls back to state.model when step has no model specified", () => {
    const stateWithOpus: SessionState = {
      ...baseState,
      model: "claude-opus-4-6",
    };

    const result = handleEstimateWorkflowCost(
      {
        steps: [
          {
            tool_name: "tool",
            estimated_input_tokens: 1000,
            estimated_output_tokens: 500,
          },
        ],
      },
      stateWithOpus,
      DEFAULT_PRICING,
    );

    expect(result.steps[0].model).toBe("claude-opus-4-6");
    // (1000 * 0.015 + 500 * 0.075) / 1000 = 0.0525
    expect(result.steps[0].estimated_cost_usd).toBeCloseTo(0.0525, 4);
  });

  test("handles Gemini model steps correctly", () => {
    const result = handleEstimateWorkflowCost(
      {
        steps: [
          {
            tool_name: "gemini_step",
            estimated_input_tokens: 1000,
            estimated_output_tokens: 1000,
            model: "gemini-1.5-flash",
          },
        ],
      },
      baseState,
      DEFAULT_PRICING,
    );

    // (1000 * 0.000075 + 1000 * 0.0003) / 1000 = 0.000375
    expect(result.steps[0].estimated_cost_usd).toBeCloseTo(0.000375, 4);
  });

  test("step breakdown matches individual calculateCost calls", () => {
    const result = handleEstimateWorkflowCost(
      {
        steps: [
          {
            tool_name: "s1",
            estimated_input_tokens: 500,
            estimated_output_tokens: 200,
            model: "gpt-4o",
          },
          {
            tool_name: "s2",
            estimated_input_tokens: 300,
            estimated_output_tokens: 100,
            model: "gpt-4o-mini",
          },
        ],
      },
      baseState,
      DEFAULT_PRICING,
    );

    // gpt-4o: (500 * 0.0025 + 200 * 0.01) / 1000 = (1.25 + 2) / 1000 = 0.00325
    // gpt-4o-mini: (300 * 0.00015 + 100 * 0.0006) / 1000 = (0.045 + 0.06) / 1000 = 0.000105
    expect(result.steps[0].estimated_cost_usd).toBeCloseTo(0.00325, 4);
    expect(result.steps[1].estimated_cost_usd).toBeCloseTo(0.000105, 4);
    expect(result.total_estimated_cost_usd).toBeCloseTo(0.003355, 4);
  });
});
