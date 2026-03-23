import { appendFileSync, readFileSync, mkdirSync, existsSync } from "fs";
import { homedir } from "os";
import { dirname } from "path";

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

export class AuditLog {
  private readonly filePath: string;

  constructor(filePath?: string) {
    this.filePath = filePath ?? `${homedir()}/.mcp/cost-tracker-audit.jsonl`;
    const dir = dirname(this.filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  record(entry: AuditEntry): void {
    const line = JSON.stringify(entry) + "\n";
    appendFileSync(this.filePath, line, "utf-8");
  }

  export(from?: string, to?: string): AuditEntry[] {
    if (!existsSync(this.filePath)) {
      return [];
    }

    const raw = readFileSync(this.filePath, "utf-8");
    const lines = raw.split("\n").filter((l) => l.trim() !== "");
    const entries: AuditEntry[] = lines.map((l) => JSON.parse(l) as AuditEntry);

    return entries.filter((e) => {
      if (from && e.timestamp < from) return false;
      if (to && e.timestamp > to) return false;
      return true;
    });
  }
}
