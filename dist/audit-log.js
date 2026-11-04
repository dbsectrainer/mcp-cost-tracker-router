import { appendFileSync, readFileSync, mkdirSync, existsSync } from "fs";
import { homedir } from "os";
import { dirname } from "path";
export class AuditLog {
    filePath;
    constructor(filePath) {
        this.filePath = filePath ?? `${homedir()}/.mcp/cost-tracker-audit.jsonl`;
        const dir = dirname(this.filePath);
        if (!existsSync(dir)) {
            mkdirSync(dir, { recursive: true });
        }
    }
    record(entry) {
        const line = JSON.stringify(entry) + "\n";
        appendFileSync(this.filePath, line, "utf-8");
    }
    export(from, to) {
        if (!existsSync(this.filePath)) {
            return [];
        }
        const raw = readFileSync(this.filePath, "utf-8");
        const lines = raw.split("\n").filter((l) => l.trim() !== "");
        const entries = lines.map((l) => JSON.parse(l));
        return entries.filter((e) => {
            if (from && e.timestamp < from)
                return false;
            if (to && e.timestamp > to)
                return false;
            return true;
        });
    }
}
