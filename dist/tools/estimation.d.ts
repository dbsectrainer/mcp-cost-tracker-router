import type { PricingTable } from "../pricing.js";
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
export declare function handleEstimateWorkflowCost(
  params: EstimationParams,
  state: SessionState,
  pricingTable: PricingTable,
): EstimationResult;
