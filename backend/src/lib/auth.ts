import { TRPCError } from "@trpc/server";
import mongoose from "mongoose";

import type { Context } from "../context.js";

/**
 * Extract a validated mongoose.Types.ObjectId from the tRPC context's user
 * payload. Throws UNAUTHORIZED when no user is on the context, or BAD_REQUEST
 * when the id is present but malformed.
 *
 * Used by every protected procedure so that auth-guard logic is
 * standardised in one place.
 */
export function requireUserId(ctx: Context): mongoose.Types.ObjectId {
  if (!ctx.user) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Authentication required",
    });
  }

  const raw = ctx.user.id ?? ctx.user._id;
  if (!raw) {
    console.error("[auth] requireUserId — user object present but id/._id is absent");
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "User account data is incomplete",
    });
  }

  const asStr = String(raw);
  if (!mongoose.Types.ObjectId.isValid(asStr)) {
    console.error(`[auth] requireUserId — userId "${asStr}" is not a valid ObjectId`);
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Invalid userId format",
    });
  }

  return new mongoose.Types.ObjectId(asStr);
}

/**
 * Validate an arbitrary string as a Mongo ObjectId. Throws TRPCError
 * BAD_REQUEST when the id is malformed.
 */
export function assertObjectId(id: string, label = "id"): void {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Invalid ${label} format`,
    });
  }
}
