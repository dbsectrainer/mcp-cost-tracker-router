#!/usr/bin/env node
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { createMcpServer } from "./server.js";
import { startHttpServer } from "./http-server.js";
async function main() {
    const argv = await yargs(hideBin(process.argv))
        .option("db", {
        alias: "db-path",
        type: "string",
        default: "~/.mcp/costs.db",
        description: "Path to SQLite database file",
    })
        .option("budget-alert", {
        type: "number",
        description: "Initial budget threshold in USD",
    })
        .option("default-model", {
        type: "string",
        default: "claude-sonnet-4-6",
        description: "Default model for cost attribution",
    })
        .option("enforce-budget", {
        type: "boolean",
        default: false,
        description: "Block calls when budget is exceeded (requires --budget-alert)",
    })
        .option("pricing-table", {
        type: "string",
        description: "Path to custom JSON pricing file",
    })
        .option("http-port", {
        type: "number",
        description: "Start in HTTP mode using Streamable HTTP transport on this port",
    })
        .check((argv) => {
        if (argv["enforce-budget"] && !argv["budget-alert"]) {
            throw new Error("--enforce-budget requires --budget-alert to be set");
        }
        return true;
    })
        .help()
        .alias("help", "h")
        .parse();
    const serverConfig = {
        dbPath: argv.db,
        defaultModel: argv["default-model"],
        budgetAlert: argv["budget-alert"],
        enforceBudget: argv["enforce-budget"],
        pricingTablePath: argv["pricing-table"],
    };
    const httpPort = argv["http-port"];
    if (httpPort !== undefined) {
        await startHttpServer(httpPort, serverConfig);
    }
    else {
        await createMcpServer(serverConfig);
    }
}
main().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
});
