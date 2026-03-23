export interface RoutingRule {
  task_type: string;
  max_cost_per_1k_tokens?: number;
  preferred_model?: string;
  min_context_window?: number;
}
export interface RoutingPolicy {
  rules: RoutingRule[];
}
export interface RoutingDecision {
  allowed: boolean;
  model: string;
  reason?: string;
}
export declare function enforceRouting(
  taskType: string,
  requestedModel: string,
  policyPath?: string,
): RoutingDecision;
