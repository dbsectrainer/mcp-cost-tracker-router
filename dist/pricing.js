import { readFileSync } from "fs";
// USD per 1K tokens
// Pricing versions tracked in CHANGELOG.md
export const DEFAULT_PRICING = {
  // Anthropic Claude models
  "claude-opus-4-6": { input: 0.015, output: 0.075 },
  "claude-sonnet-4-6": { input: 0.003, output: 0.015 },
  "claude-haiku-4-5": { input: 0.0008, output: 0.004 },
  // OpenAI GPT models
  "gpt-4o": { input: 0.0025, output: 0.01 },
  "gpt-4o-mini": { input: 0.00015, output: 0.0006 },
  // Google Gemini models
  "gemini-1.5-pro": { input: 0.00125, output: 0.005 },
  "gemini-1.5-flash": { input: 0.000075, output: 0.0003 },
  "gemini-2.0-flash": { input: 0.0001, output: 0.0004 },
};
export function calculateCost(inputTokens, outputTokens, model, pricingTable) {
  const pricing = pricingTable[model] ?? pricingTable["claude-sonnet-4-6"];
  return (inputTokens * pricing.input + outputTokens * pricing.output) / 1000;
}
export function loadPricingTable(filePath) {
  if (!filePath) {
    return DEFAULT_PRICING;
  }
  try {
    const raw = readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    // Merge with defaults so any missing models still work
    return { ...DEFAULT_PRICING, ...parsed };
  } catch (err) {
    console.error(`Failed to load pricing table from ${filePath}:`, err);
    return DEFAULT_PRICING;
  }
}
