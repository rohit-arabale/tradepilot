import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

// ---------------------------------------------------------------------------
// Rate-limiting hook: mount express-rate-limit here before verifyToken in
// any route that processes credentials (login, OAuth callback, upload).
// Example:
//   import rateLimit from "express-rate-limit";
//   export const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });
// ---------------------------------------------------------------------------

/** Minimum viable secret length to prevent trivially weak JWT secrets. */
const MIN_SECRET_LENGTH = 32;

const JWT_SECRET = process.env.JWT_SECRET;

// Fail fast at module load time if the secret is absent or obviously weak.
if (!JWT_SECRET) {
  throw new Error("JWT_SECRET environment variable must be set");
}
if (JWT_SECRET.length < MIN_SECRET_LENGTH) {
  throw new Error(
    `JWT_SECRET must be at least ${MIN_SECRET_LENGTH} characters long`
  );
}

export interface AuthenticatedRequest extends Request {
  user?: jwt.JwtPayload | string;
}

/**
 * Express middleware that verifies a Bearer JWT and attaches the
 * decoded payload to req.user. Kept for legacy REST routes that
 * remain alongside the new tRPC API (multer uploads, OAuth, etc.).
 *
 * Security notes:
 *  - Never echoes the token back in error messages.
 *  - Relies on jwt.verify() to honor the `exp` claim (default behavior).
 *  - Secret absence is caught at startup, not per-request.
 */
export const verifyToken = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void => {
  const authHeader = req.headers.authorization;
  const parts = authHeader?.split(" ");

  if (!parts || parts.length !== 2 || parts[0] !== "Bearer" || !parts[1]) {
    res.status(401).json({ message: "Unauthorized: missing or malformed token" });
    return;
  }

  const token = parts[1];

  try {
    // jwt.verify throws if the token is expired, malformed, or signature invalid.
    const decoded = jwt.verify(token, JWT_SECRET as string);
    req.user = decoded;
    next();
  } catch {
    // Do NOT include the token or raw error in the response to avoid leaks.
    res.status(401).json({ message: "Unauthorized: invalid or expired token" });
  }
};

export default verifyToken;
