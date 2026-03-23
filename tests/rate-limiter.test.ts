import { describe, test, expect, vi, beforeEach } from "vitest";
import type { Request, Response, NextFunction } from "express";
import { createRateLimiter } from "../src/rate-limiter.js";

function mockReq(
  ip = "127.0.0.1",
  headers: Record<string, string> = {},
): Request {
  return { headers, ip } as unknown as Request;
}

function mockRes(): {
  statusCode: number;
  body: unknown;
  status: (c: number) => { json: (b: unknown) => void };
} {
  const res = {
    statusCode: 200,
    body: null as unknown,
    status(code: number) {
      res.statusCode = code;
      return {
        json(body: unknown) {
          res.body = body;
        },
      };
    },
  };
  return res;
}

describe("createRateLimiter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  test("allows requests within limit", () => {
    const limiter = createRateLimiter(3, 60000);
    const next = vi.fn();

    for (let i = 0; i < 3; i++) {
      const res = mockRes();
      limiter(mockReq(), res as unknown as Response, next as NextFunction);
      expect(res.statusCode).toBe(200);
    }
    expect(next).toHaveBeenCalledTimes(3);
  });

  test("returns 429 when limit is exceeded", () => {
    const limiter = createRateLimiter(2, 60000);
    const next = vi.fn();

    limiter(mockReq(), mockRes() as unknown as Response, next as NextFunction);
    limiter(mockReq(), mockRes() as unknown as Response, next as NextFunction);

    const res = mockRes();
    limiter(mockReq(), res as unknown as Response, next as NextFunction);
    expect(res.statusCode).toBe(429);
    expect(next).toHaveBeenCalledTimes(2);
  });

  test("resets after window expires", () => {
    const limiter = createRateLimiter(2, 60000);
    const next = vi.fn();

    limiter(mockReq(), mockRes() as unknown as Response, next as NextFunction);
    limiter(mockReq(), mockRes() as unknown as Response, next as NextFunction);

    // Advance time past the window
    vi.advanceTimersByTime(61000);

    const res = mockRes();
    limiter(mockReq(), res as unknown as Response, next as NextFunction);
    expect(res.statusCode).toBe(200);
    expect(next).toHaveBeenCalledTimes(3);
  });

  test("tracks different IPs separately", () => {
    const limiter = createRateLimiter(1, 60000);
    const next = vi.fn();

    const res1 = mockRes();
    limiter(
      mockReq("1.2.3.4"),
      res1 as unknown as Response,
      next as NextFunction,
    );
    expect(res1.statusCode).toBe(200);

    const res2 = mockRes();
    limiter(
      mockReq("9.8.7.6"),
      res2 as unknown as Response,
      next as NextFunction,
    );
    expect(res2.statusCode).toBe(200);

    // Same IP again - should be blocked
    const res3 = mockRes();
    limiter(
      mockReq("1.2.3.4"),
      res3 as unknown as Response,
      next as NextFunction,
    );
    expect(res3.statusCode).toBe(429);
  });

  test("uses X-API-Key as rate limit key when present", () => {
    const limiter = createRateLimiter(1, 60000);
    const next = vi.fn();

    const res1 = mockRes();
    limiter(
      mockReq("127.0.0.1", { "x-api-key": "key-abc" }),
      res1 as unknown as Response,
      next as NextFunction,
    );
    expect(res1.statusCode).toBe(200);

    // Same API key from different IP should still be limited
    const res2 = mockRes();
    limiter(
      mockReq("9.9.9.9", { "x-api-key": "key-abc" }),
      res2 as unknown as Response,
      next as NextFunction,
    );
    expect(res2.statusCode).toBe(429);
  });

  test("429 response includes retryAfter", () => {
    const limiter = createRateLimiter(1, 60000);
    const next = vi.fn();

    limiter(mockReq(), mockRes() as unknown as Response, next as NextFunction);
    const res = mockRes();
    limiter(mockReq(), res as unknown as Response, next as NextFunction);
    expect(res.statusCode).toBe(429);
    expect((res.body as Record<string, unknown>)["retryAfter"]).toBe(60);
  });
});
