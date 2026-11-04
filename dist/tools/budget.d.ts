import Database from "better-sqlite3";
import type { SessionState } from "./session.js";
export declare function handleSetBudgetAlert(db: Database.Database, state: SessionState, params: {
    threshold_usd: number;
}): {
    updatedState: Pick<SessionState, "budgetThresholdUsd">;
    result: object;
};
