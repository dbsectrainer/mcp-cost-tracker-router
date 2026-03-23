import { calculateCost } from "../pricing.js";
// Threshold above which a high-cost warning is emitted
const HIGH_COST_THRESHOLD_USD = 1.0;
export function handleEstimateWorkflowCost(params, state, pricingTable) {
    const stepEstimates = params.steps.map((step) => {
        const model = step.model ?? state.model;
        const cost = calculateCost(step.estimated_input_tokens, step.estimated_output_tokens, model, pricingTable);
        return {
            tool_name: step.tool_name,
            model,
            estimated_input_tokens: step.estimated_input_tokens,
            estimated_output_tokens: step.estimated_output_tokens,
            estimated_cost_usd: cost,
        };
    });
    const total = stepEstimates.reduce((sum, s) => sum + s.estimated_cost_usd, 0);
    const result = {
        total_estimated_cost_usd: total,
        steps: stepEstimates,
        disclaimer: "ESTIMATE - not actual billed amount",
        note: "All costs are estimates based on token approximations.",
    };
    if (total >= HIGH_COST_THRESHOLD_USD) {
        result.high_cost_warning = `Estimated workflow cost $${total.toFixed(6)} exceeds $${HIGH_COST_THRESHOLD_USD.toFixed(2)}. Consider using a cheaper model or reducing token counts.`;
    }
    return result;
}
