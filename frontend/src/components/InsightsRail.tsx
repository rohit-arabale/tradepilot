import { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Activity,
  AlertTriangle,
  Box,
  CheckCircle2,
  PackageSearch,
  Radio,
  Scale,
  ShieldCheck,
  Truck,
} from "lucide-react";
import { trpc } from "../lib/trpc";
import { formatRelativeTime, shortHash } from "../lib/insights";

interface InsightsRailProps {
  draftId?: string;
  title?: string;
  emptyMessage?: string;
  refetchIntervalMs?: number;
}

interface RailEvent {
  _id: string;
  draftId: string;
  eventType: string;
  summary: string;
  createdAt: string | Date;
}

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  box_count: Box,
  rfid_scan: Radio,
  weight_check: Scale,
  anomaly_report: AlertTriangle,
  manual_inspection: PackageSearch,
  customs_verification: ShieldCheck,
  shipment_diff: PackageSearch,
  load_match: Truck,
  tracking_ping: Activity,
};

const PILL_TONE: Record<string, string> = {
  box_count: "bg-blue-50 text-blue-700 border-blue-200",
  rfid_scan: "bg-slate-50 text-slate-700 border-slate-200",
  weight_check: "bg-amber-50 text-amber-700 border-amber-200",
  anomaly_report: "bg-red-50 text-red-700 border-red-200",
  manual_inspection: "bg-emerald-50 text-emerald-700 border-emerald-200",
  customs_verification: "bg-blue-50 text-blue-700 border-blue-200",
  shipment_diff: "bg-slate-50 text-slate-700 border-slate-200",
  load_match: "bg-blue-50 text-blue-700 border-blue-200",
  tracking_ping: "bg-blue-50 text-blue-700 border-blue-200",
};

function pillClass(eventType: string): string {
  return (
    PILL_TONE[eventType] ?? "bg-slate-50 text-slate-700 border-slate-200"
  );
}

function iconFor(eventType: string) {
  const Icon = ICONS[eventType] ?? CheckCircle2;
  return Icon;
}

function prettyEvent(eventType: string): string {
  return eventType
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Right-rail panel that pulls recent verification activity. If a draftId is
 * supplied it pulls events for that draft; otherwise it pulls the user's
 * global recent activity. Refetches on a configurable interval.
 */
export default function InsightsRail({
  draftId,
  title = "Live Activity",
  emptyMessage = "Nothing has happened on your account yet. Run a verification to populate this rail.",
  refetchIntervalMs = 6000,
}: InsightsRailProps) {
  const hasDraft = Boolean(draftId && draftId.trim().length > 0);

  // Pause polling whenever the document is hidden — InsightsRail is the
  // most aggressive poller on the page and was previously the top
  // background-tab bandwidth consumer.
  const pollWhenVisible = () =>
    typeof document !== "undefined" && document.hidden ? false : refetchIntervalMs;

  const recentQuery = trpc.audit.recent.useQuery(
    { limit: 30 },
    {
      enabled: !hasDraft,
      refetchInterval: pollWhenVisible,
      refetchIntervalInBackground: false,
      refetchOnWindowFocus: false,
    }
  );

  const forDraftQuery = trpc.audit.forDraft.useQuery(
    { draftId: draftId ?? "", limit: 12, order: "newest" },
    {
      enabled: hasDraft,
      refetchInterval: pollWhenVisible,
      refetchIntervalInBackground: false,
      refetchOnWindowFocus: false,
    }
  );

  const events = useMemo<RailEvent[]>(() => {
    const raw = hasDraft ? forDraftQuery.data : recentQuery.data;
    if (!raw) return [];
    // Cast through unknown to dodge Mongoose ObjectId-vs-string TS2352 gripes
    return (raw as unknown as RailEvent[]).slice(0, 12);
  }, [hasDraft, forDraftQuery.data, recentQuery.data]);

  const isLoading = hasDraft ? forDraftQuery.isLoading : recentQuery.isLoading;
  const queryError = hasDraft ? forDraftQuery.error : recentQuery.error;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden lg:sticky lg:top-4">
      <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/60 flex items-center justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-800 truncate">
            {title}
          </p>
          <p className="text-xs text-slate-500 truncate">
            {hasDraft
              ? `Events on draft ${draftId!.slice(0, 8)}…`
              : "Across your account"}
          </p>
        </div>
        <span className="flex items-center gap-1.5 text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          LIVE
        </span>
      </div>

      <div className="max-h-[520px] overflow-y-auto p-3 space-y-2">
        {isLoading ? (
          <RailSkeleton />
        ) : queryError ? (
          <div className="px-3 py-6 text-center">
            <p className="text-xs text-red-600 font-medium">
              Could not load activity.
            </p>
            <p className="text-[11px] text-slate-500 mt-1">
              {queryError.message}
            </p>
          </div>
        ) : events.length === 0 ? (
          <div className="px-3 py-10 text-center">
            <Activity className="w-8 h-8 mx-auto text-slate-300 mb-2" />
            <p className="text-xs text-slate-500 leading-relaxed">
              {emptyMessage}
            </p>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {events.map((e) => {
              const Icon = iconFor(e.eventType);
              const hash = shortHash(
                `${e._id ?? ""}:${e.eventType}:${new Date(
                  e.createdAt
                ).getTime()}`
              );
              return (
                <motion.div
                  key={e._id}
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 6 }}
                  transition={{ duration: 0.18 }}
                  className="group p-3 rounded-xl border border-slate-100 hover:border-blue-200 hover:bg-blue-50/30 transition-colors"
                >
                  <div className="flex items-start gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center flex-shrink-0">
                      <Icon className="w-3.5 h-3.5 text-slate-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-semibold border ${pillClass(
                            e.eventType
                          )}`}
                        >
                          {prettyEvent(e.eventType)}
                        </span>
                        <span className="text-[10px] text-slate-400 whitespace-nowrap">
                          {formatRelativeTime(e.createdAt)}
                        </span>
                      </div>
                      <p className="text-xs text-slate-700 leading-snug mt-1 line-clamp-2">
                        {e.summary}
                      </p>
                      <p className="text-[10px] font-mono text-slate-400 mt-1">
                        #{hash}
                      </p>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}

function RailSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="p-3 rounded-xl border border-slate-100 animate-pulse"
        >
          <div className="flex items-start gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-slate-100 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <div className="h-3 w-20 rounded bg-slate-100" />
                <div className="h-3 w-10 rounded bg-slate-100" />
              </div>
              <div className="h-3 w-full rounded bg-slate-100 mt-2" />
              <div className="h-3 w-3/4 rounded bg-slate-100 mt-1.5" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
