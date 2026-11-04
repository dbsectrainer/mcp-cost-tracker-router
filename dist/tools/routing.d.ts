import type { PricingTable } from "../pricing.js";
export interface RoutingParams {
    task_description: string;
    constraints?: {
        max_cost_usd?: number;
    };
}
export interface RoutingResult {
    recommended_model: string;
    reasoning: string;
    task_type: string;
    alternatives: Array<{
        model: string;
        rationale: string;
        cost_per_1k_input: number;
        cost_per_1k_output: number;
    }>;
    cost_per_1k_input: number;
    cost_per_1k_output: number;
    disclaimer: string;
    note: string;
}
export declare function handleSuggestModelRouting(params: RoutingParams, pricingTable: PricingTable): RoutingResult;
