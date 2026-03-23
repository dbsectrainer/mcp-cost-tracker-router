import type { PricingTable } from "../pricing.js";
import { calculateCost } from "../pricing.js";
import type { SessionState } from "./session.js";

export interface WorkflowStep {
  tool_name: string;
  estimated_input_tokens: number;
  estimated_output_tokens: number;
  model?: string;
}

export interface EstimationParams {
  steps: WorkflowStep[];
}

export interface StepEstimate {
  tool_name: string;
  model: string;
  estimated_input_tokens: number;
  estimated_output_tokens: number;
  estimated_cost_usd: number;
}

export interface EstimationResult {
  total_estimated_cost_usd: number;
  steps: StepEstimate[];
  high_cost_warning?: string;
  disclaimer: string;
  note: string;
}

// Threshold above which a high-cost warning is emitted
const HIGH_COST_THRESHOLD_USD = 1.0;

export function handleEstimateWorkflowCost(
  params: EstimationParams,
  state: SessionState,
  pricingTable: PricingTable,
): EstimationResult {
  const stepEstimates: StepEstimate[] = params.steps.map((step) => {
    const model = step.model ?? state.model;
    const cost = calculateCost(
      step.estimated_input_tokens,
      step.estimated_output_tokens,
      model,
      pricingTable,
    );
    return {
      tool_name: step.tool_name,
      model,
      estimated_input_tokens: step.estimated_input_tokens,
      estimated_output_tokens: step.estimated_output_tokens,
      estimated_cost_usd: cost,
    };
  });

  const total = stepEstimates.reduce((sum, s) => sum + s.estimated_cost_usd, 0);

  const result: EstimationResult = {
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
