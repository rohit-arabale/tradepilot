import { TRPCError } from "@trpc/server";
import mongoose from "mongoose";
import { z } from "zod";

import { genai, FLASH_MODEL } from "../lib/genai.js";
import { requireUserId } from "../lib/auth.js";
import { AnomalyReportModel } from "../models/AnomalyReport.js";
import { AuditEventModel } from "../models/AuditEvent.js";
import { protectedProcedure, router } from "../trpc.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
/** Maximum characters to include in error log snippets to avoid log explosion */
const ERR_SNIPPET_LEN = 240;
/** Maximum string length for city names */
const MAX_CITY_LEN = 200;
/** Maximum string length for extra notes */
const MAX_NOTES_LEN = 2000;
/** Upper bound for riskScore returned by AI */
const RISK_SCORE_MIN = 0;
const RISK_SCORE_MAX = 100;
/** Valid severity values */
const VALID_SEVERITIES = ["low", "medium", "high"] as const;

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
  const num = Number(value ?? 0);
  // Guard against NaN — Math.max(0, NaN) and Math.min(100, NaN) both return NaN.
  if (!Number.isFinite(num)) return 0;
  return Math.min(RISK_SCORE_MAX, Math.max(RISK_SCORE_MIN, Math.round(num)));
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------
export const anomalyRouter = router({
  /**
   * mutation: analyze
   */
  analyze: protectedProcedure
    .input(
      z.object({
        draftId: z.string().max(100).optional(),
        declaredWeightKg: z.number().nonnegative(),
        measuredWeightKg: z.number().nonnegative(),
        declaredCount: z.number().int().nonnegative(),
        detectedCount: z.number().int().nonnegative(),
        originCity: z.string().min(1).max(MAX_CITY_LEN),
        destinationCity: z.string().min(1).max(MAX_CITY_LEN),
        routeDeviationKm: z.number().nonnegative().default(0),
        extraNotes: z.string().max(MAX_NOTES_LEN).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = requireUserId(ctx);

      const {
        draftId,
        declaredWeightKg,
        measuredWeightKg,
        declaredCount,
        detectedCount,
        originCity,
        destinationCity,
        routeDeviationKm,
        extraNotes,
      } = input;

      const weightDiffPct =
        declaredWeightKg > 0
          ? (Math.abs(measuredWeightKg - declaredWeightKg) / declaredWeightKg) * 100
          : 0;

      const countDiff = Math.abs(detectedCount - declaredCount);

      // Strip control chars / newlines from free-text fields so they can't
      // break out of the prompt structure or inject extra "instructions".
      const sanitize = (s: string): string =>
        s.replace(/[\u0000-\u001f\u007f]+/g, " ").trim();
      const safeOriginCity = sanitize(originCity);
      const safeDestinationCity = sanitize(destinationCity);
      const safeExtraNotes = extraNotes ? sanitize(extraNotes) : "";

      const prompt = `
You are a logistics fraud and anomaly detection AI. Analyze the following shipment data and identify suspicious patterns.

Shipment Details:
- Origin City: ${safeOriginCity}
- Destination City: ${safeDestinationCity}
- Declared Weight: ${declaredWeightKg} kg
- Measured/Actual Weight: ${measuredWeightKg} kg
- Weight Discrepancy: ${weightDiffPct.toFixed(1)}%
- Declared Item Count: ${declaredCount}
- Detected Item Count: ${detectedCount}
- Count Discrepancy: ${countDiff} units
- Route Deviation: ${routeDeviationKm} km from expected route
${safeExtraNotes ? `- Additional Notes: ${safeExtraNotes}` : ""}

Based on this data, identify any anomalies or suspicious patterns. Consider:
1. Weight discrepancies (>5% is suspicious, >15% is highly suspicious)
2. Count discrepancies (any missing/extra units)
3. Route deviations (>50 km is suspicious)
4. Any combination of factors that suggests fraud, mislabeling, theft, or contraband

If high risk, suggest concrete mitigation actions:
- Countries or lanes to avoid (e.g. "Pakistan land border")
- Alternative routes or transport modes (e.g. "Use air freight via Dubai")

Return ONLY a valid JSON object with no markdown or extra text, in exactly this format:
{
  "flags": ["<specific anomaly 1>", "<specific anomaly 2>"],
  "severity": "low" | "medium" | "high",
  "riskScore": <integer 0-100>,
  "summary": "<2-3 sentence professional summary of findings and recommendations>",
  "recommendedAvoidances": ["<country or lane to avoid 1>", "<country or lane to avoid 2>"],
  "recommendedAlternatives": ["<concrete mitigation 1>", "<concrete mitigation 2>"],
  "mitigationNarrative": "<1-2 sentences: synthesized suggested action or 'No mitigation needed.' if low risk>"
}

Rules for severity:
- "high": riskScore >= 70 or multiple serious flags
- "medium": riskScore 40-69 or one significant flag
- "low": riskScore < 40 or minor discrepancies only

Rules for mitigations:
- If severity is "low", set mitigationNarrative to "No mitigation needed."
- recommendedAvoidances: empty array if not applicable
- recommendedAlternatives: empty array if not applicable
- Every string ≤ 25 words, no markdown.
`;

      let geminiResult;
      try {
        geminiResult = await genai().models.generateContent({
          model: FLASH_MODEL,
          contents: prompt,
        });
      } catch (err) {
        throw new TRPCError({
          code: "BAD_GATEWAY",
          message: `Gemini API call failed: ${String((err as Error)?.message ?? "unknown").slice(0, ERR_SNIPPET_LEN)}`,
        });
      }

      const rawText = geminiResult.text ?? "";

      let parsed: {
        flags: string[];
        severity: "low" | "medium" | "high";
        riskScore: number;
        summary: string;
        recommendedAvoidances?: string[];
        recommendedAlternatives?: string[];
        mitigationNarrative?: string;
      };

      try {
        const jsonStart = rawText.indexOf("{");
        const jsonEnd = rawText.lastIndexOf("}") + 1;
        if (jsonStart === -1 || jsonEnd === 0) {
          throw new Error("No JSON object found in response");
        }
        const cleanJson = rawText.slice(jsonStart, jsonEnd).trim();
        parsed = JSON.parse(cleanJson) as typeof parsed;
      } catch {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to parse Gemini response as JSON. Raw response snippet: ${rawText.slice(0, ERR_SNIPPET_LEN)}`,
        });
      }

      // Be defensive: accept missing/empty flags array, accept missing summary.
      // Severity and riskScore must still be present and well-formed.
      if (
        !VALID_SEVERITIES.includes(parsed.severity) ||
        typeof parsed.riskScore !== "number"
      ) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Gemini response has unexpected shape. Raw: ${rawText.slice(0, ERR_SNIPPET_LEN)}`,
        });
      }

      // Normalise optional fields so downstream code can rely on them.
      // Cap flag count + per-flag length so a runaway Gemini response can't
      // bloat the stored document. Cap summary length for the same reason.
      const MAX_FLAGS = 20;
      const MAX_FLAG_LEN = 240;
      const MAX_SUMMARY_LEN = 2000;
      const MAX_MITIGATION_LEN = 300;
      const safeFlags = Array.isArray(parsed.flags)
        ? parsed.flags
            .filter((f) => typeof f === "string")
            .map((f) => f.slice(0, MAX_FLAG_LEN))
            .slice(0, MAX_FLAGS)
        : [];
      const rawSummary =
        typeof parsed.summary === "string" && parsed.summary.trim().length > 0
          ? parsed.summary
          : `Severity ${parsed.severity}, risk ${parsed.riskScore}`;
      const safeSummary = rawSummary.slice(0, MAX_SUMMARY_LEN);

      // Mitigation fields — cap arrays and string lengths
      const MAX_MITIGATIONS = 5;
      const safeAvoidances = Array.isArray(parsed.recommendedAvoidances)
        ? parsed.recommendedAvoidances
            .filter((a) => typeof a === "string")
            .map((a) => a.slice(0, MAX_MITIGATION_LEN))
            .slice(0, MAX_MITIGATIONS)
        : [];
      const safeAlternatives = Array.isArray(parsed.recommendedAlternatives)
        ? parsed.recommendedAlternatives
            .filter((a) => typeof a === "string")
            .map((a) => a.slice(0, MAX_MITIGATION_LEN))
            .slice(0, MAX_MITIGATIONS)
        : [];
      const safeMitigationNarrative =
        typeof parsed.mitigationNarrative === "string" && parsed.mitigationNarrative.trim().length > 0
          ? parsed.mitigationNarrative
          : "No mitigation needed.";
      const clampedMitigationNarrative = safeMitigationNarrative.slice(0, 500);

      // Clamp riskScore to valid range even if AI returns out-of-bounds value.
      const riskScore = clampRiskScore(parsed.riskScore);

      const report = await AnomalyReportModel.create({
        userId,
        draftId: draftId ?? undefined,
        declaredWeightKg,
        measuredWeightKg,
        declaredCount,
        detectedCount,
        originCity,
        destinationCity,
        routeDeviationKm,
        flags: safeFlags,
        severity: parsed.severity,
        riskScore,
        summary: safeSummary,
        recommendedAvoidances: safeAvoidances,
        recommendedAlternatives: safeAlternatives,
        mitigationNarrative: clampedMitigationNarrative,
        createdAt: new Date(),
      });

      await writeAudit(
        userId,
        draftId,
        "anomaly-analyze",
        `Anomaly analysis: severity ${parsed.severity}, risk ${riskScore}`,
        {
          severity: parsed.severity,
          riskScore,
          flags: safeFlags,
          resultId: String(report._id),
        },
      );

      return report;
    }),

  /**
   * query: history
   */
  history: protectedProcedure
    .input(
      z.object({
        limit: z.number().int().positive().max(50).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = requireUserId(ctx);

      const reports = await AnomalyReportModel.find({ userId })
        .sort({ createdAt: -1 })
        .limit(input.limit);

      return reports;
    }),
});
