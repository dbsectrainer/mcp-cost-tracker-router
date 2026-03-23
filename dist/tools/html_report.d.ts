import Database from "better-sqlite3";
import type { SessionState } from "./session.js";
export declare function handleExportSpendReport(
  db: Database.Database,
  state: SessionState,
): string;
