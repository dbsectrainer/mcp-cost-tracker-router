import Database from "better-sqlite3";

export interface ProjectCostReport {
  project: string;
  total_cost_usd: number;
  session_count: number;
  top_tools: { tool: string; cost: number }[];
}

export function initProjectTables(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      budget_usd REAL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS session_projects (
      session_id TEXT NOT NULL,
      project_name TEXT NOT NULL,
      PRIMARY KEY (session_id, project_name)
    );
  `);
}

export function tagSession(
  db: Database.Database,
  sessionId: string,
  projectName: string,
): void {
  // Ensure project exists
  const now = new Date().toISOString();
  db.prepare(
    `
    INSERT OR IGNORE INTO projects (name, budget_usd, created_at)
    VALUES (?, NULL, ?)
  `,
  ).run(projectName, now);

  db.prepare(
    `
    INSERT OR REPLACE INTO session_projects (session_id, project_name)
    VALUES (?, ?)
  `,
  ).run(sessionId, projectName);
}

export function setProjectBudget(
  db: Database.Database,
  projectName: string,
  budgetUsd: number | null,
): void {
  const now = new Date().toISOString();
  db.prepare(
    `
    INSERT INTO projects (name, budget_usd, created_at)
    VALUES (?, ?, ?)
    ON CONFLICT(name) DO UPDATE SET budget_usd = excluded.budget_usd
  `,
  ).run(projectName, budgetUsd, now);
}

export function getProjectCosts(
  db: Database.Database,
  projectName: string,
  since?: string,
): ProjectCostReport {
  const sinceTs = since ? new Date(since).getTime() : 0;

  const totalRow = db
    .prepare(
      `
    SELECT
      COALESCE(SUM(tu.cost_usd), 0) AS total_cost_usd,
      COUNT(DISTINCT tu.session_id) AS session_count
    FROM tool_usage tu
    INNER JOIN session_projects sp ON sp.session_id = tu.session_id
    WHERE sp.project_name = ?
      AND tu.recorded_at >= ?
  `,
    )
    .get(projectName, sinceTs) as {
    total_cost_usd: number;
    session_count: number;
  };

  const topTools = db
    .prepare(
      `
    SELECT
      tu.tool_name AS tool,
      SUM(tu.cost_usd) AS cost
    FROM tool_usage tu
    INNER JOIN session_projects sp ON sp.session_id = tu.session_id
    WHERE sp.project_name = ?
      AND tu.recorded_at >= ?
    GROUP BY tu.tool_name
    ORDER BY cost DESC
    LIMIT 10
  `,
    )
    .all(projectName, sinceTs) as { tool: string; cost: number }[];

  return {
    project: projectName,
    total_cost_usd: totalRow.total_cost_usd,
    session_count: totalRow.session_count,
    top_tools: topTools,
  };
}
