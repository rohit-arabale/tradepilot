import React, { useEffect, useRef, useState } from "react";
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Scale, RefreshCcw, Activity } from "lucide-react";
import CountUp from "../../components/CountUp";
import CardSkeleton from "../../components/skeletons/CardSkeleton";
import { trpc } from "../../lib/trpc";
import AIThinking from "../../components/AIThinking";
import ReferenceNewsButton from "../../components/ReferenceNewsButton";

// ─── constants ────────────────────────────────────────────────────────────────
const IDLE_TICK_MS = 500;
const STREAM_TICK_MS = 180;
const STREAM_STEPS = 20;
const IDLE_BASELINE_KG = 50;
const SERIES_WINDOW = 29;
const DEFAULT_THRESHOLD_PCT = "5";
const HISTORY_LIMIT = 20;

interface FormState {
  declaredWeightKg: string;
  measuredWeightKg: string;
  thresholdPct: string;
}

const initialForm: FormState = {
  declaredWeightKg: "",
  measuredWeightKg: "",
  thresholdPct: DEFAULT_THRESHOLD_PCT,
};

function makeIdleSeries(): { t: number; kg: number }[] {
  const out: { t: number; kg: number }[] = [];
  for (let i = 0; i < 30; i++) {
    const drift = Math.sin(i * 0.35) * 0.4 + Math.cos(i * 0.7) * 0.15;
    out.push({ t: i, kg: IDLE_BASELINE_KG + drift });
  }
  return out;
}

function fmtDate(d: Date | string): string {
  return new Date(d).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtPct(n: number, decimals = 2): string {
  return `${n.toFixed(decimals)}%`;
}

interface WeightCheckTabProps {
  draftId: string;
  onResult?: (passed: boolean) => void;
}

export default function WeightCheckTab({ draftId, onResult }: WeightCheckTabProps) {
  const [form, setForm] = useState<FormState>(initialForm);
  const [series, setSeries] = useState<{ t: number; kg: number }[]>(() =>
    makeIdleSeries()
  );
  const [streaming, setStreaming] = useState(false);

  const idleTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  const [submitError, setSubmitError] = useState<string>("");
  const utils = trpc.useUtils();

  const submitMutation = trpc.weightCheck.submit.useMutation({
    onSuccess: (data) => {
      setSubmitError("");
      utils.weightCheck.history.invalidate().catch(() => void 0);
      onResult?.(!data.flagged);
    },
    onError: (err) => {
      setSubmitError(err.message || "Failed to submit weight check.");
    },
  });

  const historyQuery = trpc.weightCheck.history.useQuery({ limit: HISTORY_LIMIT });

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (idleTimerRef.current) clearInterval(idleTimerRef.current);
      if (streamTimerRef.current) clearInterval(streamTimerRef.current);
      idleTimerRef.current = null;
      streamTimerRef.current = null;
    };
  }, []);

  const formRef = useRef(form);
  useEffect(() => { formRef.current = form; }, [form]);

  useEffect(() => {
    if (streaming) return;
    idleTimerRef.current = setInterval(() => {
      if (!mountedRef.current) return;
      setSeries((prev) => {
        const last = prev.length > 0 ? prev[prev.length - 1].kg : IDLE_BASELINE_KG;
        const f = formRef.current;
        const target =
          parseFloat(f.measuredWeightKg) ||
          parseFloat(f.declaredWeightKg) ||
          IDLE_BASELINE_KG;
        const drift = (Math.random() - 0.5) * 0.3 + (target - last) * 0.005;
        const nextKg = last + drift;
        const nextT = (prev[prev.length - 1]?.t ?? 0) + 1;
        return [...prev.slice(-SERIES_WINDOW), { t: nextT, kg: nextKg }];
      });
    }, IDLE_TICK_MS);
    return () => {
      if (idleTimerRef.current) clearInterval(idleTimerRef.current);
      idleTimerRef.current = null;
    };
  }, [streaming]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const streamResolverRef = useRef<((cancelled: boolean) => void) | null>(null);

  const runStream = (declared: number, measured: number): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      if (!mountedRef.current) { resolve(true); return; }
      setStreaming(true);
      streamResolverRef.current = resolve;
      if (idleTimerRef.current) {
        clearInterval(idleTimerRef.current);
        idleTimerRef.current = null;
      }
      let step = 0;
      streamTimerRef.current = setInterval(() => {
        if (!mountedRef.current) {
          if (streamTimerRef.current) clearInterval(streamTimerRef.current);
          streamTimerRef.current = null;
          streamResolverRef.current = null;
          resolve(true);
          return;
        }
        step++;
        const progress = step / STREAM_STEPS;
        const eased = 1 - Math.pow(1 - progress, 2);
        const target = declared + (measured - declared) * eased;
        const noise = (Math.random() - 0.5) * 0.25;
        const value = target + noise;
        setSeries((prev) => {
          const nextT = (prev[prev.length - 1]?.t ?? 0) + 1;
          return [...prev.slice(-SERIES_WINDOW), { t: nextT, kg: value }];
        });
        if (step >= STREAM_STEPS) {
          if (streamTimerRef.current) clearInterval(streamTimerRef.current);
          streamTimerRef.current = null;
          setSeries((prev) => {
            const nextT = (prev[prev.length - 1]?.t ?? 0) + 1;
            return [...prev.slice(-SERIES_WINDOW), { t: nextT, kg: measured }];
          });
          if (mountedRef.current) setStreaming(false);
          streamResolverRef.current = null;
          resolve(false);
        }
      }, STREAM_TICK_MS);
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (streaming || submitMutation.isPending) return;

    const declared = parseFloat(form.declaredWeightKg);
    const measured = parseFloat(form.measuredWeightKg);
    const threshold = parseFloat(form.thresholdPct);

    if (isNaN(declared) || declared <= 0) {
      setSubmitError("Declared weight must be a positive number.");
      return;
    }
    if (isNaN(measured) || measured < 0) {
      setSubmitError("Measured weight cannot be negative.");
      return;
    }
    if (isNaN(threshold) || threshold < 0) {
      setSubmitError("Threshold must be a non-negative number.");
      return;
    }
    setSubmitError("");

    const cancelled = await runStream(declared, measured);
    if (!mountedRef.current || cancelled) return;

    submitMutation.mutate({
      ...(draftId.trim() ? { draftId: draftId.trim() } : {}),
      declaredWeightKg: declared,
      measuredWeightKg: measured,
      thresholdPct: threshold,
    });
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && streaming) {
        if (streamTimerRef.current) clearInterval(streamTimerRef.current);
        streamTimerRef.current = null;
        if (mountedRef.current) setStreaming(false);
        const resolver = streamResolverRef.current;
        streamResolverRef.current = null;
        if (resolver) resolver(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [streaming]);

  const latestResult = submitMutation.data;
  const declaredFloat = parseFloat(form.declaredWeightKg);
  const measuredFloat = parseFloat(form.measuredWeightKg);
  const livePct =
    !isNaN(declaredFloat) && !isNaN(measuredFloat) && declaredFloat > 0
      ? ((measuredFloat - declaredFloat) / declaredFloat) * 100
      : 0;
  const needleAngle = Math.max(-90, Math.min(90, (livePct / 25) * 90));
  const parsedThreshold = parseFloat(form.thresholdPct);
  const effectiveThreshold = Number.isFinite(parsedThreshold) && parsedThreshold >= 0
    ? parsedThreshold
    : parseFloat(DEFAULT_THRESHOLD_PCT);

  const chartMin =
    series.length > 0 ? Math.min(...series.map((p) => p.kg)) - 1 : IDLE_BASELINE_KG - 1;
  const chartMax =
    series.length > 0 ? Math.max(...series.map((p) => p.kg)) + 1 : IDLE_BASELINE_KG + 1;

  return (
    <div className="space-y-6">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 sm:p-6">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Activity
                className={`w-4 h-4 ${streaming ? "text-blue-600" : "text-slate-500"}`}
                aria-hidden="true"
              />
              <h2 className="text-base font-semibold text-slate-800">Load Sensor Stream</h2>
            </div>
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                streaming
                  ? "bg-blue-100 text-blue-700"
                  : "bg-emerald-100 text-emerald-700"
              }`}
              aria-live="polite"
            >
              {streaming ? "STREAMING" : "STABLE"}
            </span>
          </div>
          <div className="h-44 -mx-2">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series} margin={{ top: 6, right: 12, left: 12, bottom: 4 }}>
                <XAxis dataKey="t" hide />
                <YAxis
                  domain={[chartMin, chartMax]}
                  width={42}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 10, fill: "#94a3b8" }}
                  tickFormatter={(v) => `${(v as number).toFixed(1)}`}
                />
                <Tooltip
                  contentStyle={{ borderRadius: 8, fontSize: 12, border: "1px solid #e2e8f0" }}
                  formatter={(v: number) => [`${v.toFixed(2)} kg`, "reading"]}
                  labelFormatter={() => ""}
                />
                <Line
                  type="monotone"
                  dataKey="kg"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-8">
          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div className="flex flex-col gap-1">
                <label className="text-sm font-semibold text-slate-600" htmlFor="declaredWeightKg">
                  Declared Weight (kg) <span className="text-red-500">*</span>
                </label>
                <input
                  id="declaredWeightKg"
                  name="declaredWeightKg"
                  type="number"
                  min="0.001"
                  step="0.001"
                  required
                  placeholder="e.g. 100.00"
                  value={form.declaredWeightKg}
                  onChange={handleChange}
                  className="px-4 py-2.5 border-2 border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-sm font-semibold text-slate-600" htmlFor="measuredWeightKg">
                  Measured Weight (kg) <span className="text-red-500">*</span>
                </label>
                <input
                  id="measuredWeightKg"
                  name="measuredWeightKg"
                  type="number"
                  min="0"
                  step="0.001"
                  required
                  placeholder="e.g. 103.50"
                  value={form.measuredWeightKg}
                  onChange={handleChange}
                  className="px-4 py-2.5 border-2 border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-sm font-semibold text-slate-600" htmlFor="thresholdPct">
                  Deviation Threshold (%)
                </label>
                <input
                  id="thresholdPct"
                  name="thresholdPct"
                  type="number"
                  min="0"
                  step="0.1"
                  placeholder={`Default: ${DEFAULT_THRESHOLD_PCT}`}
                  value={form.thresholdPct}
                  onChange={handleChange}
                  className="px-4 py-2.5 border-2 border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>

            {submitError && (
              <p className="text-sm text-red-600" role="alert">{submitError}</p>
            )}

            <div className="flex justify-end items-center gap-3 pt-2">
              {streaming && (
                <button
                  type="button"
                  onClick={() => {
                    if (streamTimerRef.current) clearInterval(streamTimerRef.current);
                    streamTimerRef.current = null;
                    setStreaming(false);
                    const resolver = streamResolverRef.current;
                    streamResolverRef.current = null;
                    if (resolver) resolver(true);
                  }}
                  className="px-6 py-2.5 text-sm font-medium text-slate-600 hover:text-slate-800 rounded-xl border border-slate-200 hover:border-slate-300"
                >
                  Cancel
                </button>
              )}
              <button
                type="submit"
                disabled={submitMutation.isPending || streaming}
                className="px-8 py-2.5 bg-gray-900 hover:bg-gray-800 disabled:bg-slate-400 text-white font-semibold rounded-xl flex items-center gap-2"
              >
                {streaming ? (
                  <>
                    <Activity className="w-4 h-4" />
                    Streaming…
                  </>
                ) : submitMutation.isPending ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full" />
                    Saving…
                  </>
                ) : (
                  <>
                    <Scale className="w-4 h-4" />
                    Stream & Verify
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        {submitMutation.isPending && (
          <AIThinking
            steps={[
              "Reading sensor stream…",
              "Cross-checking declared vs measured…",
              "Calculating deviation pct…",
            ]}
          />
        )}

        {latestResult && (
          <>
            <div
              className={`rounded-2xl border-2 p-6 flex flex-col sm:flex-row items-start sm:items-center gap-6 ${
                latestResult.flagged
                  ? "bg-red-50 border-red-300"
                  : "bg-emerald-50 border-emerald-300"
              }`}
            >
              <ScaleNeedle pct={latestResult.deviationPct} flagged={latestResult.flagged} />
              <div className="flex-1">
                <p className={`text-lg font-bold ${latestResult.flagged ? "text-red-700" : "text-emerald-700"}`}>
                  {latestResult.flagged ? "Weight Deviation Flagged" : "Weight Within Tolerance"}
                </p>
                <p className="text-sm text-slate-700 mt-1">
                  Declared:{" "}
                  <strong>{latestResult.declaredWeightKg.toFixed(3)} kg</strong>
                  {" · "}
                  Measured:{" "}
                  <strong>{latestResult.measuredWeightKg.toFixed(3)} kg</strong>
                  {" · "}
                  Deviation:{" "}
                  <strong>
                    {latestResult.deviationKg >= 0 ? "+" : ""}
                    {latestResult.deviationKg.toFixed(3)} kg
                  </strong>{" "}
                  ({fmtPct(latestResult.deviationPct)} vs threshold{" "}
                  {latestResult.thresholdPct}%)
                </p>
              </div>
            </div>
            <ReferenceNewsButton
              subject="cargo weight verification"
              kind="product"
            />
          </>
        )}

        {!latestResult && !isNaN(declaredFloat) && !isNaN(measuredFloat) && (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 flex items-center gap-6 shadow-sm">
            <ScaleNeedle
              pct={livePct}
              angle={needleAngle}
              flagged={Math.abs(livePct) > effectiveThreshold}
            />
            <div className="flex-1">
              <p className="text-sm font-semibold text-slate-700">Predicted deviation</p>
              <p className="text-2xl font-bold text-slate-800 mt-1">
                <CountUp value={livePct} decimals={2} suffix="%" />
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Threshold: {effectiveThreshold.toFixed(1)}% — Click
                "Stream &amp; Verify" to record the reading.
              </p>
            </div>
          </div>
        )}

        {/* History */}
        <div
          className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-8"
          aria-labelledby="history-heading"
        >
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 id="history-heading" className="text-xl font-bold text-slate-800">
                Check History
              </h2>
              <p className="text-sm text-slate-500">Last {HISTORY_LIMIT} weight checks for your account.</p>
            </div>
            <button
              type="button"
              onClick={() => historyQuery.refetch().catch(() => void 0)}
              aria-label="Refresh check history"
              className="text-xs font-semibold text-slate-500 hover:text-slate-700 inline-flex items-center gap-1 focus:outline-none focus:ring-2 focus:ring-blue-400 rounded"
            >
              <RefreshCcw className="w-3.5 h-3.5" aria-hidden="true" />
              Refresh
            </button>
          </div>

          {historyQuery.isLoading ? (
            <div className="space-y-3">
              <CardSkeleton height={56} />
              <CardSkeleton height={56} />
              <CardSkeleton height={56} />
            </div>
          ) : historyQuery.isError ? (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4" role="alert">
              <p className="text-sm text-red-700 font-medium">
                Failed to load history: {(historyQuery.error as any).message}
              </p>
              <button
                type="button"
                onClick={() => historyQuery.refetch().catch(() => void 0)}
                className="text-xs text-red-600 hover:text-red-700 underline mt-1 focus:outline-none focus:ring-2 focus:ring-red-400 rounded"
              >
                Retry
              </button>
            </div>
          ) : !historyQuery.data || historyQuery.data.length === 0 ? (
            <div className="py-12 text-center text-slate-400">
              <Scale className="w-10 h-10 mx-auto mb-3 opacity-40" aria-hidden="true" />
              <p className="text-sm font-medium text-slate-500">No weight checks yet</p>
              <p className="text-xs mt-1">Submit your first check above.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-slate-700">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 font-semibold text-xs uppercase tracking-wide">
                    <th className="text-left py-2 pr-4">Date</th>
                    <th className="text-right py-2 pr-4">Declared (kg)</th>
                    <th className="text-right py-2 pr-4">Measured (kg)</th>
                    <th className="text-right py-2 pr-4">Deviation (kg)</th>
                    <th className="text-right py-2 pr-4">Dev %</th>
                    <th className="text-right py-2 pr-4">Threshold %</th>
                    <th className="text-center py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {historyQuery.data.map((record) => (
                    <tr
                      key={String(record._id)}
                      className="border-b border-slate-100 hover:bg-slate-50"
                    >
                      <td className="py-3 pr-4 text-slate-500 whitespace-nowrap">
                        {fmtDate(record.createdAt as Date)}
                      </td>
                      <td className="py-3 pr-4 text-right font-medium">
                        {record.declaredWeightKg.toFixed(3)}
                      </td>
                      <td className="py-3 pr-4 text-right font-medium">
                        {record.measuredWeightKg.toFixed(3)}
                      </td>
                      <td
                        className={`py-3 pr-4 text-right font-medium ${
                          record.deviationKg > 0
                            ? "text-amber-600"
                            : record.deviationKg < 0
                              ? "text-blue-600"
                              : "text-slate-600"
                        }`}
                      >
                        {record.deviationKg >= 0 ? "+" : ""}
                        {record.deviationKg.toFixed(3)}
                      </td>
                      <td className="py-3 pr-4 text-right">
                        {fmtPct(record.deviationPct)}
                      </td>
                      <td className="py-3 pr-4 text-right text-slate-400">
                        {record.thresholdPct}%
                      </td>
                      <td className="py-3 text-center">
                        {record.flagged ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-red-100 text-red-700 text-xs font-semibold">
                            Flagged
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 text-xs font-semibold">
                            OK
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
    </div>
  );
}

function ScaleNeedle({
  pct,
  angle,
  flagged,
}: {
  pct: number;
  angle?: number;
  flagged: boolean;
}) {
  const a = angle ?? Math.max(-90, Math.min(90, (pct / 25) * 90));
  const color = flagged ? "#ef4444" : "#10b981";
  return (
    <div className="relative w-36 h-24 flex-shrink-0">
      <svg viewBox="0 0 200 120" className="w-full h-full">
        <path
          d="M 20 110 A 80 80 0 0 1 180 110"
          fill="none"
          stroke="#e2e8f0"
          strokeWidth="12"
          strokeLinecap="round"
        />
        {[-90, -45, 0, 45, 90].map((tick) => {
          const rad = ((tick - 90) * Math.PI) / 180;
          const x1 = 100 + Math.cos(rad) * 70;
          const y1 = 110 + Math.sin(rad) * 70;
          const x2 = 100 + Math.cos(rad) * 82;
          const y2 = 110 + Math.sin(rad) * 82;
          return (
            <line key={tick} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#cbd5e1" strokeWidth="2" />
          );
        })}
        <line
          x1={100}
          y1={110}
          x2={100}
          y2={30}
          stroke={color}
          strokeWidth="3"
          strokeLinecap="round"
          style={{
            transformOrigin: "100px 110px",
            transform: `rotate(${a}deg)`,
            transition: "transform 0.4s ease-out",
          }}
        />
        <circle cx="100" cy="110" r="6" fill={color} />
      </svg>
      <p
        className="absolute inset-0 flex items-end justify-center text-[10px] font-bold uppercase tracking-wider"
        style={{ color }}
      >
        {pct >= 0 ? "+" : ""}
        {pct.toFixed(1)}%
      </p>
    </div>
  );
}
