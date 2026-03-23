import { readFileSync, existsSync } from "fs";
import { homedir } from "os";
import { load as loadYaml } from "js-yaml";
const DEFAULT_POLICY_PATH = `${homedir()}/.mcp/routing-policy.yaml`;
function loadPolicy(policyPath) {
    if (!existsSync(policyPath)) {
        return { rules: [] };
    }
    try {
        const raw = readFileSync(policyPath, "utf-8");
        const parsed = loadYaml(raw);
        return parsed ?? { rules: [] };
    }
    catch {
        return { rules: [] };
    }
}
export function enforceRouting(taskType, requestedModel, policyPath) {
    const resolvedPath = policyPath ?? DEFAULT_POLICY_PATH;
    const policy = loadPolicy(resolvedPath);
    const matchingRule = policy.rules.find((r) => r.task_type.toLowerCase() === taskType.toLowerCase());
    if (!matchingRule) {
        return {
            allowed: true,
            model: requestedModel,
            reason: `No routing rule found for task type "${taskType}"`,
        };
    }
    const preferredModel = matchingRule.preferred_model ?? requestedModel;
    if (matchingRule.preferred_model &&
        matchingRule.preferred_model !== requestedModel) {
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
