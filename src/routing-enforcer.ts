import { readFileSync, existsSync } from "fs";
import { homedir } from "os";
import { load as loadYaml } from "js-yaml";

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

const DEFAULT_POLICY_PATH = `${homedir()}/.mcp/routing-policy.yaml`;

function loadPolicy(policyPath: string): RoutingPolicy {
  if (!existsSync(policyPath)) {
    return { rules: [] };
  }
  try {
    const raw = readFileSync(policyPath, "utf-8");
    const parsed = loadYaml(raw) as RoutingPolicy;
    return parsed ?? { rules: [] };
  } catch {
    return { rules: [] };
  }
}

export function enforceRouting(
  taskType: string,
  requestedModel: string,
  policyPath?: string,
): RoutingDecision {
  const resolvedPath = policyPath ?? DEFAULT_POLICY_PATH;
  const policy = loadPolicy(resolvedPath);

  const matchingRule = policy.rules.find(
    (r) => r.task_type.toLowerCase() === taskType.toLowerCase(),
  );

  if (!matchingRule) {
    return {
      allowed: true,
      model: requestedModel,
      reason: `No routing rule found for task type "${taskType}"`,
    };
  }

  const preferredModel = matchingRule.preferred_model ?? requestedModel;

  if (
    matchingRule.preferred_model &&
    matchingRule.preferred_model !== requestedModel
  ) {
    return {
      allowed: false,
      model: preferredModel,
      reason: `Task type "${taskType}" requires model "${preferredModel}", but "${requestedModel}" was requested`,
    };
  }

  return {
    allowed: true,
    model: preferredModel,
    reason: `Model "${preferredModel}" satisfies routing policy for task type "${taskType}"`,
  };
}
