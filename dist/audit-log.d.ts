export interface AuditEntry {
  timestamp: string;
  session_id: string;
  tool_name: string;
  tokens: number;
  cost_usd: number;
  budget_usd: number | null;
  decision: "allowed" | "blocked";
  reason: string;
}
export declare class AuditLog {
  private readonly filePath;
  constructor(filePath?: string);
  record(entry: AuditEntry): void;
  export(from?: string, to?: string): AuditEntry[];
}
