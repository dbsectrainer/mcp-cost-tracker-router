import Database from "better-sqlite3";
export interface AlertChannels {
  slackWebhook?: string;
}
export declare function checkBudgetAlerts(
  db: Database.Database,
  channels: AlertChannels,
): Promise<void>;
