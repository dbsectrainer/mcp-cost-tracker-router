import { updateSessionBudget } from "../db.js";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
export function handleSetBudgetAlert(db, state, params) {
    if (params.threshold_usd <= 0) {
        throw new McpError(ErrorCode.InvalidParams, "threshold_usd must be a positive number greater than 0");
    }
    try {
        updateSessionBudget(db, state.sessionId, params.threshold_usd);
    }
    catch (err) {
        throw new McpError(ErrorCode.InternalError, `Failed to update budget threshold: ${String(err)}`);
    }
    return {
        updatedState: { budgetThresholdUsd: params.threshold_usd },
        result: {
            session_id: state.sessionId,
            budget_threshold_usd: params.threshold_usd,
            message: `Budget alert set to $${params.threshold_usd.toFixed(6)}. You will be warned when session costs exceed this threshold.`,
        },
    };
}
