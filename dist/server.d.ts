import { Server } from "@modelcontextprotocol/sdk/server/index.js";
export interface ServerConfig {
    dbPath: string;
    defaultModel: string;
    budgetAlert?: number;
    enforceBudget: boolean;
    pricingTablePath?: string;
}
export declare function isCancelled(requestId: string): boolean;
/**
 * Creates a fully configured MCP Server instance with all request handlers
 * registered but without connecting to any transport. Use this when you need
 * to attach your own transport (e.g. StreamableHTTPServerTransport).
 */
export declare function createServer(config?: ServerConfig): Server;
export declare function createMcpServer(config: ServerConfig): Promise<void>;
