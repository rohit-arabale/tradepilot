import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { requireUserId } from "../lib/auth.js";
import { AuditEventModel } from "../models/AuditEvent.js";
import { protectedProcedure, router } from "../trpc.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const MAX_PAYLOAD_BYTES = 4096; // 4 KB — prevent log bloat
const MAX_EVENT_TYPE_LENGTH = 100;
const MAX_SUMMARY_LENGTH = 500;
const MAX_DRAFT_ID_LENGTH = 100;
const MAX_CLIENT_TOKEN_LENGTH = 100;
const MAX_FOR_DRAFT_LIMIT = 500;

export const auditRouter = router({
  /**
   * Append a new verification event to the audit log for a shipment draft.
   *
   * Optional `clientToken` is an idempotency key. If supplied, a second
   * append with the same (userId, clientToken) collapses to the original
   * event instead of creating a duplicate — protecting against the double-
   * click / retry storm window that bypasses client-side disable guards.
   */
  append: protectedProcedure
    .input(
      z.object({
        draftId: z.string().min(1).max(MAX_DRAFT_ID_LENGTH),
        eventType: z.string().min(1).max(MAX_EVENT_TYPE_LENGTH),
        payload: z.record(z.string(), z.unknown()).optional(),
        summary: z.string().min(1).max(MAX_SUMMARY_LENGTH),
        clientToken: z.string().min(1).max(MAX_CLIENT_TOKEN_LENGTH).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = requireUserId(ctx);

      const payloadToStore = input.payload ?? {};

      // H7 / extra directive: cap payload size to prevent log bloat
      const serialized = JSON.stringify(payloadToStore);
      if (serialized.length > MAX_PAYLOAD_BYTES) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Audit payload exceeds maximum allowed size of ${MAX_PAYLOAD_BYTES} bytes`,
        });
      }

      // Idempotency short-circuit: if the same (userId, clientToken) was
      // already persisted, return the existing event verbatim instead of
      // hitting the unique-index error.
      if (input.clientToken) {
        const existing = await AuditEventModel.findOne({
          userId,
          clientToken: input.clientToken,
        });
        if (existing) return existing;
      }

      try {
        const event = await AuditEventModel.create({
          userId,
          draftId: input.draftId,
          eventType: input.eventType,
          payload: payloadToStore,
          summary: input.summary,
          ...(input.clientToken ? { clientToken: input.clientToken } : {}),
          createdAt: new Date(),
        });
        return event;
      } catch (err) {
        // Race: a concurrent request beat us to the unique (userId, clientToken)
        // index. Re-read and return the survivor instead of surfacing 11000.
        const isDup =
          typeof err === "object" &&
          err !== null &&
          (err as { code?: number }).code === 11000;
        if (isDup && input.clientToken) {
          const survivor = await AuditEventModel.findOne({
            userId,
            clientToken: input.clientToken,
          });
          if (survivor) return survivor;
        }
        throw err;
      }
    }),

  /**
   * Return audit events for a given draft.
   * Scoped to the calling user so callers cannot peek at other users' drafts.
   *
   * Defaults preserve the historical contract (oldest-first, unbounded) so
   * existing consumers don't break. Pass `order: "newest"` and a `limit` to
   * fetch only the tail — InsightsRail uses limit=12 newest to avoid pulling
   * the full chain for long-lived drafts.
   */
  forDraft: protectedProcedure
    .input(
      z.object({
        draftId: z.string().min(1).max(MAX_DRAFT_ID_LENGTH),
        limit: z.number().int().positive().max(MAX_FOR_DRAFT_LIMIT).optional(),
        order: z.enum(["oldest", "newest"]).default("oldest"),
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = requireUserId(ctx);
      const query = AuditEventModel.find({
        userId,
        draftId: input.draftId,
      }).sort({ createdAt: input.order === "newest" ? -1 : 1 });
      if (input.limit) query.limit(input.limit);
      const events = await query;
      return events;
    }),

  /**
   * Return the most recent N audit events for the authenticated user.
   */
  recent: protectedProcedure
    .input(
      z.object({
        limit: z.number().int().positive().max(100).default(30),
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = requireUserId(ctx);

      const events = await AuditEventModel.find({ userId })
        .sort({ createdAt: -1 })
        .limit(input.limit);

      return events;
    }),
});
