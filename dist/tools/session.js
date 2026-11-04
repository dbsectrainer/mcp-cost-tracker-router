import { getSession, getSessionTotals, getToolCosts, endSession, createSession, recordToolUsage, } from "../db.js";
import { calculateCost } from "../pricing.js";
export function handleGetSessionCost(db, state) {
    const session = getSession(db, state.sessionId);
    const totals = getSessionTotals(db, state.sessionId);
    const budgetThreshold = session?.budget_threshold_usd ?? state.budgetThresholdUsd;
    const budgetRemaining = budgetThreshold !== null ? budgetThreshold - totals.total_cost_usd : null;
    return {
        session_id: state.sessionId,
        model: state.model,
        input_tokens: totals.input_tokens,
        output_tokens: totals.output_tokens,
        total_cost_usd: totals.total_cost_usd,
        budget_threshold_usd: budgetThreshold,
        budget_remaining_usd: budgetRemaining,
        note: "All costs are estimates based on token approximations.",
    };
}
export function handleGetToolCosts(db, state) {
    const costs = getToolCosts(db, state.sessionId);
    return {
        session_id: state.sessionId,
        tools: costs,
        note: "All costs are estimates based on token approximations.",
    };
}
export function handleResetSession(db, state) {
    // End current session
    endSession(db, state.sessionId);
    // Create new session
    const newSessionId = crypto.randomUUID();
    createSession(db, newSessionId, state.model, state.budgetThresholdUsd ?? undefined);
    return {
        newSessionId,
        result: {
            previous_session_id: state.sessionId,
            new_session_id: newSessionId,
            message: "Session reset successfully. Starting fresh cost tracking.",
        },
    };
}
export function handleRecordUsage(db, state, pricingTable, params) {
    const model = params.model ?? state.model;
    const cost = calculateCost(params.input_tokens, params.output_tokens, model, pricingTable);
    const usageRecord = {
        id: crypto.randomUUID(),
        session_id: state.sessionId,
        tool_name: params.tool_name,
        model,
        input_tokens: params.input_tokens,
        output_tokens: params.output_tokens,
        cost_usd: cost,
        recorded_at: Date.now(),
    };
    recordToolUsage(db, usageRecord);
    // Refresh session totals for budget check
    const totals = getSessionTotals(db, state.sessionId);
    const session = getSession(db, state.sessionId);
    const budgetThreshold = session?.budget_threshold_usd ?? state.budgetThresholdUsd;
    const budgetWarning = budgetThreshold !== null && totals.total_cost_usd >= budgetThreshold
        ? `Budget alert: session cost $${totals.total_cost_usd.toFixed(6)} has exceeded threshold $${budgetThreshold.toFixed(6)}`
        : null;
    // Check if spend is at or above 80% of budget threshold
    let budgetWarning80pct = null;
    if (budgetThreshold !== null && budgetThreshold > 0) {
        const pct = (totals.total_cost_usd / budgetThreshold) * 100;
        if (pct >= 80 && pct < 100) {
            budgetWarning80pct = `Budget warning: at ${pct.toFixed(1)}% of threshold`;
        }
    }
    return {
        recorded: true,
        usage_id: usageRecord.id,
        tool_name: params.tool_name,
        model,
        input_tokens: params.input_tokens,
        output_tokens: params.output_tokens,
        cost_usd: cost,
        session_total_usd: totals.total_cost_usd,
        budget_warning: budgetWarning,
        budget_warning_80pct: budgetWarning80pct,
        note: "All costs are estimates based on token approximations.",
    };
}
