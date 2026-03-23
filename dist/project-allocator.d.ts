import Database from "better-sqlite3";
export interface ProjectCostReport {
  project: string;
  total_cost_usd: number;
  session_count: number;
  top_tools: {
    tool: string;
    cost: number;
  }[];
}
export declare function initProjectTables(db: Database.Database): void;
export declare function tagSession(
  db: Database.Database,
  sessionId: string,
  projectName: string,
): void;
export declare function setProjectBudget(
  db: Database.Database,
  projectName: string,
  budgetUsd: number | null,
): void;
export declare function getProjectCosts(
  db: Database.Database,
  projectName: string,
  since?: string,
): ProjectCostReport;
