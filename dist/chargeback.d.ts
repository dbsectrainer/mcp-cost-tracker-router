import Database from "better-sqlite3";
export interface ToolBreakdown {
    tool: string;
    cost: number;
}
export interface ChargebackGroup {
    name: string;
    cost_usd: number;
    sessions: number;
    tool_breakdown: ToolBreakdown[];
}
export interface ChargebackReport {
    period: string;
    groups: ChargebackGroup[];
}
export declare function generateChargebackReport(db: Database.Database, from: string, to: string, groupBy: "project" | "session"): ChargebackReport;
export declare function chargebackToCSV(report: ChargebackReport): string;
