import express from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer } from "./server.js";
import { createAuthMiddleware } from "./auth.js";
import { createRateLimiter } from "./rate-limiter.js";
export async function startHttpServer(port, config) {
  const app = express();
  app.use(express.json());
  const authMiddleware = createAuthMiddleware();
  const rateLimiterMiddleware = createRateLimiter(60, 60000);
  app.post("/mcp", authMiddleware, rateLimiterMiddleware, async (req, res) => {
    const server = createServer(config);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });
  app.get("/mcp", authMiddleware, rateLimiterMiddleware, async (req, res) => {
    const server = createServer(config);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    await server.connect(transport);
    await transport.handleRequest(req, res);
  });
  app.delete("/mcp", (_req, res) => {
    res.status(405).json({ error: "Method not allowed" });
  });
  app.listen(port, () => {
    console.error(
      `MCP Cost Tracker Router HTTP server listening on port ${port}`,
    );
  });
}
