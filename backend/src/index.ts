// Must be the FIRST import: ESM hoists imports, so modules that read
// process.env at load time (e.g. utils/geocode.ts) would otherwise run before
// .env is loaded and see undefined values in local development.
import "dotenv/config";
import express, { type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import mongoose from "mongoose";
import { createExpressMiddleware } from "@trpc/server/adapters/express";

import connectMongoDB from "./lib/db.js";
import { appRouter } from "./routers/_app.js";
import { createContext } from "./context.js";
import legacyAuthRouter from "./legacy/auth.js";
import legacyComplianceRouter from "./legacy/compliance.js";

// Production-time boot guard: required secrets must be present before the
// server accepts traffic. Missing env in dev is also fatal here so failures
// surface early rather than at the first authenticated request.
const REQUIRED_ENV_AT_BOOT = ["MONGODB_URI", "JWT_SECRET"] as const;
for (const key of REQUIRED_ENV_AT_BOOT) {
  if (!process.env[key]) {
    console.error(`[index] Startup aborted — required env var "${key}" is not set`);
    process.exit(1);
  }
}

// Connect to MongoDB. Surface errors clearly — a failed connection is fatal
// at startup and should not be silently swallowed. The HTTP server is only
// bound after this resolves so the first request can't race ahead of DB
// readiness and return a 500 to an unsuspecting client.
const dbReady: Promise<void> = connectMongoDB().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error("[index] Startup aborted — database connection failed:", message);
  process.exit(1);
});

// ---------------------------------------------------------------------------
// Express setup
// ---------------------------------------------------------------------------

const app = express();
const PORT = Number(process.env.PORT) || 5050;

const isProduction = process.env.NODE_ENV === "production";

// FRONTEND_URL is honored whenever set (lets dev sessions point at a deployed
// frontend through a tunnel). In production it must be set explicitly so CORS
// isn't left open to any origin.
const FRONTEND_URL =
  process.env.FRONTEND_URL ??
  (isProduction
    ? (() => {
        throw new Error(
          "[index] FRONTEND_URL must be set in production environment",
        );
      })()
    : "http://localhost:5173");

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

app.use(express.json({ limit: "5mb" }));
// Strip trailing slash so an env var like "https://app.example.com/" still
// matches the browser-sent Origin header "https://app.example.com".
const normalizedFrontendUrl = FRONTEND_URL.replace(/\/$/, "");
app.use(
  cors({
    origin: normalizedFrontendUrl,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  }),
);
// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

app.get("/", (_req: Request, res: Response) => {
  // Mongoose readyState: 0=disconnected, 1=connected, 2=connecting, 3=disconnecting.
  const dbConnected = mongoose.connection.readyState === 1;
  res
    .status(dbConnected ? 200 : 503)
    .json({
      status: dbConnected ? "ok" : "degraded",
      service: "tradepilot-backend",
      db: dbConnected ? "connected" : "disconnected",
    });
});

// ---------------------------------------------------------------------------
// tRPC handler
// ---------------------------------------------------------------------------

app.use(
  "/trpc",
  createExpressMiddleware({
    router: appRouter,
    createContext,
    onError({ path, error }) {
      // Log server-side errors at warn/error so they appear in structured
      // logs without exposing stack traces to the client.
      if (error.code === "INTERNAL_SERVER_ERROR") {
        console.error(`[trpc] INTERNAL_SERVER_ERROR on /${path ?? "unknown"}:`, error.message);
      } else {
        console.warn(`[trpc] ${error.code} on /${path ?? "unknown"}:`, error.message);
      }
    },
  }),
);

// ---------------------------------------------------------------------------
// Legacy Express REST routes (OAuth callbacks, multer file uploads, etc.)
// ---------------------------------------------------------------------------

app.use(legacyAuthRouter);
app.use(legacyComplianceRouter);

// ---------------------------------------------------------------------------
// 404 fallback — unknown paths must not crash the response cycle.
// ---------------------------------------------------------------------------

app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: "Not found" });
});

// ---------------------------------------------------------------------------
// Global JSON error formatter middleware
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const message =
    err instanceof Error ? err.message : "An unexpected error occurred";
  console.error("[index] Unhandled Express error:", message);
  res.status(500).json({ error: message });
});

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------

// Wait for the database to be reachable before accepting traffic so that
// the first authenticated request never races a half-ready Mongoose pool.
const serverPromise: Promise<ReturnType<typeof app.listen>> = dbReady.then(
  () =>
    app.listen(PORT, () => {
      console.log(
        `[index] Server listening on port ${PORT} (${isProduction ? "production" : "development"})`,
      );
    }),
);

// Re-export for graceful shutdown — we lazily resolve from the promise.
let server: ReturnType<typeof app.listen> | undefined;
void serverPromise.then((s) => {
  server = s;
});

// ---------------------------------------------------------------------------
// Graceful shutdown — close HTTP server and Mongoose connection on SIGTERM
// / SIGINT so in-flight requests can finish and DB sockets close cleanly.
// ---------------------------------------------------------------------------

const SHUTDOWN_TIMEOUT_MS = 10_000;

async function gracefulShutdown(signal: string): Promise<void> {
  console.log(`[index] Received ${signal} — shutting down gracefully`);

  const forceExit = setTimeout(() => {
    console.error("[index] Shutdown timed out — forcing exit");
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  // Don't let the timer itself keep the event loop alive past shutdown.
  forceExit.unref();

  try {
    const s = server ?? (await serverPromise);
    await new Promise<void>((resolve, reject) => {
      s.close((err) => (err ? reject(err) : resolve()));
    });
    await mongoose.connection.close();
    console.log("[index] Shutdown complete");
    process.exit(0);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[index] Error during shutdown:", message);
    process.exit(1);
  }
}

process.on("SIGTERM", () => {
  void gracefulShutdown("SIGTERM");
});
process.on("SIGINT", () => {
  void gracefulShutdown("SIGINT");
});

export type { AppRouter } from "./routers/_app.js";
