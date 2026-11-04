export declare const DEFAULT_PRICING: Record<string, {
    input: number;
    output: number;
}>;
export type PricingTable = typeof DEFAULT_PRICING;
export declare function calculateCost(inputTokens: number, outputTokens: number, model: string, pricingTable: PricingTable): number;
export declare function loadPricingTable(filePath?: string): PricingTable;
