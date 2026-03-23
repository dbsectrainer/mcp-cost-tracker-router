import Database from "better-sqlite3";
import type { SpendPeriod } from "../db.js";
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
export declare function handleGetSpendHistoryWithProgress(db: Database.Database, params: {
    period?: SpendPeriod;
    requestId?: string;
}, server: Server): Promise<object>;
export declare function handleGetSpendHistory(db: Database.Database, params: {
    period?: SpendPeriod;
}): object;
