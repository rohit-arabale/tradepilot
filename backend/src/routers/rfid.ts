import mongoose from "mongoose";
import { z } from "zod";

import { requireUserId } from "../lib/auth.js";
import { AnomalyReportModel } from "../models/AnomalyReport.js";
import { AuditEventModel } from "../models/AuditEvent.js";
import { RfidScanResultModel } from "../models/RfidScanResult.js";
import { protectedProcedure, router } from "../trpc.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
/** matchPct threshold below which an AnomalyReport is emitted */
const ANOMALY_MATCH_PCT_THRESHOLD = 80;
/** matchPct threshold below which severity is elevated to "high" */
const HIGH_SEVERITY_MATCH_PCT_THRESHOLD = 50;
/** Maximum number of tags per list to prevent abuse */
const MAX_TAGS_PER_LIST = 5000;
/** Maximum character length of a single RFID tag string */
const MAX_TAG_LEN = 256;
/** Upper bound for riskScore */
const MAX_RISK_SCORE = 100;

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
export const rfidRouter = router({
  /**
   * POST rfid.verify
   * Compares a manifest tag list against a scanned tag list and persists the result.
   */
  verify: protectedProcedure
    .input(
      z.object({
        draftId: z.string().max(100).optional(),
        // Case-insensitive dedupe — preserve original casing of the FIRST occurrence
        // and drop trimmed-empty entries. This matches the frontend parseTags() contract
        // so "ABC" and "abc" in the same list don't both survive into the database.
        manifestTags: z
          .array(z.string().max(MAX_TAG_LEN))
          .min(1)
          .max(MAX_TAGS_PER_LIST)
          .transform((tags) => {
            const seen = new Set<string>();
            const out: string[] = [];
            for (const t of tags) {
              const trimmed = t.trim();
              if (trimmed.length === 0) continue;
              const key = trimmed.toLowerCase();
              if (seen.has(key)) continue;
              seen.add(key);
              out.push(trimmed);
            }
            return out;
          })
          .refine((tags) => tags.length > 0, {
            message: "Manifest tag list must contain at least one non-empty tag",
          }),
        scannedTags: z
          .array(z.string().max(MAX_TAG_LEN))
          .max(MAX_TAGS_PER_LIST)
          .transform((tags) => {
            const seen = new Set<string>();
            const out: string[] = [];
            for (const t of tags) {
              const trimmed = t.trim();
              if (trimmed.length === 0) continue;
              const key = trimmed.toLowerCase();
              if (seen.has(key)) continue;
              seen.add(key);
              out.push(trimmed);
            }
            return out;
          }),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = requireUserId(ctx);

      const { draftId, manifestTags, scannedTags } = input;

      const normalizeTag = (t: string) => t.trim().toLowerCase();

      const normalizedManifest = manifestTags.map(normalizeTag);
      const normalizedScanned = scannedTags.map(normalizeTag);

      const manifestSet = new Set(normalizedManifest);
      const scannedSet = new Set(normalizedScanned);

      const matched = manifestTags.filter((t) =>
        scannedSet.has(normalizeTag(t)),
      );
      const missing = manifestTags.filter(
        (t) => !scannedSet.has(normalizeTag(t)),
      );
      const extra = scannedTags.filter(
        (t) => !manifestSet.has(normalizeTag(t)),
      );

      const matchPct =
        manifestTags.length > 0
          ? Math.min(100, (matched.length / manifestTags.length) * 100)
          : 0;

      const doc = await RfidScanResultModel.create({
        userId,
        ...(draftId ? { draftId } : {}),
        manifestTags,
        scannedTags,
        matched,
        missing,
        extra,
        matchPct,
        createdAt: new Date(),
      });

      await writeAudit(
        userId,
        draftId,
        "rfid-verify",
        `RFID scan: ${matched.length}/${manifestTags.length} matched (${matchPct.toFixed(1)}%)`,
        {
          matchPct,
          missingCount: missing.length,
          extraCount: extra.length,
          resultId: String(doc._id),
        },
      );

      // Cross-feature linkage: emit AnomalyReport when match rate is low.
      if (matchPct < ANOMALY_MATCH_PCT_THRESHOLD) {
        try {
          await AnomalyReportModel.create({
            userId,
            draftId,
            declaredWeightKg: 0,
            measuredWeightKg: 0,
            declaredCount: manifestTags.length,
            detectedCount: matched.length,
            flags: ["rfid-shortfall"],
            severity: matchPct < HIGH_SEVERITY_MATCH_PCT_THRESHOLD ? "high" : "medium",
            riskScore: Math.min(MAX_RISK_SCORE, Math.round(100 - matchPct)),
            summary: `RFID scan shortfall: ${matchPct.toFixed(1)}% matched (${missing.length} missing tags).`,
            createdAt: new Date(),
          });
        } catch (err) {
          console.error("[rfid.verify] anomaly emit failed:", (err as Error)?.message);
        }
      }

      return doc;
    }),

  /**
   * GET rfid.history
   */
  history: protectedProcedure
    .input(
      z.object({
        limit: z.number().int().positive().max(50).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = requireUserId(ctx);

      const results = await RfidScanResultModel.find({ userId })
        .sort({ createdAt: -1 })
        .limit(input.limit);

      return results;
    }),
});
