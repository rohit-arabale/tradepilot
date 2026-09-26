import { TRPCError } from "@trpc/server";
import mongoose from "mongoose";
import { z } from "zod";

import { requireUserId } from "../lib/auth.js";
import { protectedProcedure, router } from "../trpc.js";

// ---------------------------------------------------------------------------
// Graceful model accessor — returns the Mongoose model if it has been
// registered, otherwise returns null so missing models don't break startup.
// ---------------------------------------------------------------------------

function getModel(name: string): mongoose.Model<mongoose.Document> | null {
  try {
    return mongoose.model(name) as mongoose.Model<mongoose.Document>;
  } catch {
    return null;
  }
}

interface RecentEvent {
  type: string;
  riskScore: number;
  createdAt: Date;
  summary: string;
}

export const fraudRouter = router({
  /**
   * fraud.summary — aggregated risk metrics for the current user.
   */
  summary: protectedProcedure
    .input(z.object({}).optional())
    .query(async ({ ctx }) => {
      let userId: mongoose.Types.ObjectId;
      try {
        userId = requireUserId(ctx);
      } catch (err) {
        if (err instanceof TRPCError) throw err;
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "User ID not found in token",
        });
      }

      const recentEvents: RecentEvent[] = [];

      // 1. BoxCountResult — count mismatches
      let boxCountMismatches = 0;
      const BoxCountResult = getModel("BoxCountResult");
      if (BoxCountResult) {
        try {
          boxCountMismatches = await BoxCountResult.countDocuments({
            userId,
            mismatch: true,
          });

          const recentBoxEvents = await BoxCountResult.find({ userId })
            .sort({ createdAt: -1 })
            .limit(5)
            .lean();

          for (const doc of recentBoxEvents) {
            const d = doc as Record<string, unknown>;
            recentEvents.push({
              type: "BoxCount",
              riskScore:
                typeof d.mismatchPct === "number" ? Number(d.mismatchPct) / 100 : 0,
              createdAt:
                d.createdAt instanceof Date
                  ? d.createdAt
                  : new Date(String(d.createdAt ?? Date.now())),
              summary: `Box count check: declared ${d.declaredCount ?? "?"}, detected ${d.detectedCount ?? "?"}`,
            });
          }
        } catch {
          // skip gracefully
        }
      }

      // 2. ShipmentDiff — average riskScore
      let avgDamageRiskScore = 0;
      const ShipmentDiff = getModel("ShipmentDiff");
      if (ShipmentDiff) {
        try {
          const pipeline = [
            { $match: { userId } },
            { $group: { _id: null, avg: { $avg: "$riskScore" } } },
          ];
          const result = await ShipmentDiff.aggregate(pipeline);
          // ShipmentDiff.riskScore is stored as 0-100, but the FE expects the
          // ratio (0-1) so it can render via `value * 100` consistently with
          // the per-event riskScore (also 0-1). Normalize here.
          const rawAvg = result[0]?.avg ?? 0;
          avgDamageRiskScore =
            typeof rawAvg === "number" && Number.isFinite(rawAvg)
              ? rawAvg / 100
              : 0;

          const recentDiffEvents = await ShipmentDiff.find({ userId })
            .sort({ createdAt: -1 })
            .limit(5)
            .lean();

          for (const doc of recentDiffEvents) {
            const d = doc as Record<string, unknown>;
            recentEvents.push({
              type: "ShipmentDiff",
              riskScore:
                typeof d.riskScore === "number" ? Number(d.riskScore) / 100 : 0.5,
              createdAt:
                d.createdAt instanceof Date
                  ? d.createdAt
                  : new Date(String(d.createdAt ?? Date.now())),
              summary:
                typeof d.summary === "string"
                  ? d.summary
                  : `Shipment diff detected for ${d.draftId ?? d._id ?? "unknown"}`,
            });
          }
        } catch {
          // skip
        }
      }

      // 3. RfidScanResult — total missing tags
      let totalRfidMissing = 0;
      const RfidScanResult = getModel("RfidScanResult");
      if (RfidScanResult) {
        try {
          const pipeline = [
            { $match: { userId } },
            {
              $group: {
                _id: null,
                total: { $sum: { $size: { $ifNull: ["$missing", []] } } },
              },
            },
          ];
          const result = await RfidScanResult.aggregate(pipeline);
          totalRfidMissing = result[0]?.total ?? 0;

          const recentRfidEvents = await RfidScanResult.find({ userId })
            .sort({ createdAt: -1 })
            .limit(5)
            .lean();

          for (const doc of recentRfidEvents) {
            const d = doc as Record<string, unknown>;
            const matchPct =
              typeof d.matchPct === "number" ? Number(d.matchPct) : 100;
            recentEvents.push({
              type: "RfidScan",
              riskScore: Math.max(0, (100 - matchPct) / 100),
              createdAt:
                d.createdAt instanceof Date
                  ? d.createdAt
                  : new Date(String(d.createdAt ?? Date.now())),
              summary: `RFID scan: ${Array.isArray(d.missing) ? d.missing.length : 0} missing tag(s)`,
            });
          }
        } catch {
          // skip
        }
      }

      // 4. WeightCheck — count flagged
      let weightFlagged = 0;
      const WeightCheck = getModel("WeightCheck");
      if (WeightCheck) {
        try {
          weightFlagged = await WeightCheck.countDocuments({
            userId,
            flagged: true,
          });

          const recentWeightEvents = await WeightCheck.find({ userId })
            .sort({ createdAt: -1 })
            .limit(5)
            .lean();

          for (const doc of recentWeightEvents) {
            const d = doc as Record<string, unknown>;
            recentEvents.push({
              type: "WeightCheck",
              riskScore: d.flagged ? 0.75 : 0.15,
              createdAt:
                d.createdAt instanceof Date
                  ? d.createdAt
                  : new Date(String(d.createdAt ?? Date.now())),
              summary: `Weight check: declared ${d.declaredWeightKg ?? "?"}kg, measured ${d.measuredWeightKg ?? "?"}kg`,
            });
          }
        } catch {
          // skip
        }
      }

      // 5. AnomalyReport — count high-severity
      let anomalyHighSeverity = 0;
      const AnomalyReport = getModel("AnomalyReport");
      if (AnomalyReport) {
        try {
          anomalyHighSeverity = await AnomalyReport.countDocuments({
            userId,
            severity: "high",
          });

          const recentAnomalyEvents = await AnomalyReport.find({ userId })
            .sort({ createdAt: -1 })
            .limit(5)
            .lean();

          for (const doc of recentAnomalyEvents) {
            const d = doc as Record<string, unknown>;
            recentEvents.push({
              type: "Anomaly",
              riskScore:
                typeof d.riskScore === "number" ? Number(d.riskScore) / 100 : 0,
              createdAt:
                d.createdAt instanceof Date
                  ? d.createdAt
                  : new Date(String(d.createdAt ?? Date.now())),
              summary:
                typeof d.summary === "string"
                  ? d.summary
                  : `Anomaly — severity: ${d.severity ?? "unknown"}`,
            });
          }
        } catch {
          // skip
        }
      }

      const sortedRecentEvents = recentEvents
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, 20);

      return {
        boxCountMismatches,
        avgDamageRiskScore: Number((avgDamageRiskScore || 0).toFixed(3)),
        totalRfidMissing,
        weightFlagged,
        anomalyHighSeverity,
        recentEvents: sortedRecentEvents,
      };
    }),
});
