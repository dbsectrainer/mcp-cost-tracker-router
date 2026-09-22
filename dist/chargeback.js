export function generateChargebackReport(db, from, to, groupBy) {
  const fromTs = new Date(from).getTime();
  const toTs = new Date(to).getTime();
  const period = `${from} to ${to}`;
  if (groupBy === "project") {
    const projectNames = db
      .prepare(
        `
      SELECT DISTINCT sp.project_name
      FROM session_projects sp
      INNER JOIN tool_usage tu ON tu.session_id = sp.session_id
      WHERE tu.recorded_at >= ? AND tu.recorded_at <= ?
    `,
      )
      .all(fromTs, toTs);
    const groups = projectNames.map(({ project_name }) => {
      const totRow = db
        .prepare(
          `
        SELECT
          COALESCE(SUM(tu.cost_usd), 0) AS cost_usd,
          COUNT(DISTINCT tu.session_id) AS sessions
        FROM tool_usage tu
        INNER JOIN session_projects sp ON sp.session_id = tu.session_id
        WHERE sp.project_name = ?
          AND tu.recorded_at >= ? AND tu.recorded_at <= ?
      `,
        )
        .get(project_name, fromTs, toTs);
      const toolRows = db
        .prepare(
          `
        SELECT
          tu.tool_name AS tool,
          SUM(tu.cost_usd) AS cost
        FROM tool_usage tu
        INNER JOIN session_projects sp ON sp.session_id = tu.session_id
        WHERE sp.project_name = ?
          AND tu.recorded_at >= ? AND tu.recorded_at <= ?
        GROUP BY tu.tool_name
        ORDER BY cost DESC
      `,
        )
        .all(project_name, fromTs, toTs);
      return {
        name: project_name,
        cost_usd: totRow.cost_usd,
        sessions: totRow.sessions,
        tool_breakdown: toolRows,
      };
    });
    return { period, groups };
  } else {
    // groupBy === "session"
    const sessionRows = db
      .prepare(
        `
      SELECT DISTINCT session_id
      FROM tool_usage
      WHERE recorded_at >= ? AND recorded_at <= ?
    `,
      )
      .all(fromTs, toTs);
    const groups = sessionRows.map(({ session_id }) => {
      const totRow = db
        .prepare(
          `
        SELECT
          COALESCE(SUM(cost_usd), 0) AS cost_usd,
          COUNT(DISTINCT session_id) AS sessions
        FROM tool_usage
        WHERE session_id = ?
          AND recorded_at >= ? AND recorded_at <= ?
      `,
        )
        .get(session_id, fromTs, toTs);
      const toolRows = db
        .prepare(
          `
        SELECT
          tool_name AS tool,
          SUM(cost_usd) AS cost
        FROM tool_usage
        WHERE session_id = ?
          AND recorded_at >= ? AND recorded_at <= ?
        GROUP BY tool_name
        ORDER BY cost DESC
      `,
        )
        .all(session_id, fromTs, toTs);
      return {
        name: session_id,
        cost_usd: totRow.cost_usd,
        sessions: totRow.sessions,
        tool_breakdown: toolRows,
      };
    });
    return { period, groups };
  }
}
export function chargebackToCSV(report) {
  const lines = ["group_name,cost_usd,sessions,tool,tool_cost"];
  for (const group of report.groups) {
    if (group.tool_breakdown.length === 0) {
      lines.push(`"${group.name}",${group.cost_usd},${group.sessions},,`);
    } else {
      for (const tb of group.tool_breakdown) {
        lines.push(
          `"${group.name}",${group.cost_usd},${group.sessions},"${tb.tool}",${tb.cost}`,
        );
      }
    }
  }
  return lines.join("\n");
}
