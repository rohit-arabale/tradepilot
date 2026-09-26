import { TRPCError } from "@trpc/server";
import mongoose from "mongoose";
import { z } from "zod";

import { genai, FLASH_MODEL } from "../lib/genai.js";
import { requireUserId } from "../lib/auth.js";
import { AnomalyReportModel } from "../models/AnomalyReport.js";
import { AuditEventModel } from "../models/AuditEvent.js";
import { ShipmentDiffModel } from "../models/ShipmentDiff.js";
import { protectedProcedure, router } from "../trpc.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
/** 10 MB in base64 characters (10 * 1024 * 1024 * 4/3 ≈ 13,981,013) */
const MAX_IMAGE_BASE64_CHARS = 13_981_013;
/** Maximum characters to include in error log snippets to avoid log explosion */
const ERR_SNIPPET_LEN = 240;
/** riskScore threshold above which a high-severity AnomalyReport is emitted */
const ANOMALY_RISK_THRESHOLD = 70;
/** Risk score range bounds */
const RISK_SCORE_MIN = 0;
const RISK_SCORE_MAX = 100;
/** Tampering probability range bounds */
const TAMPERING_PROB_MIN = 0;
const TAMPERING_PROB_MAX = 1;
/** Maximum length for MIME type string */
const MAX_MIME_LEN = 100;
/** Maximum length for auto-generated anomaly summary */
const ANOMALY_SUMMARY_MAX = 600;

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

function clampRiskScore(value: unknown): number {
  return Math.min(RISK_SCORE_MAX, Math.max(RISK_SCORE_MIN, Number(value ?? 0)));
}

function clampTamperingProb(value: unknown): number {
  return Math.min(TAMPERING_PROB_MAX, Math.max(TAMPERING_PROB_MIN, Number(value ?? 0)));
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------
export const shipmentDiffRouter = router({
  /**
   * POST shipmentDiff.compare
   */
  compare: protectedProcedure
    .input(
      z.object({
        draftId: z.string().max(100).optional(),
        beforeImageBase64: z.string().min(10).max(MAX_IMAGE_BASE64_CHARS, {
          message: "Before-image exceeds 10 MB limit",
        }),
        afterImageBase64: z.string().min(10).max(MAX_IMAGE_BASE64_CHARS, {
          message: "After-image exceeds 10 MB limit",
        }),
        mimeType: z.string().min(1).max(MAX_MIME_LEN).default("image/jpeg"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = requireUserId(ctx);

      const prompt =
        'Compare these two shipment images (before loading vs after delivery). Respond ONLY with JSON: {"missingItems": string[], "damageDescription": string, "tamperingProbability": number (0-1), "riskScore": number (0-100), "summary": string}';

      let rawText: string;
      try {
        const response = await genai().models.generateContent({
          model: FLASH_MODEL,
          contents: [
            { role: "user", parts: [
              { text: prompt },
              { inlineData: { data: input.beforeImageBase64, mimeType: input.mimeType } },
              { inlineData: { data: input.afterImageBase64, mimeType: input.mimeType } },
            ]},
          ],
        });
        rawText = response.text ?? "";
      } catch (err) {
        throw new TRPCError({
          code: "BAD_GATEWAY",
          message: `Gemini API failed: ${String((err as Error)?.message ?? "unknown").slice(0, ERR_SNIPPET_LEN)}`,
        });
      }

      let parsed: {
        missingItems: string[];
        damageDescription: string;
        tamperingProbability: number;
        riskScore: number;
        summary: string;
      };

      try {
        const jsonStart = rawText.indexOf("{");
        const jsonEnd = rawText.lastIndexOf("}") + 1;
        if (jsonStart === -1 || jsonEnd === 0) {
          throw new Error("No JSON object found in response");
        }
        const cleanText = rawText.slice(jsonStart, jsonEnd).trim();
        parsed = JSON.parse(cleanText) as typeof parsed;
      } catch {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to parse Gemini response. Raw snippet: ${rawText.slice(0, ERR_SNIPPET_LEN)}`,
        });
      }

      const riskScore = clampRiskScore(parsed.riskScore);
      const tamperingProbability = clampTamperingProb(parsed.tamperingProbability);

      const damageDescription =
        typeof parsed.damageDescription === "string" && parsed.damageDescription.trim().length > 0
          ? parsed.damageDescription
          : "No visible damage reported.";
      const summary =
        typeof parsed.summary === "string" && parsed.summary.trim().length > 0
          ? parsed.summary
          : `Shipment diff (risk ${riskScore}).`;

      // Sanitize missingItems: drop non-strings, empty entries, and cap length to avoid bloat.
      const missingItems = (Array.isArray(parsed.missingItems) ? parsed.missingItems : [])
        .filter((it): it is string => typeof it === "string" && it.trim().length > 0)
        .map((it) => it.trim())
        .slice(0, 100);

      const doc = await ShipmentDiffModel.create({
        userId,
        draftId: input.draftId,
        riskScore,
        tamperingProbability,
        missingItems,
        damageDescription,
        summary,
        createdAt: new Date(),
      });

      await writeAudit(
        userId,
        input.draftId,
        "shipment-diff-compare",
        `Shipment diff: risk ${riskScore}, tampering ${(tamperingProbability * 100).toFixed(0)}%`,
        {
          riskScore,
          tamperingProbability,
          missingItems,
          resultId: String(doc._id),
        },
      );

      // Cross-feature linkage: emit high-severity AnomalyReport when riskScore > ANOMALY_RISK_THRESHOLD.
      if (riskScore > ANOMALY_RISK_THRESHOLD) {
        try {
          await AnomalyReportModel.create({
            userId,
            draftId: input.draftId,
            declaredWeightKg: 0,
            measuredWeightKg: 0,
            declaredCount: 0,
            detectedCount: 0,
            flags: ["shipment-diff-high-risk"],
            severity: "high",
            riskScore,
            summary: `Shipment diff risk ${riskScore}: ${summary || damageDescription}`.slice(0, ANOMALY_SUMMARY_MAX),
            createdAt: new Date(),
          });
        } catch (err) {
          console.error(
            "[shipmentDiff.compare] anomaly emit failed:",
            (err as Error)?.message,
          );
        }
      }

      return doc;
    }),

  /**
   * GET shipmentDiff.history
   */
  history: protectedProcedure
    .input(
      z.object({
        limit: z.number().int().positive().max(50).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = requireUserId(ctx);

      const records = await ShipmentDiffModel.find({ userId })
        .sort({ createdAt: -1 })
        .limit(input.limit);

      return records;
    }),
});
