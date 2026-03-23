function matchesKeyword(text, keyword) {
    // Use word-boundary matching to avoid substring false-positives
    // e.g. "class" should not match "classify"
    const escaped = keyword.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
    // If keyword contains a space, treat it as a phrase
    if (keyword.includes(" ")) {
        return text.includes(keyword);
    }
    return new RegExp(`\\b${escaped}\\b`).test(text);
}
function classifyTask(description) {
    const lower = description.toLowerCase();
    // Complex analysis / large context keywords
    const complexKeywords = [
        "complex",
        "analyze",
        "analysis",
        "large context",
        "document",
        "research",
        "comprehensive",
        "detailed report",
        "synthesis",
        "architecture",
        "design document",
        "review entire",
        "full codebase",
        "long",
    ];
    if (complexKeywords.some((kw) => matchesKeyword(lower, kw))) {
        return "complex";
    }
    // Multi-step reasoning / code generation keywords
    const reasoningKeywords = [
        "code",
        "generate",
        "implement",
        "refactor",
        "debug",
        "reason",
        "step",
        "multi",
        "algorithm",
        "function",
        "class",
        "module",
        "fix bug",
        "solve",
        "explain",
        "how to",
        "plan",
        "strategy",
        "migrate",
        "transform",
    ];
    if (reasoningKeywords.some((kw) => matchesKeyword(lower, kw))) {
        return "reasoning";
    }
    // Default: simple classification / Q&A
    return "simple";
}
// Use a small representative token count (100 input / 50 output) for
// constraint checking so that cheap models clearly fit within tight budgets.
function modelExceedsConstraint(model, maxCostUsd, pricingTable, estimatedInputTokens = 100, estimatedOutputTokens = 50) {
    const pricing = pricingTable[model];
    if (!pricing)
        return false;
    const estimatedCost = (estimatedInputTokens * pricing.input +
        estimatedOutputTokens * pricing.output) /
        1000;
    return estimatedCost > maxCostUsd;
}
export function handleSuggestModelRouting(params, pricingTable) {
    const taskType = classifyTask(params.task_description);
    const maxCost = params.constraints?.max_cost_usd;
    // Model preferences by task type
    const taskModelMap = {
        simple: "claude-haiku-4-5",
        reasoning: "claude-sonnet-4-6",
        complex: "claude-opus-4-6",
    };
    const taskLabels = {
        simple: "Classification / Simple Q&A",
        reasoning: "Multi-step reasoning / Code generation",
        complex: "Complex analysis / Large context",
    };
    const taskReasoningMap = {
        simple: "Task appears to be a simple classification or Q&A query. claude-haiku-4-5 provides fast, cost-efficient responses for straightforward tasks.",
        reasoning: "Task involves code generation or multi-step reasoning. claude-sonnet-4-6 offers the best balance of capability and cost for these workloads.",
        complex: "Task requires deep analysis or handling of large context. claude-opus-4-6 delivers the highest capability for complex, context-heavy tasks.",
    };
    let recommendedModel = taskModelMap[taskType];
    let reasoning = taskReasoningMap[taskType];
    // If cost constraint is set, downgrade if necessary
    if (maxCost !== undefined) {
        const fallbackOrder = [
            "claude-opus-4-6",
            "claude-sonnet-4-6",
            "claude-haiku-4-5",
            "gemini-1.5-pro",
            "gemini-2.0-flash",
            "gemini-1.5-flash",
            "gpt-4o",
            "gpt-4o-mini",
        ];
        if (modelExceedsConstraint(recommendedModel, maxCost, pricingTable)) {
            const cheaper = fallbackOrder
                .slice(fallbackOrder.indexOf(recommendedModel) + 1)
                .find((m) => !modelExceedsConstraint(m, maxCost, pricingTable));
            if (cheaper) {
                reasoning = `${reasoning} However, due to cost constraint of $${maxCost.toFixed(6)}, downgrading recommendation to ${cheaper}.`;
                recommendedModel = cheaper;
            }
            else {
                reasoning = `${reasoning} Warning: no model in the pricing table fits within cost constraint $${maxCost.toFixed(6)} for a typical 1K/0.5K token call.`;
            }
        }
    }
    const recommendedPricing = pricingTable[recommendedModel] ?? {
        input: 0.003,
        output: 0.015,
    };
    // Build alternatives (other models with reasoning)
    const alternativeCandidates = [
        {
            model: "claude-haiku-4-5",
            rationale: "Lowest cost Anthropic model; ideal for simple queries.",
        },
        {
            model: "claude-sonnet-4-6",
            rationale: "Balanced capability and cost; great for code and reasoning.",
        },
        {
            model: "claude-opus-4-6",
            rationale: "Highest capability; best for complex analysis.",
        },
        {
            model: "gemini-1.5-flash",
            rationale: "Very low cost Gemini model for high-volume simple tasks.",
        },
        {
            model: "gemini-2.0-flash",
            rationale: "Latest Gemini Flash; good balance for mid-tier tasks.",
        },
    ];
    const alternatives = alternativeCandidates
        .filter((a) => a.model !== recommendedModel && pricingTable[a.model])
        .slice(0, 3)
        .map((a) => ({
        model: a.model,
        rationale: a.rationale,
        cost_per_1k_input: pricingTable[a.model].input,
        cost_per_1k_output: pricingTable[a.model].output,
    }));
    return {
        recommended_model: recommendedModel,
        reasoning,
        task_type: taskLabels[taskType],
        alternatives,
        cost_per_1k_input: recommendedPricing.input,
        cost_per_1k_output: recommendedPricing.output,
        disclaimer: "Model recommendations are heuristic-based, not guaranteed.",
        note: "All costs are estimates based on token approximations.",
    };
}
