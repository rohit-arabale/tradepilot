import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { Context } from "./context.js";

const isProduction = process.env.NODE_ENV === "production";

export const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape }) {
    // Never leak server-side stack traces to the client in production.
    if (isProduction) {
      const { data, ...rest } = shape;
      if (data && typeof data === "object" && "stack" in data) {
        const { stack: _stack, ...safeData } = data as Record<string, unknown>;
        return { ...rest, data: safeData } as typeof shape;
      }
    }
    return shape;
  },
});

export const router = t.router;
export const middleware = t.middleware;
export const publicProcedure = t.procedure;

/**
 * Middleware that asserts a user is present on the context.
 * Domain routers should compose protectedProcedure for any
 * endpoints that require authentication.
 */
const isAuthed = middleware(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Unauthorized access!",
    });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = t.procedure.use(isAuthed);
