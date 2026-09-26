import { z } from "zod";
import { TRPCError } from "@trpc/server";
import mongoose from "mongoose";

import { router, protectedProcedure } from "../trpc.js";
import { requireUserId, assertObjectId } from "../lib/auth.js";
import { DraftModel } from "../models/Draft.js";
import { BoxCountResultModel } from "../models/BoxCountResult.js";
import { ShipmentDiffModel } from "../models/ShipmentDiff.js";
import { RfidScanResultModel } from "../models/RfidScanResult.js";
import { WeightCheckModel } from "../models/WeightCheck.js";
import { AnomalyReportModel } from "../models/AnomalyReport.js";
import { AuditEventModel } from "../models/AuditEvent.js";
import { TrackingPingModel } from "../models/TrackingPing.js";
import { ComplianceRecordModel } from "../models/ComplianceRecord.js";
import { LoadOfferModel } from "../models/LoadOffer.js";
import { TruckModel } from "../models/Truck.js";

// ---------------------------------------------------------------------------
// Named constants (H7)
// ---------------------------------------------------------------------------

/** Score returned for a subsystem with no data on record. */
const NEUTRAL_SCORE = 70;

/** Weight applied to subsystems with no data — keeps them low-influence. */
const NEUTRAL_WEIGHT = 0.5;

/** Maximum character length accepted for a user-supplied draftId string. */
const DRAFT_ID_MAX_LEN = 100;

/** Maximum number of activity items the caller may request in one query. */
const ACTIVITY_LIMIT_MAX = 100;

/** Default number of activity items per request. */
const ACTIVITY_LIMIT_DEFAULT = 25;

/** Maximum number of drafts sampled when computing average trust score. */
const AVG_TRUST_SAMPLE_SIZE = 25;

/** Maximum characters of text fields surfaced in activity summaries. */
const SUMMARY_MAX_CHARS = 220;

/** Score threshold (inclusive) for a "trusted" verdict. */
const VERDICT_TRUSTED_THRESHOLD = 80;

/** Score threshold (inclusive) for a "watch" verdict. */
const VERDICT_WATCH_THRESHOLD = 60;

/** Risk score above which a shipment-diff or tracking severity is "high". */
const RISK_HIGH_THRESHOLD = 70;

/** Risk score above which a shipment-diff severity is "medium". */
const RISK_MED_THRESHOLD = 40;

/** RFID match-pct below which severity is "high". */
const RFID_HIGH_THRESHOLD = 80;

/** RFID match-pct below which severity is "medium". */
const RFID_MED_THRESHOLD = 95;

/** Box-count mismatch-pct above which severity is "high". */
const BOX_HIGH_THRESHOLD = 20;

/** Box-count mismatch-pct above which severity is "medium". */
const BOX_MED_THRESHOLD = 5;

/** Weight deviation above which severity escalates to "high". */
const WEIGHT_HIGH_DEVIATION = 15;

/** Hard cap for recentTicks length returned by operationsTicker. */
const RECENT_TICKS_MAX = 12;

const SUBSYSTEM_WEIGHTS: Record<Subsystem, number> = {
  boxCount: 1.0,
  shipmentDiff: 1.2,
  rfid: 1.0,
  weight: 0.8,
  anomaly: 1.3,
  compliance: 0.9,
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Subsystem =
  | "boxCount"
  | "shipmentDiff"
  | "rfid"
  | "weight"
  | "anomaly"
  | "compliance";

interface SubsystemBreakdown {
  score: number;
  weight: number;
  latestAt: Date | null;
  note: string;
}

interface ActivityItem {
  id: string;
  type:
    | "box-count"
    | "shipment-diff"
    | "rfid"
    | "weight"
    | "anomaly"
    | "audit"
    | "tracking"
    | "load"
    | "truck"
    | "compliance";
  timestamp: string;
  summary: string;
  severity?: "low" | "medium" | "high";
  draftId?: string;
  icon: string;
}

// ---------------------------------------------------------------------------
// Defensive query helpers — every model query returns null on failure (H3)
// ---------------------------------------------------------------------------

/** Run a Mongoose promise; return null if it rejects so callers stay neutral. */
async function safeFindOne<T>(
  label: string,
  promise: Promise<T | null>,
): Promise<T | null> {
  try {
    return await promise;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[insights] safeFindOne(${label}) failed — returning null:`, message);
    return null;
  }
}

/** Run a Mongoose count; return 0 if it rejects. */
async function safeCount(label: string, promise: Promise<number>): Promise<number> {
  try {
    return await promise;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[insights] safeCount(${label}) failed — returning 0:`, message);
    return 0;
  }
}

/** Run a Mongoose find; return [] if it rejects. */
async function safeFind<T>(label: string, promise: Promise<T[]>): Promise<T[]> {
  try {
    return await promise;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[insights] safeFind(${label}) failed — returning []:`, message);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Scoring helpers — all inputs clamped to [0, 100] (extra directive)
// ---------------------------------------------------------------------------

/** Clamp a numeric value to the inclusive range [0, 100]. */
function clamp100(n: number): number {
  return Math.max(0, Math.min(100, n));
}

function scoreBoxCount(doc: Record<string, unknown> | null): SubsystemBreakdown {
  if (!doc) {
    return {
      score: NEUTRAL_SCORE,
      weight: NEUTRAL_WEIGHT,
      latestAt: null,
      note: "No box count check on record",
    };
  }
  const mismatchPct = clamp100(Number(doc.mismatchPct ?? 0));
  const score = clamp100(100 - mismatchPct * 2);
  return {
    score,
    weight: SUBSYSTEM_WEIGHTS.boxCount,
    latestAt: (doc.createdAt as Date | undefined) ?? null,
    note: `Mismatch ${mismatchPct.toFixed(1)}% (declared ${doc.declaredCount}, detected ${doc.detectedCount})`,
  };
}

function scoreShipmentDiff(
  doc: Record<string, unknown> | null,
): SubsystemBreakdown {
  if (!doc) {
    return {
      score: NEUTRAL_SCORE,
      weight: NEUTRAL_WEIGHT,
      latestAt: null,
      note: "No before/after diff on record",
    };
  }
  const risk = clamp100(Number(doc.riskScore ?? 0));
  const score = clamp100(100 - risk);
  return {
    score,
    weight: SUBSYSTEM_WEIGHTS.shipmentDiff,
    latestAt: (doc.createdAt as Date | undefined) ?? null,
    note: `Risk ${risk} — ${(doc.summary as string | undefined)?.slice(0, 80) ?? ""}`,
  };
}

function scoreRfid(doc: Record<string, unknown> | null): SubsystemBreakdown {
  if (!doc) {
    return {
      score: NEUTRAL_SCORE,
      weight: NEUTRAL_WEIGHT,
      latestAt: null,
      note: "No RFID scan on record",
    };
  }
  const matchPct = clamp100(Number(doc.matchPct ?? 0));
  return {
    score: matchPct,
    weight: SUBSYSTEM_WEIGHTS.rfid,
    latestAt: (doc.createdAt as Date | undefined) ?? null,
    note: `Match ${matchPct.toFixed(1)}%`,
  };
}

function scoreWeight(doc: Record<string, unknown> | null): SubsystemBreakdown {
  if (!doc) {
    return {
      score: NEUTRAL_SCORE,
      weight: NEUTRAL_WEIGHT,
      latestAt: null,
      note: "No weight check on record",
    };
  }
  const flagged = Boolean(doc.flagged);
  const deviationPct = clamp100(Number(doc.deviationPct ?? 0));
  const score = flagged ? clamp100(100 - deviationPct * 5) : 100;
  return {
    score,
    weight: SUBSYSTEM_WEIGHTS.weight,
    latestAt: (doc.createdAt as Date | undefined) ?? null,
    note: flagged
      ? `Flagged — deviation ${deviationPct.toFixed(1)}%`
      : "Within tolerance",
  };
}

function scoreAnomaly(doc: Record<string, unknown> | null): SubsystemBreakdown {
  if (!doc) {
    return {
      score: NEUTRAL_SCORE,
      weight: NEUTRAL_WEIGHT,
      latestAt: null,
      note: "No anomaly check on record",
    };
  }
  const risk = clamp100(Number(doc.riskScore ?? 0));
  const severity = (doc.severity as string | undefined) ?? "low";
  let score = clamp100(100 - risk);
  if (severity === "high") {
    score = clamp100(score - 10);
  }
  return {
    score,
    weight: SUBSYSTEM_WEIGHTS.anomaly,
    latestAt: (doc.createdAt as Date | undefined) ?? null,
    note: `Severity ${severity}, risk ${risk}`,
  };
}

function scoreCompliance(
  doc: Record<string, unknown> | null,
): SubsystemBreakdown {
  if (!doc) {
    return {
      score: NEUTRAL_SCORE,
      weight: NEUTRAL_WEIGHT,
      latestAt: null,
      note: "No compliance data linked to draft",
    };
  }
  const riskLevel = doc.riskLevel as Record<string, unknown> | undefined;
  const rawRisk =
    typeof doc.riskScore === "number"
      ? (doc.riskScore as number)
      : typeof riskLevel?.riskScore === "number"
        ? (riskLevel.riskScore as number)
        : null;

  if (rawRisk === null) {
    return {
      score: NEUTRAL_SCORE,
      weight: NEUTRAL_WEIGHT,
      latestAt: null,
      note: "Compliance present but no risk score",
    };
  }
  const riskScore = clamp100(rawRisk);
  return {
    score: clamp100(100 - riskScore),
    weight: SUBSYSTEM_WEIGHTS.compliance,
    latestAt: null,
    note: `Compliance risk ${riskScore}`,
  };
}

// ---------------------------------------------------------------------------
// Avg trust score helper (used by operationsTicker)
// ---------------------------------------------------------------------------

async function computeAvgTrustScore(
  userId: mongoose.Types.ObjectId,
  draftIds: string[],
  asOf?: Date,
): Promise<number> {
  if (draftIds.length === 0) return 0;

  // Limit how many drafts we inspect — averaging is approximate.
  const sampled = draftIds.slice(0, AVG_TRUST_SAMPLE_SIZE);
  let total = 0;
  let counted = 0;

  for (const draftId of sampled) {
    try {
      const dateClause: Record<string, unknown> | undefined = asOf
        ? { createdAt: { $lte: asOf } }
        : undefined;
      const findFilter: Record<string, unknown> = { userId, draftId };
      if (dateClause) Object.assign(findFilter, dateClause);

      const [box, diff, rfid, weight, anomaly] = await Promise.all([
        safeFindOne("boxCount/avg", BoxCountResultModel.findOne(findFilter).sort({ createdAt: -1 }).lean()),
        safeFindOne("shipmentDiff/avg", ShipmentDiffModel.findOne(findFilter).sort({ createdAt: -1 }).lean()),
        safeFindOne("rfid/avg", RfidScanResultModel.findOne(findFilter).sort({ createdAt: -1 }).lean()),
        safeFindOne("weight/avg", WeightCheckModel.findOne(findFilter).sort({ createdAt: -1 }).lean()),
        safeFindOne("anomaly/avg", AnomalyReportModel.findOne(findFilter).sort({ createdAt: -1 }).lean()),
      ]);

      // Only include subsystems that returned data so a missing subsystem
      // doesn't drag the rolling average toward NEUTRAL_SCORE forever.
      const breakdown: SubsystemBreakdown[] = [
        scoreBoxCount(box as Record<string, unknown> | null),
        scoreShipmentDiff(diff as Record<string, unknown> | null),
        scoreRfid(rfid as Record<string, unknown> | null),
        scoreWeight(weight as Record<string, unknown> | null),
        scoreAnomaly(anomaly as Record<string, unknown> | null),
      ];

      let weighted = 0;
      let weightSum = 0;
      for (const b of breakdown) {
        weighted += b.score * b.weight;
        weightSum += b.weight;
      }
      if (weightSum > 0) {
        total += weighted / weightSum;
        counted += 1;
      }
    } catch (err) {
      // Averaging is best-effort — log and continue.
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[insights] computeAvgTrustScore failed for draftId ${draftId}:`, message);
    }
  }

  return counted > 0 ? total / counted : 0;
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const insightsRouter = router({
  /**
   * Aggregate trust score for a single draft, weighting verification
   * subsystems and returning a per-system breakdown.
   */
  shipmentTrustScore: protectedProcedure
    .input(
      z.object({
        draftId: z.string().min(1).max(DRAFT_ID_MAX_LEN),
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = requireUserId(ctx);
      const { draftId } = input;

      const [latestBox, latestDiff, latestRfid, latestWeight, latestAnomaly] =
        await Promise.all([
          safeFindOne(
            "boxCount",
            BoxCountResultModel.findOne({ userId, draftId })
              .sort({ createdAt: -1 })
              .lean(),
          ),
          safeFindOne(
            "shipmentDiff",
            ShipmentDiffModel.findOne({ userId, draftId })
              .sort({ createdAt: -1 })
              .lean(),
          ),
          safeFindOne(
            "rfid",
            RfidScanResultModel.findOne({ userId, draftId })
              .sort({ createdAt: -1 })
              .lean(),
          ),
          safeFindOne(
            "weight",
            WeightCheckModel.findOne({ userId, draftId })
              .sort({ createdAt: -1 })
              .lean(),
          ),
          safeFindOne(
            "anomaly",
            AnomalyReportModel.findOne({ userId, draftId })
              .sort({ createdAt: -1 })
              .lean(),
          ),
        ]);

      // Compliance is linked via draft (no direct draftId on ComplianceRecord).
      let latestCompliance: Record<string, unknown> | null = null;
      if (mongoose.Types.ObjectId.isValid(draftId)) {
        try {
          const draft = await DraftModel.findOne({
            _id: draftId,
            userId,
          }).lean();
          if (draft) {
            const draftCompliance = (
              draft as unknown as Record<string, unknown>
            ).complianceData;
            if (
              draftCompliance &&
              typeof draftCompliance === "object" &&
              Object.keys(draftCompliance).length > 0
            ) {
              latestCompliance = draftCompliance as Record<string, unknown>;
            }
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.warn("[insights] shipmentTrustScore — compliance fetch failed:", message);
        }
      }

      // ----- per-subsystem score helpers -----
      const breakdown: Record<Subsystem, SubsystemBreakdown> = {
        boxCount: scoreBoxCount(latestBox as Record<string, unknown> | null),
        shipmentDiff: scoreShipmentDiff(
          latestDiff as Record<string, unknown> | null,
        ),
        rfid: scoreRfid(latestRfid as Record<string, unknown> | null),
        weight: scoreWeight(latestWeight as Record<string, unknown> | null),
        anomaly: scoreAnomaly(latestAnomaly as Record<string, unknown> | null),
        compliance: scoreCompliance(latestCompliance),
      };

      // Weighted average — inputs already clamped inside score helpers.
      let totalWeighted = 0;
      let totalWeight = 0;
      const signals: Array<{
        type: string;
        value: number;
        contribution: number;
      }> = [];

      for (const key of Object.keys(breakdown) as Subsystem[]) {
        const b = breakdown[key];
        totalWeighted += b.score * b.weight;
        totalWeight += b.weight;
        signals.push({
          type: key,
          value: b.score,
          contribution: Math.round(b.score * b.weight * 100) / 100,
        });
      }
      signals.sort((a, b) => b.contribution - a.contribution);

      const score =
        totalWeight > 0
          ? clamp100(Math.round(totalWeighted / totalWeight))
          : 0;
      const verdict: "trusted" | "watch" | "high-risk" =
        score >= VERDICT_TRUSTED_THRESHOLD
          ? "trusted"
          : score >= VERDICT_WATCH_THRESHOLD
            ? "watch"
            : "high-risk";

      return {
        score,
        verdict,
        breakdown,
        signals,
      };
    }),

  /**
   * Returns a unified, time-sorted list of activity across all verification
   * subsystems. Optional draftId restricts to a single shipment.
   */
  recentActivity: protectedProcedure
    .input(
      z.object({
        limit: z
          .number()
          .int()
          .positive()
          .max(ACTIVITY_LIMIT_MAX)
          .default(ACTIVITY_LIMIT_DEFAULT),
        draftId: z.string().max(DRAFT_ID_MAX_LEN).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = requireUserId(ctx);
      const { limit, draftId } = input;

      const baseFilter: Record<string, unknown> = { userId };
      if (draftId) baseFilter.draftId = draftId;

      const [
        boxes,
        diffs,
        rfids,
        weights,
        anomalies,
        audits,
        pings,
        loads,
        trucks,
        compliances,
      ] = await Promise.all([
        safeFind(
          "boxCount",
          BoxCountResultModel.find(baseFilter)
            .sort({ createdAt: -1 })
            .limit(limit)
            .lean() as Promise<Record<string, unknown>[]>,
        ),
        safeFind(
          "shipmentDiff",
          ShipmentDiffModel.find(baseFilter)
            .sort({ createdAt: -1 })
            .limit(limit)
            .lean() as Promise<Record<string, unknown>[]>,
        ),
        safeFind(
          "rfid",
          RfidScanResultModel.find(baseFilter)
            .sort({ createdAt: -1 })
            .limit(limit)
            .lean() as Promise<Record<string, unknown>[]>,
        ),
        safeFind(
          "weight",
          WeightCheckModel.find(baseFilter)
            .sort({ createdAt: -1 })
            .limit(limit)
            .lean() as Promise<Record<string, unknown>[]>,
        ),
        safeFind(
          "anomaly",
          AnomalyReportModel.find(baseFilter)
            .sort({ createdAt: -1 })
            .limit(limit)
            .lean() as Promise<Record<string, unknown>[]>,
        ),
        safeFind(
          "audit",
          AuditEventModel.find(baseFilter)
            .sort({ createdAt: -1 })
            .limit(limit)
            .lean() as Promise<Record<string, unknown>[]>,
        ),
        // Tracking pings — show whenever the user has them. Filter by draftId
        // when provided; otherwise return the user's most recent global pings.
        safeFind(
          "tracking",
          TrackingPingModel.find(baseFilter)
            .sort({ createdAt: -1 })
            .limit(limit)
            .lean() as Promise<Record<string, unknown>[]>,
        ),
        // LoadOffer has no draftId field — only surface in global view.
        draftId
          ? Promise.resolve([] as Record<string, unknown>[])
          : safeFind(
              "loads",
              LoadOfferModel.find({ userId })
                .sort({ createdAt: -1 })
                .limit(limit)
                .lean() as Promise<Record<string, unknown>[]>,
            ),
        // Truck has no draftId field — only surface in global view.
        draftId
          ? Promise.resolve([] as Record<string, unknown>[])
          : safeFind(
              "trucks",
              TruckModel.find({ userId })
                .sort({ createdAt: -1 })
                .limit(limit)
                .lean() as Promise<Record<string, unknown>[]>,
            ),
        // ComplianceRecord has no draftId field — only surface in global view.
        // Uses `timestamp` (not `createdAt`) per schema.
        draftId
          ? Promise.resolve([] as Record<string, unknown>[])
          : safeFind(
              "compliance",
              ComplianceRecordModel.find({ userId })
                .sort({ timestamp: -1 })
                .limit(limit)
                .lean() as Promise<Record<string, unknown>[]>,
            ),
      ]);

      const items: ActivityItem[] = [];

      for (const b of boxes) {
        const created = b.createdAt as Date | undefined;
        const mismatchPct = Number(b.mismatchPct ?? 0);
        items.push({
          id: String(b._id ?? ""),
          type: "box-count",
          timestamp: (created ?? new Date()).toISOString(),
          summary: `Box count: declared ${b.declaredCount}, detected ${b.detectedCount}`,
          severity:
            mismatchPct > BOX_HIGH_THRESHOLD
              ? "high"
              : mismatchPct > BOX_MED_THRESHOLD
                ? "medium"
                : "low",
          draftId: (b.draftId as string | undefined) ?? undefined,
          icon: "package",
        });
      }

      for (const d of diffs) {
        const created = d.createdAt as Date | undefined;
        const risk = Number(d.riskScore ?? 0);
        items.push({
          id: String(d._id ?? ""),
          type: "shipment-diff",
          timestamp: (created ?? new Date()).toISOString(),
          summary: (
            (d.summary as string) ?? `Shipment diff (risk ${risk})`
          ).slice(0, SUMMARY_MAX_CHARS),
          severity:
            risk > RISK_HIGH_THRESHOLD
              ? "high"
              : risk > RISK_MED_THRESHOLD
                ? "medium"
                : "low",
          draftId: (d.draftId as string | undefined) ?? undefined,
          icon: "scan",
        });
      }

      for (const r of rfids) {
        const created = r.createdAt as Date | undefined;
        const matchPct = Number(r.matchPct ?? 0);
        items.push({
          id: String(r._id ?? ""),
          type: "rfid",
          timestamp: (created ?? new Date()).toISOString(),
          summary: `RFID match ${matchPct.toFixed(1)}%`,
          severity:
            matchPct < RFID_HIGH_THRESHOLD
              ? "high"
              : matchPct < RFID_MED_THRESHOLD
                ? "medium"
                : "low",
          draftId: (r.draftId as string | undefined) ?? undefined,
          icon: "tag",
        });
      }

      for (const w of weights) {
        const created = w.createdAt as Date | undefined;
        const dev = Number(w.deviationPct ?? 0);
        const flagged = Boolean(w.flagged);
        items.push({
          id: String(w._id ?? ""),
          type: "weight",
          timestamp: (created ?? new Date()).toISOString(),
          summary: `Weight deviation ${dev.toFixed(1)}%${flagged ? " (flagged)" : ""}`,
          severity:
            flagged && dev > WEIGHT_HIGH_DEVIATION
              ? "high"
              : flagged
                ? "medium"
                : "low",
          draftId: (w.draftId as string | undefined) ?? undefined,
          icon: "scale",
        });
      }

      for (const a of anomalies) {
        const created = a.createdAt as Date | undefined;
        const sev = ((a.severity as "low" | "medium" | "high" | undefined) ??
          "low");
        items.push({
          id: String(a._id ?? ""),
          type: "anomaly",
          timestamp: (created ?? new Date()).toISOString(),
          summary: (
            (a.summary as string) ?? "Anomaly report"
          ).slice(0, SUMMARY_MAX_CHARS),
          severity: sev,
          draftId: (a.draftId as string | undefined) ?? undefined,
          icon: "alert",
        });
      }

      for (const ev of audits) {
        const created = ev.createdAt as Date | undefined;
        // Audit events sometimes carry severity in the payload (e.g. the
        // anomaly-analyze writer copies parsed.severity). Surface it so the
        // UI doesn't blanket everything as "low".
        const payload = (ev.payload as Record<string, unknown> | undefined) ?? {};
        const sevRaw = payload.severity;
        const severity: "low" | "medium" | "high" =
          sevRaw === "high" || sevRaw === "medium" || sevRaw === "low"
            ? sevRaw
            : "low";
        items.push({
          id: String(ev._id ?? ""),
          type: "audit",
          timestamp: (created ?? new Date()).toISOString(),
          summary: (
            (ev.summary as string) ??
            (ev.eventType as string) ??
            "Audit event"
          ).slice(0, SUMMARY_MAX_CHARS),
          severity,
          draftId: (ev.draftId as string | undefined) ?? undefined,
          icon: "audit",
        });
      }

      for (const p of pings) {
        const created = p.createdAt as Date | undefined;
        items.push({
          id: String(p._id ?? ""),
          type: "tracking",
          timestamp: (created ?? new Date()).toISOString(),
          summary: `Tracking ping (${Math.round(Number(p.distanceKm ?? 0))} km to destination)`,
          severity: "low",
          draftId: (p.draftId as string | undefined) ?? undefined,
          icon: "map",
        });
      }

      for (const lo of loads) {
        const created = lo.createdAt as Date | undefined;
        items.push({
          id: String(lo._id ?? ""),
          type: "load",
          timestamp: (created ?? new Date()).toISOString(),
          summary: `Load offer ${lo.originCity} → ${lo.destinationCity}`,
          severity: "low",
          icon: "truck",
        });
      }

      for (const t of trucks) {
        const created = t.createdAt as Date | undefined;
        items.push({
          id: String(t._id ?? ""),
          type: "truck",
          timestamp: (created ?? new Date()).toISOString(),
          summary: `Truck ${t.plate} registered`,
          severity: "low",
          icon: "truck",
        });
      }

      for (const c of compliances) {
        // ComplianceRecord uses `timestamp` (not `createdAt`).
        const ts = (c.timestamp as Date | undefined) ?? (c.createdAt as Date | undefined);
        const cType = (c.type as string | undefined) ?? "compliance";
        const formData = (c.formData as Record<string, unknown> | undefined) ?? {};
        const productName =
          (formData.productName as string | undefined) ??
          (formData.shipmentId as string | undefined);
        const summary = productName
          ? `Compliance check (${cType}) — ${productName}`
          : `Compliance check (${cType})`;
        // ComplianceRecord may carry a riskLevel.riskScore in complianceResponse.
        const response = (c.complianceResponse as Record<string, unknown> | undefined) ?? {};
        const responseRiskLevel = response.riskLevel as
          | Record<string, unknown>
          | undefined;
        const rawScore =
          typeof response.riskScore === "number"
            ? (response.riskScore as number)
            : typeof responseRiskLevel?.riskScore === "number"
              ? (responseRiskLevel.riskScore as number)
              : null;
        const severity: "low" | "medium" | "high" =
          rawScore === null
            ? "low"
            : rawScore > RISK_HIGH_THRESHOLD
              ? "high"
              : rawScore > RISK_MED_THRESHOLD
                ? "medium"
                : "low";
        items.push({
          id: String(c._id ?? ""),
          type: "compliance",
          timestamp: (ts ?? new Date()).toISOString(),
          summary: summary.slice(0, SUMMARY_MAX_CHARS),
          severity,
          icon: "shield",
        });
      }

      items.sort(
        (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
      );

      return items.slice(0, limit);
    }),

  /**
   * Returns every linked artefact for a single draft — used by the
   * "Shipment dossier" UI so the frontend can render the full story with
   * one query.
   */
  draftBundle: protectedProcedure
    .input(
      z.object({
        draftId: z.string().min(1).max(DRAFT_ID_MAX_LEN),
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = requireUserId(ctx);
      const { draftId } = input;

      if (!mongoose.Types.ObjectId.isValid(draftId)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid draftId format",
        });
      }

      const [
        draft,
        boxCount,
        shipmentDiff,
        rfid,
        weight,
        anomaly,
        latestPing,
        audit,
      ] = await Promise.all([
        safeFindOne(
          "draft",
          DraftModel.findOne({ _id: draftId, userId }).lean(),
        ),
        safeFindOne(
          "boxCount",
          BoxCountResultModel.findOne({ userId, draftId })
            .sort({ createdAt: -1 })
            .lean(),
        ),
        safeFindOne(
          "shipmentDiff",
          ShipmentDiffModel.findOne({ userId, draftId })
            .sort({ createdAt: -1 })
            .lean(),
        ),
        safeFindOne(
          "rfid",
          RfidScanResultModel.findOne({ userId, draftId })
            .sort({ createdAt: -1 })
            .lean(),
        ),
        safeFindOne(
          "weight",
          WeightCheckModel.findOne({ userId, draftId })
            .sort({ createdAt: -1 })
            .lean(),
        ),
        safeFindOne(
          "anomaly",
          AnomalyReportModel.findOne({ userId, draftId })
            .sort({ createdAt: -1 })
            .lean(),
        ),
        safeFindOne(
          "tracking",
          TrackingPingModel.findOne({ userId, draftId })
            .sort({ createdAt: -1 })
            .lean(),
        ),
        safeFind(
          "audit",
          AuditEventModel.find({ userId, draftId })
            .sort({ createdAt: 1 })
            .lean() as Promise<Record<string, unknown>[]>,
        ),
      ]);

      // Compliance is embedded on the draft as `complianceData`. Prefer it so
      // we return compliance for THIS draft (not the user's most recent record,
      // which may belong to a different shipment).
      let compliance: Record<string, unknown> | null = null;
      if (draft) {
        const draftCompliance = (draft as unknown as Record<string, unknown>)
          .complianceData;
        if (
          draftCompliance &&
          typeof draftCompliance === "object" &&
          Object.keys(draftCompliance as Record<string, unknown>).length > 0
        ) {
          compliance = draftCompliance as Record<string, unknown>;
        }
      }

      return {
        draft: draft ?? null,
        boxCount: boxCount ?? null,
        shipmentDiff: shipmentDiff ?? null,
        rfid: rfid ?? null,
        weight: weight ?? null,
        anomaly: anomaly ?? null,
        latestPing: latestPing ?? null,
        audit: audit ?? [],
        compliance,
      };
    }),

  /**
   * Live operations ticker — counts and rolling averages displayed in the
   * dashboard hero strip.
   */
  operationsTicker: protectedProcedure
    .input(z.object({}).optional())
    .query(async ({ ctx }) => {
      const userId = requireUserId(ctx);

      const now = Date.now();
      const twentyFourHoursAgo = new Date(now - 24 * 60 * 60 * 1000);

      const [
        activeShipments,
        openLoads,
        registeredTrucks,
        highRiskEventsLast24h,
        drafts,
        recentTicks,
      ] = await Promise.all([
        safeCount("activeShipments", DraftModel.countDocuments({ userId })),
        safeCount("openLoads", LoadOfferModel.countDocuments({ userId, status: "open" })),
        safeCount("registeredTrucks", TruckModel.countDocuments({ userId })),
        safeCount(
          "highRiskEvents",
          AnomalyReportModel.countDocuments({
            userId,
            severity: "high",
            createdAt: { $gte: twentyFourHoursAgo },
          }),
        ),
        safeFind(
          "drafts",
          DraftModel.find({ userId })
            .select({ _id: 1 })
            .sort({ timestamp: -1 })
            .limit(AVG_TRUST_SAMPLE_SIZE)
            .lean() as Promise<Record<string, unknown>[]>,
        ),
        safeFind(
          "recentTicks",
          AuditEventModel.find({ userId })
            .sort({ createdAt: -1 })
            .limit(RECENT_TICKS_MAX)
            .lean() as Promise<Record<string, unknown>[]>,
        ),
      ]);

      const draftIds = drafts.map((d) => String(d._id));

      const [avgTrustScore, avgTrustScore24hAgo] = await Promise.all([
        computeAvgTrustScore(userId, draftIds, undefined),
        computeAvgTrustScore(userId, draftIds, twentyFourHoursAgo),
      ]);

      const ticks = recentTicks
        .slice(0, RECENT_TICKS_MAX)
        .map((ev) => {
          const created = ev.createdAt as Date | undefined;
          return {
            type: (ev.eventType as string) ?? "audit",
            summary: ((ev.summary as string) ?? "Event").slice(0, SUMMARY_MAX_CHARS),
            ts: (created ?? new Date()).toISOString(),
            severity: "low" as const,
          };
        });

      return {
        activeShipments,
        openLoads,
        registeredTrucks,
        highRiskEventsLast24h,
        avgTrustScore: clamp100(Math.round(avgTrustScore)),
        avgTrustScoreDelta:
          clamp100(Math.round(avgTrustScore)) -
          clamp100(Math.round(avgTrustScore24hAgo)),
        recentTicks: ticks,
      };
    }),
});

// Re-export so non-call-sites can reference the helper if needed.
export { assertObjectId };
