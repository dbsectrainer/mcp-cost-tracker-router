import { createHmac } from "crypto";
function verifyJwt(token, secret) {
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [headerB64, payloadB64, signatureB64] = parts;
  const signingInput = `${headerB64}.${payloadB64}`;
  const expectedSig = createHmac("sha256", secret)
    .update(signingInput)
    .digest("base64url");
  // Constant-time comparison
  const expectedBuf = Buffer.from(expectedSig);
  const actualBuf = Buffer.from(signatureB64 ?? "");
  if (expectedBuf.length !== actualBuf.length) return false;
  let diff = 0;
  for (let i = 0; i < expectedBuf.length; i++) {
    diff |= (expectedBuf[i] ?? 0) ^ (actualBuf[i] ?? 0);
  }
  return diff === 0;
}
export function createAuthMiddleware() {
  return (req, res, next) => {
    const apiKeyEnv = process.env["MCP_API_KEY"];
    const jwtSecretEnv = process.env["MCP_JWT_SECRET"];
    // If neither env var is set, pass through
    if (!apiKeyEnv && !jwtSecretEnv) {
      next();
      return;
    }
    // Validate X-API-Key if env var is set
    if (apiKeyEnv) {
      const providedKey = req.headers["x-api-key"];
      if (!providedKey || providedKey !== apiKeyEnv) {
        res
          .status(401)
          .json({ error: "Unauthorized: invalid or missing API key" });
        return;
      }
    }
    // Validate Authorization: Bearer JWT if env var is set
    if (jwtSecretEnv) {
      const authHeader = req.headers["authorization"];
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        res.status(401).json({ error: "Unauthorized: missing Bearer token" });
        return;
      }
      const token = authHeader.slice("Bearer ".length).trim();
      if (!verifyJwt(token, jwtSecretEnv)) {
        res.status(401).json({ error: "Unauthorized: invalid JWT signature" });
        return;
      }
    }
    next();
  };
}
