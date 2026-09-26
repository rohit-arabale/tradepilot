import mongoose from "mongoose";

// ---------------------------------------------------------------------------
// Named constants
// ---------------------------------------------------------------------------

/** How long (ms) to wait for initial connection before giving up. */
const CONNECT_TIMEOUT_MS = 10_000;

/** Maximum number of documents in the Mongoose connection pool. */
const MAX_POOL_SIZE = 10;

// ---------------------------------------------------------------------------
// Connection
// ---------------------------------------------------------------------------

export async function connectMongoDB(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    // Surface clearly — a missing URI is always a misconfiguration, not a
    // transient failure.
    throw new Error(
      "[db] MONGODB_URI environment variable is not set. " +
        "Set it in .env (local) or your hosting provider's secrets store.",
    );
  }

  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: CONNECT_TIMEOUT_MS,
      maxPoolSize: MAX_POOL_SIZE,
      // Disable command buffering so callers see a clear error if the
      // pool is disconnected, rather than queueing forever.
      bufferCommands: false,
    });
    console.log("[db] MongoDB connected successfully");
  } catch (err) {
    // Re-throw with a descriptive prefix so the process log clearly
    // attributes the crash to the database layer.
    const message = err instanceof Error ? err.message : String(err);
    console.error("[db] MongoDB connection failed:", message);
    throw new Error(`[db] MongoDB connection failed: ${message}`);
  }

  // Surface connection-lifecycle events so operators can observe
  // reconnects and disconnects in structured logs.
  mongoose.connection.on("disconnected", () => {
    console.warn("[db] MongoDB disconnected — Mongoose will attempt to reconnect");
  });

  mongoose.connection.on("reconnected", () => {
    console.log("[db] MongoDB reconnected");
  });

  mongoose.connection.on("error", (err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[db] MongoDB connection error:", message);
  });
}

export default connectMongoDB;
