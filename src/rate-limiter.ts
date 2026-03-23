import type { RequestHandler, Request, Response, NextFunction } from "express";

interface RequestRecord {
  timestamps: number[];
}

export function createRateLimiter(
  maxRequests: number = 60,
  windowMs: number = 60000,
): RequestHandler {
  const store = new Map<string, RequestRecord>();

  return (req: Request, res: Response, next: NextFunction): void => {
    const key =
      (req.headers["x-api-key"] as string | undefined) ?? req.ip ?? "unknown";

    const now = Date.now();
    const windowStart = now - windowMs;

    let record = store.get(key);
    if (!record) {
      record = { timestamps: [] };
      store.set(key, record);
    }

    // Remove timestamps outside the current window
    record.timestamps = record.timestamps.filter((ts) => ts > windowStart);

    if (record.timestamps.length >= maxRequests) {
      res.status(429).json({
        error: "Too Many Requests",
        retryAfter: Math.ceil(windowMs / 1000),
      });
      return;
    }

    record.timestamps.push(now);
    next();
  };
}
