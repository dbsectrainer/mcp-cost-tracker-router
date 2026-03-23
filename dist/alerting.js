import { request as httpsRequest } from "https";
function postSlackMessage(webhookUrl, text) {
    return new Promise((resolve, reject) => {
        const body = JSON.stringify({
            blocks: [
                {
                    type: "section",
                    text: { type: "mrkdwn", text },
                },
            ],
        });
        const url = new URL(webhookUrl);
        const options = {
            hostname: url.hostname,
            path: url.pathname + url.search,
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(body),
            },
        };
        const req = httpsRequest(options, (res) => {
            res.resume();
            res.on("end", () => resolve());
        });
        req.on("error", reject);
        req.write(body);
        req.end();
    });
}
export async function checkBudgetAlerts(db, channels) {
    if (!channels.slackWebhook)
        return;
    // Find sessions with budget thresholds set
    const rows = db
        .prepare(`
    SELECT
      s.id,
      s.budget_threshold_usd,
      COALESCE(SUM(tu.cost_usd), 0) AS total_cost_usd
    FROM sessions s
    LEFT JOIN tool_usage tu ON tu.session_id = s.id
    WHERE s.budget_threshold_usd IS NOT NULL
    GROUP BY s.id, s.budget_threshold_usd
  `)
        .all();
    const alerts = [];
    for (const row of rows) {
        if (row.budget_threshold_usd === null)
            continue;
        const pct = (row.total_cost_usd / row.budget_threshold_usd) * 100;
        if (pct >= 80 && pct < 100) {
            alerts.push(`:warning: *Budget Alert* — Session \`${row.id}\` is at *${pct.toFixed(1)}%* of its $${row.budget_threshold_usd.toFixed(4)} budget ($${row.total_cost_usd.toFixed(6)} spent).`);
        }
        else if (pct >= 100) {
            alerts.push(`:red_circle: *Budget Exceeded* — Session \`${row.id}\` has exceeded its $${row.budget_threshold_usd.toFixed(4)} budget ($${row.total_cost_usd.toFixed(6)} spent, ${pct.toFixed(1)}%).`);
        }
    }
    for (const alertText of alerts) {
        await postSlackMessage(channels.slackWebhook, alertText);
    }
}
