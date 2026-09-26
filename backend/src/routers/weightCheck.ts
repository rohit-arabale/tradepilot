import mongoose from "mongoose";
import { z } from "zod";

import { requireUserId } from "../lib/auth.js";
import { AnomalyReportModel } from "../models/AnomalyReport.js";
import { AuditEventModel } from "../models/AuditEvent.js";
import { WeightCheckModel } from "../models/WeightCheck.js";
import { protectedProcedure, router } from "../trpc.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
/** deviationPct threshold above which an AnomalyReport is emitted (when also flagged) */
const ANOMALY_DEVIATION_PCT_THRESHOLD = 15;
/** deviationPct threshold above which severity is elevated to "high" */
const HIGH_SEVERITY_DEVIATION_PCT = 30;
/** Maximum realistic weight in kg to guard against obviously erroneous input */
const MAX_WEIGHT_KG = 1_000_000;
/** Maximum threshold percentage input */
const MAX_THRESHOLD_PCT = 100;
/** Upper bound for riskScore */
const MAX_RISK_SCORE = 100;
/** Multiplier used to convert deviationPct to riskScore */
const RISK_SCORE_DEVIATION_MULTIPLIER = 2;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function writeAudit(
  userId: mongoose.Types.ObjectId,
  draftId: string | undefined,
  eventType: string,
  summary: string,
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    await AuditEventModel.create({
      userId,
      draftId: draftId ?? "n/a",
      eventType,
      payload,
      summary,
      createdAt: new Date(),
    });
  } catch (err) {
    console.error(`[audit] failed to write ${eventType}:`, (err as Error)?.message);
  }
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------
export const weightCheckRouter = router({
  /**
   * POST → weightCheck.submit
   */
  submit: protectedProcedure
    .input(
      z.object({
        draftId: z.string().max(100).optional(),
        declaredWeightKg: z.number().positive().max(MAX_WEIGHT_KG),
        measuredWeightKg: z.number().nonnegative().max(MAX_WEIGHT_KG),
        thresholdPct: z.number().nonnegative().max(MAX_THRESHOLD_PCT).default(5),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = requireUserId(ctx);

      const { draftId, declaredWeightKg, measuredWeightKg, thresholdPct } = input;

      const deviationKg = measuredWeightKg - declaredWeightKg;
      const deviationPct = (Math.abs(deviationKg) / declaredWeightKg) * 100;
      const flagged = deviationPct > thresholdPct;

      const doc = await WeightCheckModel.create({
        userId,
        ...(draftId ? { draftId } : {}),
        declaredWeightKg,
        measuredWeightKg,
        deviationKg,
        deviationPct,
        thresholdPct,
        flagged,
        createdAt: new Date(),
      });

      await writeAudit(
        userId,
        draftId,
        "weight-check-submit",
        `Weight check: declared ${declaredWeightKg}kg, measured ${measuredWeightKg}kg (deviation ${deviationPct.toFixed(1)}%)`,
        {
          declaredWeightKg,
          measuredWeightKg,
          deviationPct,
          flagged,
          resultId: String(doc._id),
        },
      );

      // Cross-feature linkage: emit AnomalyReport when flagged AND deviationPct > ANOMALY_DEVIATION_PCT_THRESHOLD.
      if (flagged && deviationPct > ANOMALY_DEVIATION_PCT_THRESHOLD) {
        try {
          await AnomalyReportModel.create({
            userId,
            draftId,
            declaredWeightKg,
            measuredWeightKg,
            declaredCount: 0,
            detectedCount: 0,
            flags: ["weight-mismatch"],
            severity: deviationPct > HIGH_SEVERITY_DEVIATION_PCT ? "high" : "medium",
            riskScore: Math.min(MAX_RISK_SCORE, Math.round(deviationPct * RISK_SCORE_DEVIATION_MULTIPLIER)),
            summary: `Weight mismatch: declared ${declaredWeightKg}kg vs measured ${measuredWeightKg}kg (${deviationPct.toFixed(1)}% deviation).`,
            createdAt: new Date(),
          });
        } catch (err) {
          console.error(
            "[weightCheck.submit] anomaly emit failed:",
            (err as Error)?.message,
          );
        }
      }

      return doc;
    }),

  /**
   * GET → weightCheck.history
   */
  history: protectedProcedure
    .input(
      z.object({
        limit: z.number().int().positive().max(50).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = requireUserId(ctx);

      const records = await WeightCheckModel.find({ userId })
        .sort({ createdAt: -1 })
        .limit(input.limit);

      return records;
    }),
});
