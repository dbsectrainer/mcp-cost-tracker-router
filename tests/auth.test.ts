import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { createHmac } from "crypto";
import type { Request, Response, NextFunction } from "express";
import { createAuthMiddleware } from "../src/auth.js";

function makeBase64url(data: string): string {
  return Buffer.from(data).toString("base64url");
}

function makeJwt(secret: string, payload?: object): string {
  const header = makeBase64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const pay = makeBase64url(JSON.stringify(payload ?? { sub: "test" }));
  const sig = createHmac("sha256", secret)
    .update(`${header}.${pay}`)
    .digest("base64url");
  return `${header}.${pay}.${sig}`;
}

function mockReq(
  headers: Record<string, string> = {},
  ip = "127.0.0.1",
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

describe("createAuthMiddleware", () => {
  let origApiKey: string | undefined;
  let origJwtSecret: string | undefined;

  beforeEach(() => {
    origApiKey = process.env["MCP_API_KEY"];
    origJwtSecret = process.env["MCP_JWT_SECRET"];
    delete process.env["MCP_API_KEY"];
    delete process.env["MCP_JWT_SECRET"];
  });

  afterEach(() => {
    if (origApiKey !== undefined) {
      process.env["MCP_API_KEY"] = origApiKey;
    } else {
      delete process.env["MCP_API_KEY"];
    }
    if (origJwtSecret !== undefined) {
      process.env["MCP_JWT_SECRET"] = origJwtSecret;
    } else {
      delete process.env["MCP_JWT_SECRET"];
    }
  });

  test("pass-through when neither env var is set", () => {
    const middleware = createAuthMiddleware();
    const next = vi.fn();
    const res = mockRes();
    middleware(mockReq(), res as unknown as Response, next as NextFunction);
    expect(next).toHaveBeenCalledOnce();
    expect(res.statusCode).toBe(200);
  });

  test("allows request with valid API key", () => {
    process.env["MCP_API_KEY"] = "test-key-123";
    const middleware = createAuthMiddleware();
    const next = vi.fn();
    const res = mockRes();
    middleware(
      mockReq({ "x-api-key": "test-key-123" }),
      res as unknown as Response,
      next as NextFunction,
    );
    expect(next).toHaveBeenCalledOnce();
  });

  test("rejects request with wrong API key", () => {
    process.env["MCP_API_KEY"] = "correct-key";
    const middleware = createAuthMiddleware();
    const next = vi.fn();
    const res = mockRes();
    middleware(
      mockReq({ "x-api-key": "wrong-key" }),
      res as unknown as Response,
      next as NextFunction,
    );
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  test("rejects request with missing API key", () => {
    process.env["MCP_API_KEY"] = "required-key";
    const middleware = createAuthMiddleware();
    const next = vi.fn();
    const res = mockRes();
    middleware(mockReq(), res as unknown as Response, next as NextFunction);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  test("allows request with valid JWT", () => {
    const secret = "my-secret";
    process.env["MCP_JWT_SECRET"] = secret;
    const middleware = createAuthMiddleware();
    const next = vi.fn();
    const res = mockRes();
    const token = makeJwt(secret);
    middleware(
      mockReq({ authorization: `Bearer ${token}` }),
      res as unknown as Response,
      next as NextFunction,
    );
    expect(next).toHaveBeenCalledOnce();
  });

  test("rejects request with invalid JWT signature", () => {
    process.env["MCP_JWT_SECRET"] = "correct-secret";
    const middleware = createAuthMiddleware();
    const next = vi.fn();
    const res = mockRes();
    const badToken = makeJwt("wrong-secret");
    middleware(
      mockReq({ authorization: `Bearer ${badToken}` }),
      res as unknown as Response,
      next as NextFunction,
    );
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  test("rejects request with missing Bearer token", () => {
    process.env["MCP_JWT_SECRET"] = "some-secret";
    const middleware = createAuthMiddleware();
    const next = vi.fn();
    const res = mockRes();
    middleware(mockReq(), res as unknown as Response, next as NextFunction);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  test("rejects malformed JWT (wrong number of parts)", () => {
    process.env["MCP_JWT_SECRET"] = "some-secret";
    const middleware = createAuthMiddleware();
    const next = vi.fn();
    const res = mockRes();
    middleware(
      mockReq({ authorization: "Bearer notavalidjwt" }),
      res as unknown as Response,
      next as NextFunction,
    );
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });
});
