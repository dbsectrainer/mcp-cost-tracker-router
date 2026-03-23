import { describe, test, expect } from "vitest";
import { writeFileSync, unlinkSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  calculateCost,
  DEFAULT_PRICING,
  loadPricingTable,
} from "../src/pricing.js";

describe("calculateCost", () => {
  test("calculates claude-sonnet-4-6 cost correctly", () => {
    // (1000 * 0.003 + 500 * 0.015) / 1000 = (3 + 7.5) / 1000 = 0.0105
    const cost = calculateCost(1000, 500, "claude-sonnet-4-6", DEFAULT_PRICING);
    expect(cost).toBeCloseTo(0.0105, 4);
  });

  test("calculates claude-opus-4-6 cost correctly", () => {
    // (2000 * 0.015 + 1000 * 0.075) / 1000 = (30 + 75) / 1000 = 0.105
    const cost = calculateCost(2000, 1000, "claude-opus-4-6", DEFAULT_PRICING);
    expect(cost).toBeCloseTo(0.105, 4);
  });

  test("calculates claude-haiku-4-5 cost correctly", () => {
    // (1000 * 0.0008 + 1000 * 0.004) / 1000 = (0.8 + 4) / 1000 = 0.0048
    const cost = calculateCost(1000, 1000, "claude-haiku-4-5", DEFAULT_PRICING);
    expect(cost).toBeCloseTo(0.0048, 4);
  });

  test("falls back to claude-sonnet-4-6 pricing for unknown model", () => {
    const costSonnet = calculateCost(
      500,
      200,
      "claude-sonnet-4-6",
      DEFAULT_PRICING,
    );
    const costUnknown = calculateCost(
      500,
      200,
      "unknown-model-xyz",
      DEFAULT_PRICING,
    );
    expect(costUnknown).toBeCloseTo(costSonnet, 6);
  });

  test("calculates gpt-4o cost correctly", () => {
    // (1000 * 0.0025 + 1000 * 0.010) / 1000 = (2.5 + 10) / 1000 = 0.0125
    const cost = calculateCost(1000, 1000, "gpt-4o", DEFAULT_PRICING);
    expect(cost).toBeCloseTo(0.0125, 4);
  });

  test("calculates gpt-4o-mini cost correctly", () => {
    // (1000 * 0.00015 + 1000 * 0.0006) / 1000 = (0.15 + 0.6) / 1000 = 0.00075
    const cost = calculateCost(1000, 1000, "gpt-4o-mini", DEFAULT_PRICING);
    expect(cost).toBeCloseTo(0.00075, 4);
  });

  test("returns 0 cost for 0 tokens", () => {
    const cost = calculateCost(0, 0, "claude-sonnet-4-6", DEFAULT_PRICING);
    expect(cost).toBe(0);
  });

  test("handles large token counts correctly", () => {
    // (100000 * 0.003 + 50000 * 0.015) / 1000 = (300 + 750) / 1000 = 1.05
    const cost = calculateCost(
      100000,
      50000,
      "claude-sonnet-4-6",
      DEFAULT_PRICING,
    );
    expect(cost).toBeCloseTo(1.05, 4);
  });

  test("uses custom pricing table", () => {
    const customPricing = {
      ...DEFAULT_PRICING,
      "custom-model": { input: 0.001, output: 0.002 },
    };
    // (1000 * 0.001 + 1000 * 0.002) / 1000 = (1 + 2) / 1000 = 0.003
    const cost = calculateCost(1000, 1000, "custom-model", customPricing);
    expect(cost).toBeCloseTo(0.003, 4);
  });
});

describe("calculateCost - Gemini models", () => {
  test("calculates gemini-1.5-pro cost correctly", () => {
    // (1000 * 0.00125 + 1000 * 0.005) / 1000 = (1.25 + 5) / 1000 = 0.00625
    const cost = calculateCost(1000, 1000, "gemini-1.5-pro", DEFAULT_PRICING);
    expect(cost).toBeCloseTo(0.00625, 4);
  });

  test("calculates gemini-1.5-flash cost correctly", () => {
    // (1000 * 0.000075 + 1000 * 0.0003) / 1000 = (0.075 + 0.3) / 1000 = 0.000375
    const cost = calculateCost(1000, 1000, "gemini-1.5-flash", DEFAULT_PRICING);
    expect(cost).toBeCloseTo(0.000375, 4);
  });

  test("calculates gemini-2.0-flash cost correctly", () => {
    // (1000 * 0.0001 + 1000 * 0.0004) / 1000 = (0.1 + 0.4) / 1000 = 0.0005
    const cost = calculateCost(1000, 1000, "gemini-2.0-flash", DEFAULT_PRICING);
    expect(cost).toBeCloseTo(0.0005, 4);
  });

  test("gemini-1.5-pro input price is correct to 4 decimal places", () => {
    expect(DEFAULT_PRICING["gemini-1.5-pro"].input).toBeCloseTo(0.00125, 4);
  });

  test("gemini-1.5-flash input price is correct to 4 decimal places", () => {
    expect(DEFAULT_PRICING["gemini-1.5-flash"].input).toBeCloseTo(0.000075, 4);
  });

  test("gemini-2.0-flash input price is correct to 4 decimal places", () => {
    expect(DEFAULT_PRICING["gemini-2.0-flash"].input).toBeCloseTo(0.0001, 4);
  });

  test("gemini-1.5-pro output price is correct to 4 decimal places", () => {
    expect(DEFAULT_PRICING["gemini-1.5-pro"].output).toBeCloseTo(0.005, 4);
  });

  test("gemini-1.5-flash output price is correct to 4 decimal places", () => {
    expect(DEFAULT_PRICING["gemini-1.5-flash"].output).toBeCloseTo(0.0003, 4);
  });

  test("gemini-2.0-flash output price is correct to 4 decimal places", () => {
    expect(DEFAULT_PRICING["gemini-2.0-flash"].output).toBeCloseTo(0.0004, 4);
  });
});

describe("DEFAULT_PRICING", () => {
  test("contains all required models", () => {
    expect(DEFAULT_PRICING).toHaveProperty("claude-opus-4-6");
    expect(DEFAULT_PRICING).toHaveProperty("claude-sonnet-4-6");
    expect(DEFAULT_PRICING).toHaveProperty("claude-haiku-4-5");
    expect(DEFAULT_PRICING).toHaveProperty("gpt-4o");
    expect(DEFAULT_PRICING).toHaveProperty("gpt-4o-mini");
    expect(DEFAULT_PRICING).toHaveProperty("gemini-1.5-pro");
    expect(DEFAULT_PRICING).toHaveProperty("gemini-1.5-flash");
    expect(DEFAULT_PRICING).toHaveProperty("gemini-2.0-flash");
  });

  test("all models have input and output prices", () => {
    for (const [_model, pricing] of Object.entries(DEFAULT_PRICING)) {
      expect(pricing).toHaveProperty("input");
      expect(pricing).toHaveProperty("output");
      expect(typeof pricing.input).toBe("number");
      expect(typeof pricing.output).toBe("number");
      expect(pricing.input).toBeGreaterThan(0);
      expect(pricing.output).toBeGreaterThan(0);
    }
  });
});

describe("loadPricingTable", () => {
  test("returns DEFAULT_PRICING when no file path is given", () => {
    const result = loadPricingTable();
    expect(result).toEqual(DEFAULT_PRICING);
  });

  test("returns DEFAULT_PRICING when undefined is passed", () => {
    const result = loadPricingTable(undefined);
    expect(result).toEqual(DEFAULT_PRICING);
  });

  test("loads and merges a custom pricing table from a JSON file", () => {
    const pricingFilePath = join(tmpdir(), `pricing-test-${Date.now()}.json`);
    const customPricing = {
      "custom-model-x": { input: 0.002, output: 0.008 },
    };
    writeFileSync(pricingFilePath, JSON.stringify(customPricing), "utf-8");

    try {
      const result = loadPricingTable(pricingFilePath);
      // Should contain the custom model
      expect(result["custom-model-x"]).toEqual({ input: 0.002, output: 0.008 });
      // Should still contain default models
      expect(result["claude-sonnet-4-6"]).toBeDefined();
      expect(result["gpt-4o"]).toBeDefined();
    } finally {
      if (existsSync(pricingFilePath)) unlinkSync(pricingFilePath);
    }
  });

  test("custom pricing overrides DEFAULT_PRICING for matching model", () => {
    const pricingFilePath = join(
      tmpdir(),
      `pricing-override-${Date.now()}.json`,
    );
    const customPricing = {
      "claude-sonnet-4-6": { input: 0.999, output: 0.999 },
    };
    writeFileSync(pricingFilePath, JSON.stringify(customPricing), "utf-8");

    try {
      const result = loadPricingTable(pricingFilePath);
      expect(result["claude-sonnet-4-6"]).toEqual({
        input: 0.999,
        output: 0.999,
      });
    } finally {
      if (existsSync(pricingFilePath)) unlinkSync(pricingFilePath);
    }
  });

  test("returns DEFAULT_PRICING when file does not exist", () => {
    const result = loadPricingTable("/nonexistent/path/pricing.json");
    expect(result).toEqual(DEFAULT_PRICING);
  });

  test("returns DEFAULT_PRICING when file contains invalid JSON", () => {
    const pricingFilePath = join(tmpdir(), `pricing-bad-${Date.now()}.json`);
    writeFileSync(pricingFilePath, "not valid json {{{{", "utf-8");

    try {
      const result = loadPricingTable(pricingFilePath);
      expect(result).toEqual(DEFAULT_PRICING);
    } finally {
      if (existsSync(pricingFilePath)) unlinkSync(pricingFilePath);
    }
  });
});
