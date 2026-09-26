import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import jwt from "jsonwebtoken";

// ---------------------------------------------------------------------------
// Rate-limiting hook: mount express-rate-limit on the tRPC handler in
// backend/src/index.ts for global API protection.
// Example:
//   import rateLimit from "express-rate-limit";
//   const apiLimiter = rateLimit({ windowMs: 60_000, max: 300 });
//   app.use("/trpc", apiLimiter, trpcExpressMiddleware(...));
// ---------------------------------------------------------------------------

/** Minimum viable secret length to prevent trivially weak JWT secrets. */
const MIN_SECRET_LENGTH = 32;

export interface AuthUser {
  id?: string;
  _id?: string;
  email?: string;
  [key: string]: unknown;
}

export interface Context {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: AuthUser | null;
}

/**
 * Extract a JWT from either the Authorization header (Bearer <token>)
 * or from cookies, mirroring backend/Middleware/auth.js behavior but
 * extended to also look at cookies for forward-compatibility.
 *
 * Only the "Bearer <token>" form is accepted from the Authorization header;
 * raw single-value headers are rejected to avoid accidental token acceptance.
 */
function extractToken(req: CreateExpressContextOptions["req"]): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader) {
    const parts = authHeader.split(" ");
    if (parts.length === 2 && parts[0] === "Bearer" && parts[1]) {
      return parts[1];
    }
    // Reject any other form — do not accept raw single-value Authorization headers.
  }

  // Cookies (if cookie-parser is mounted upstream)
  const cookies = (req as unknown as { cookies?: Record<string, string> }).cookies;
  if (cookies?.token) return cookies.token;
  if (cookies?.authToken) return cookies.authToken;

  return null;
}

export async function createContext({
  req,
  res,
}: CreateExpressContextOptions): Promise<Context> {
  const jwtSecret = process.env.JWT_SECRET;

  // Fail fast: secret must be present and meet a minimum length.
  if (!jwtSecret) {
    throw new Error("JWT_SECRET environment variable must be set");
  }
  if (jwtSecret.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `JWT_SECRET must be at least ${MIN_SECRET_LENGTH} characters long`
    );
  }

  let user: AuthUser | null = null;

  const token = extractToken(req);
  if (token) {
    try {
      // jwt.verify honors the `exp` claim by default.
      const decoded = jwt.verify(token, jwtSecret) as AuthUser;
      user = decoded;
    } catch {
      // Token invalid or expired — treat as unauthenticated.
      // Do NOT propagate raw error details; they may contain token fragments.
      user = null;
    }
  }

  return { req, res, user };
}
