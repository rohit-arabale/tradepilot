import React, { useState, useMemo } from "react";
import {
  AlertTriangle,
  CheckCircle,
  ScrollText,
  RefreshCcw,
  Radar,
  Database,
  Globe,
} from "lucide-react";
import PageLead from "../../components/PageLead";
import NewsContextCard from "../../components/NewsContextCard";
import AIThinking from "../../components/AIThinking";
import ReferenceNewsButton from "../../components/ReferenceNewsButton";
import { trpc } from "../../lib/trpc";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtDateTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function severityColor(s: string): string {
  if (s === "high") return "bg-red-100 text-red-700";
  if (s === "medium") return "bg-amber-100 text-amber-700";
  return "bg-slate-100 text-slate-600";
}

// ---------------------------------------------------------------------------
// Small components
// ---------------------------------------------------------------------------

function SeverityBadge({ severity }: { severity: string }) {
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${severityColor(severity)}`}
    >
      {severity}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function RiskCenter() {
  const [draftId] = useState<string>("");

  // Anomaly scanner form
  const [originCity, setOriginCity] = useState("");
  const [destinationCity, setDestinationCity] = useState("");
  const [declaredWeight, setDeclaredWeight] = useState("");
  const [measuredWeight, setMeasuredWeight] = useState("");
  const [declaredCount, setDeclaredCount] = useState("");
  const [detectedCount, setDetectedCount] = useState("");
  const [routeDeviation, setRouteDeviation] = useState("0");

  // Audit append form
  const [eventSummary, setEventSummary] = useState("");
  const [eventType, setEventType] = useState("manual-check");

  // Demo seed presets
  const DEMO_PRESETS = {
    low: {
      originCity: "Mumbai",
      destinationCity: "Singapore",
      declaredCount: "50",
      detectedCount: "50",
      declaredWeight: "2000",
      measuredWeight: "2002",
      routeDeviation: "12",
    },
    medium: {
      originCity: "Mumbai",
      destinationCity: "Rotterdam",
      declaredCount: "50",
      detectedCount: "46",
      declaredWeight: "2000",
      measuredWeight: "2150",
      routeDeviation: "85",
    },
    high: {
      originCity: "Karachi",
      destinationCity: "Caracas",
      declaredCount: "50",
      detectedCount: "37",
      declaredWeight: "2000",
      measuredWeight: "2650",
      routeDeviation: "320",
    },
  } as const;

  function applyDemoPreset(tier: keyof typeof DEMO_PRESETS) {
    const p = DEMO_PRESETS[tier];
    setOriginCity(p.originCity);
    setDestinationCity(p.destinationCity);
    setDeclaredCount(p.declaredCount);
    setDetectedCount(p.detectedCount);
    setDeclaredWeight(p.declaredWeight);
    setMeasuredWeight(p.measuredWeight);
    setRouteDeviation(p.routeDeviation);
    setScanError("");
  }

  // Expand/collapse audit rows
  const [expandedAudit, setExpandedAudit] = useState<Set<string>>(new Set());

  const utils = trpc.useUtils();

  // ---- queries ----
  const auditQuery = trpc.audit.forDraft.useQuery(
    { draftId, order: "newest", limit: 50 },
    { enabled: Boolean(draftId), retry: false }
  );

  const fraudQuery = trpc.fraud.summary.useQuery(undefined, {
    retry: 1,
    refetchOnWindowFocus: true,
    refetchInterval: (q) => {
      if (typeof document !== "undefined" && document.hidden) return false;
      if (q.state.status === "error") return false;
      return 8000;
    },
  });

  const historyQuery = trpc.anomaly.history.useQuery(
    { limit: 10 },
    { retry: false }
  );

  const riskGraphQuery = trpc.newsContext.internationalRisk.useMutation({
    retry: 1,
  });

  // Inline error state — replaces toasts
  const [scanError, setScanError] = useState<string>("");
  const [appendError, setAppendError] = useState<string>("");

  // International risk graph state
  const [riskGraphRefreshKey, setRiskGraphRefreshKey] = useState(0);

  // ---- mutations ----
  const analyzeMut = trpc.anomaly.analyze.useMutation({
    onSuccess: () => {
      setScanError("");
      utils.anomaly.history.invalidate().catch(() => null);
      if (draftId) {
        utils.insights.shipmentTrustScore.invalidate({ draftId }).catch(() => null);
        utils.audit.forDraft.invalidate({ draftId }).catch(() => null);
      }
    },
    onError: (err) => setScanError(err.message || "Scan failed."),
  });

  const appendMut = trpc.audit.append.useMutation({
    onSuccess: () => {
      setAppendError("");
      setEventSummary("");
      if (draftId) utils.audit.forDraft.invalidate({ draftId }).catch(() => null);
    },
    onError: (err) => setAppendError(err.message || "Failed to append."),
  });

  // ---- derived data ----
  const fraudData = fraudQuery.data;
  const recentEvents = (fraudData?.recentEvents ?? []) as Array<{
    type: string;
    riskScore: number;
    createdAt: Date | string;
    summary: string;
  }>;

  const overallIntegrity = useMemo(() => {
    if (recentEvents.length === 0) return null;
    const avg = recentEvents.reduce((acc, e) => acc + e.riskScore, 0) / recentEvents.length;
    return Math.round((1 - avg) * 100);
  }, [recentEvents]);


  // ---- handlers ----
  function handleScan(e: React.FormEvent) {
    e.preventDefault();
    if (analyzeMut.isPending) return;
    if (!originCity.trim() || !destinationCity.trim()) {
      setScanError("Origin and destination are required.");
      return;
    }
    analyzeMut.mutate({
      draftId: draftId || undefined,
      declaredWeightKg: parseFloat(declaredWeight) || 0,
      measuredWeightKg: parseFloat(measuredWeight) || 0,
      declaredCount: parseInt(declaredCount, 10) || 0,
      detectedCount: parseInt(detectedCount, 10) || 0,
      originCity: originCity.trim(),
      destinationCity: destinationCity.trim(),
      routeDeviationKm: parseFloat(routeDeviation) || 0,
    });
  }

  function handleAppend(e: React.FormEvent) {
    e.preventDefault();
    if (!eventSummary.trim() || !draftId) return;
    appendMut.mutate({
      draftId,
      eventType,
      summary: eventSummary.trim(),
      payload: { source: "RiskCenter" },
    });
  }

  function toggleAuditRow(id: string) {
    setExpandedAudit((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-12">

      <PageLead
        title="Find tampered shipments"
        sub="Trust score, AI anomaly scan, and audit trail per shipment. Portfolio fraud feed shows below regardless."
      />

      {/* ---- Portfolio summary strip (always visible) ---- */}
      {fraudQuery.data && (
        <div className="bg-white border border-slate-200 rounded-lg px-5 py-3 flex flex-wrap items-center gap-x-6 gap-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">Box mismatches</span>
            <span className={`text-sm font-semibold ${(fraudData?.boxCountMismatches ?? 0) > 0 ? "text-red-600" : "text-slate-700"}`}>
              {fraudData?.boxCountMismatches ?? 0}
            </span>
          </div>
          <div className="h-3 w-px bg-slate-200 hidden sm:block" />
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">RFID missing</span>
            <span className={`text-sm font-semibold ${(fraudData?.totalRfidMissing ?? 0) > 0 ? "text-amber-600" : "text-slate-700"}`}>
              {fraudData?.totalRfidMissing ?? 0}
            </span>
          </div>
          <div className="h-3 w-px bg-slate-200 hidden sm:block" />
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">High severity</span>
            <span className={`text-sm font-semibold ${(fraudData?.anomalyHighSeverity ?? 0) > 0 ? "text-red-600" : "text-slate-700"}`}>
              {fraudData?.anomalyHighSeverity ?? 0}
            </span>
          </div>
          <div className="h-3 w-px bg-slate-200 hidden sm:block" />
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">Integrity</span>
            <span className={`text-sm font-semibold ${
              overallIntegrity === null ? "text-slate-500"
              : overallIntegrity >= 80 ? "text-emerald-600"
              : overallIntegrity >= 50 ? "text-amber-600"
              : "text-red-600"
            }`}>
              {overallIntegrity !== null ? `${overallIntegrity}%` : "--"}
            </span>
          </div>
        </div>
      )}

      {/* ---- International Risk Graph ---- */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-blue-600" />
            <h2 className="text-xl font-bold text-slate-900">International Risk</h2>
            <span className="text-sm text-slate-500">live news signals</span>
          </div>
          <button
            type="button"
            onClick={() => {
              setRiskGraphRefreshKey((k) => k + 1);
              riskGraphQuery.mutate({});
            }}
            disabled={riskGraphQuery.isPending}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCcw className="w-3 h-3" /> Refresh
          </button>
        </div>

        {riskGraphQuery.isPending && (
          <div className="mb-4">
            <AIThinking
              steps={[
                "Reading global logistics news…",
                "Scoring corridors by risk signal…",
                "Drafting per-region rationale…",
              ]}
            />
          </div>
        )}

        {riskGraphQuery.data?.regions && riskGraphQuery.data.regions.length > 0 ? (
          <div className="space-y-2">
            {riskGraphQuery.data.regions.map((region, idx) => {
              const scoreClass =
                region.riskScore < 35
                  ? "bg-emerald-50 border-emerald-200"
                  : region.riskScore < 65
                  ? "bg-amber-50 border-amber-200"
                  : "bg-red-50 border-red-200";
              const pillClass =
                region.riskScore < 35
                  ? "bg-emerald-100 text-emerald-700"
                  : region.riskScore < 65
                  ? "bg-amber-100 text-amber-700"
                  : "bg-red-100 text-red-700";

              return (
                <div key={idx} className={`border rounded-lg p-3 ${scoreClass}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-semibold text-slate-900">
                          {region.region}
                        </span>
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${pillClass}`}>
                          {region.riskScore}
                        </span>
                      </div>
                      <p className="text-sm text-slate-600 leading-relaxed">
                        {region.rationale}
                      </p>
                      {region.topHeadline && (
                        <p className="text-xs text-slate-400 italic mt-1">
                          {region.topHeadline}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : !riskGraphQuery.isPending && !riskGraphQuery.data?.regions?.length ? (
          <div className="text-sm text-slate-500 text-center py-6">
            Click "Refresh" to load international risk assessment.
          </div>
        ) : null}
      </section>

      {/* ---- Scanner + Audit Trail ---- */}
      <div className="space-y-12">

            {/* Anomaly Scanner */}
            <section>
              <div className="flex items-center gap-2 mb-5">
                <Radar className="w-4 h-4 text-blue-600" />
                <h2 className="text-xl font-bold text-slate-900">Anomaly Scanner</h2>
              </div>
              {/* Demo seed buttons */}
              <div className="flex items-center gap-2 mb-4">
                <Database className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                <span className="text-xs text-slate-400 font-medium mr-1">Demo:</span>
                <button
                  type="button"
                  onClick={() => applyDemoPreset("low")}
                  className="px-3 py-1.5 text-xs font-medium border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  Low Risk
                </button>
                <button
                  type="button"
                  onClick={() => applyDemoPreset("medium")}
                  className="px-3 py-1.5 text-xs font-medium border border-amber-300 text-amber-700 rounded-lg hover:bg-amber-50 transition-colors"
                >
                  Medium Risk
                </button>
                <button
                  type="button"
                  onClick={() => applyDemoPreset("high")}
                  className="px-3 py-1.5 text-xs font-medium border border-red-300 text-red-700 rounded-lg hover:bg-red-50 transition-colors"
                >
                  High Risk
                </button>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-6">
                <form onSubmit={handleScan} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">
                        Origin City <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Chicago"
                        value={originCity}
                        onChange={(e) => setOriginCity(e.target.value)}
                        required
                        className="w-full px-4 py-3 rounded-lg border border-slate-300 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">
                        Destination City <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Detroit"
                        value={destinationCity}
                        onChange={(e) => setDestinationCity(e.target.value)}
                        required
                        className="w-full px-4 py-3 rounded-lg border border-slate-300 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">
                        Declared Weight (kg)
                      </label>
                      <input
                        type="number"
                        placeholder="500"
                        value={declaredWeight}
                        onChange={(e) => setDeclaredWeight(e.target.value)}
                        className="w-full px-4 py-3 rounded-lg border border-slate-300 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">
                        Measured Weight (kg)
                      </label>
                      <input
                        type="number"
                        placeholder="505"
                        value={measuredWeight}
                        onChange={(e) => setMeasuredWeight(e.target.value)}
                        className="w-full px-4 py-3 rounded-lg border border-slate-300 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">
                        Declared Count
                      </label>
                      <input
                        type="number"
                        placeholder="100"
                        value={declaredCount}
                        onChange={(e) => setDeclaredCount(e.target.value)}
                        className="w-full px-4 py-3 rounded-lg border border-slate-300 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">
                        Detected Count
                      </label>
                      <input
                        type="number"
                        placeholder="98"
                        value={detectedCount}
                        onChange={(e) => setDetectedCount(e.target.value)}
                        className="w-full px-4 py-3 rounded-lg border border-slate-300 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">
                      Route Deviation (km)
                    </label>
                    <input
                      type="number"
                      placeholder="0"
                      value={routeDeviation}
                      onChange={(e) => setRouteDeviation(e.target.value)}
                      className="w-full sm:w-1/3 px-4 py-3 rounded-lg border border-slate-300 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={analyzeMut.isPending}
                      className="px-5 py-3 bg-gray-900 hover:bg-gray-800 text-white text-sm font-semibold rounded-lg disabled:opacity-50"
                    >
                      {analyzeMut.isPending ? "Scanning…" : "Run Anomaly Scan"}
                    </button>
                  </div>
                </form>
              </div>

              {analyzeMut.isPending && (
                <div className="mt-4">
                  <AIThinking
                    steps={[
                      "Reading shipment signals…",
                      "Comparing against baseline patterns…",
                      "Generating risk summary…",
                    ]}
                  />
                </div>
              )}

              {scanError && (
                <p className="mt-3 text-sm text-red-600" role="alert">{scanError}</p>
              )}

              {/* News-grounded intelligence — visible workflow per CLAUDE.md */}
              {analyzeMut.data && (
                <div className="mt-4">
                  <NewsContextCard
                    surface="risk"
                    origin={originCity}
                    destination={destinationCity}
                  />
                </div>
              )}

              {/* Latest scan result — kept as a result panel */}
              {analyzeMut.data && (
                <div className="mt-4 space-y-3">
                  {/* Summary callout — Gemini-generated analysis, prominently shown */}
                  {analyzeMut.data.summary && (
                    <div className="border-l-4 border-blue-500 bg-slate-50 px-4 py-3 rounded-r-lg">
                      <p className="text-sm text-slate-800 leading-relaxed">{analyzeMut.data.summary}</p>
                    </div>
                  )}

                  {/* Severity + flags */}
                  <div
                    className={`p-5 rounded-xl border text-sm ${
                      analyzeMut.data.severity === "high"
                        ? "bg-red-50 border-red-200 text-red-800"
                        : analyzeMut.data.severity === "medium"
                        ? "bg-amber-50 border-amber-200 text-amber-800"
                        : "bg-emerald-50 border-emerald-200 text-emerald-800"
                    }`}
                  >
                    <div className="flex items-center gap-2 font-semibold mb-1">
                      {analyzeMut.data.severity !== "low" ? (
                        <AlertTriangle className="w-4 h-4" />
                      ) : (
                        <CheckCircle className="w-4 h-4" />
                      )}
                      Severity: {analyzeMut.data.severity} — Risk score: {analyzeMut.data.riskScore}
                    </div>
                    {Array.isArray(analyzeMut.data.flags) && analyzeMut.data.flags.length > 0 && (
                      <ul className="mt-2 space-y-0.5">
                        {(analyzeMut.data.flags as string[]).map((f, i) => (
                          <li key={i} className="text-xs">• {f}</li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {/* Recommended action card — shown if mitigations exist */}
                  {analyzeMut.data.mitigationNarrative && (
                    <div className="border border-slate-200 rounded-xl p-5 bg-white space-y-3">
                      <h3 className="text-sm font-semibold text-slate-900">Recommended action</h3>
                      <p className="text-sm text-slate-700 leading-relaxed">
                        {analyzeMut.data.mitigationNarrative}
                      </p>
                      {(analyzeMut.data.recommendedAvoidances?.length || 0) > 0 ||
                      (analyzeMut.data.recommendedAlternatives?.length || 0) > 0 ? (
                        <div className="grid grid-cols-2 gap-4 mt-4">
                          {/* Avoid column */}
                          {(analyzeMut.data.recommendedAvoidances?.length || 0) > 0 && (
                            <div>
                              <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">
                                Avoid
                              </p>
                              <div className="flex flex-wrap gap-2">
                                {analyzeMut.data.recommendedAvoidances?.map((avoid, i) => (
                                  <span
                                    key={i}
                                    className="inline-block px-3 py-1.5 rounded-lg text-xs font-medium bg-red-100 text-red-700"
                                  >
                                    {avoid}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                          {/* Use instead column */}
                          {(analyzeMut.data.recommendedAlternatives?.length || 0) > 0 && (
                            <div>
                              <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">
                                Use instead
                              </p>
                              <div className="flex flex-wrap gap-2">
                                {analyzeMut.data.recommendedAlternatives?.map((alt, i) => (
                                  <span
                                    key={i}
                                    className="inline-block px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-100 text-blue-700"
                                  >
                                    {alt}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      ) : null}
                    </div>
                  )}

                  {/* News context */}
                  <ReferenceNewsButton subject="supply chain risk anomaly" kind="route" />
                </div>
              )}
            </section>

            {/* Recent scan history */}
            {historyQuery.data && historyQuery.data.length > 0 && (
              <section className="border-t border-slate-200 pt-12">
                <h2 className="text-xl font-bold text-slate-900 mb-5">Recent Scans</h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs font-semibold text-slate-500 uppercase tracking-wide border-b border-slate-200">
                        <th className="px-4 py-3 text-left">Route</th>
                        <th className="px-4 py-3 text-left">Summary</th>
                        <th className="px-4 py-3 text-left">Severity</th>
                        <th className="px-4 py-3 text-left">When</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historyQuery.data.map((r) => (
                        <tr key={String(r._id)} className="border-b border-slate-100 last:border-0">
                          <td className="px-4 py-3 font-mono text-xs text-slate-500 whitespace-nowrap">
                            {r.originCity} → {r.destinationCity}
                          </td>
                          <td className="px-4 py-3 text-slate-700 text-xs max-w-xs truncate">
                            {r.summary}
                          </td>
                          <td className="px-4 py-3">
                            <SeverityBadge severity={r.severity} />
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">
                            {fmtDateTime(r.createdAt)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {/* Audit Trail */}
            <section className="border-t border-slate-200 pt-12">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                  <ScrollText className="w-4 h-4 text-blue-600" />
                  <h2 className="text-xl font-bold text-slate-900">Audit Trail</h2>
                </div>
                <button
                  type="button"
                  onClick={() => auditQuery.refetch()}
                  className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600"
                >
                  <RefreshCcw className="w-3 h-3" /> Refresh
                </button>
              </div>

              {/* Append event form */}
              <form onSubmit={handleAppend} className="flex flex-col sm:flex-row gap-3 mb-6 pb-6 border-b border-slate-200">
                <select
                  value={eventType}
                  onChange={(e) => setEventType(e.target.value)}
                  className="px-4 py-3 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="manual-check">Manual Check</option>
                  <option value="seal-intact">Seal Intact</option>
                  <option value="route-override">Route Override</option>
                  <option value="note">Note</option>
                </select>
                <input
                  type="text"
                  placeholder="Describe the event…"
                  value={eventSummary}
                  onChange={(e) => setEventSummary(e.target.value)}
                  className="flex-1 px-4 py-3 border border-slate-300 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                />
                <button
                  type="submit"
                  disabled={appendMut.isPending}
                  className="px-5 py-3 border border-gray-200 hover:bg-gray-50 text-gray-900 text-sm font-semibold rounded-lg disabled:opacity-50"
                >
                  Append
                </button>
              </form>
              {appendError && (
                <p className="text-sm text-red-600 mb-4" role="alert">{appendError}</p>
              )}

              {/* Audit log rows */}
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {auditQuery.isLoading ? (
                  <p className="text-sm text-slate-400 text-center py-6">Loading audit trail…</p>
                ) : !auditQuery.data || auditQuery.data.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-6">No audit records for this draft.</p>
                ) : (
                  (auditQuery.data as Array<{
                    _id: unknown;
                    eventType: string;
                    summary: string;
                    createdAt: Date | string;
                    payload?: Record<string, unknown>;
                  }>).map((log) => {
                    const id = String(log._id);
                    const isOpen = expandedAudit.has(id);
                    return (
                      <div
                        key={id}
                        className="rounded-lg border border-slate-200 overflow-hidden"
                      >
                        <button
                          type="button"
                          onClick={() => toggleAuditRow(id)}
                          className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 text-left"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-[10px] font-mono bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded flex-shrink-0">
                              {log.eventType}
                            </span>
                            <span className="text-xs text-slate-700 truncate">{log.summary}</span>
                          </div>
                          <span className="text-[10px] text-slate-400 whitespace-nowrap ml-2 flex-shrink-0">
                            {fmtDateTime(log.createdAt)}
                          </span>
                        </button>
                        {isOpen && log.payload && Object.keys(log.payload).length > 0 && (
                          <div className="px-4 py-3 bg-white border-t border-slate-100">
                            <pre className="text-[10px] text-slate-500 whitespace-pre-wrap break-all">
                              {JSON.stringify(log.payload, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </section>
      </div>

      {/* ---- Recent event feed (always visible at bottom) ---- */}
      {recentEvents.length > 0 && (
        <section className="border-t border-slate-200 pt-12">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-xl font-bold text-slate-900">Recent Verification Events</h2>
            <span className="text-sm text-slate-500">{recentEvents.length} events</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs font-semibold text-slate-500 uppercase tracking-wide border-b border-slate-200">
                  <th className="px-4 py-3 text-left">Type</th>
                  <th className="px-4 py-3 text-left">Summary</th>
                  <th className="px-4 py-3 text-right">Risk</th>
                  <th className="px-4 py-3 text-right">When</th>
                </tr>
              </thead>
              <tbody>
                {recentEvents.slice(0, 15).map((ev, idx) => (
                  <tr key={idx} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-medium">
                        {ev.type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-700 max-w-xs truncate">
                      {ev.summary}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`text-xs font-semibold ${
                        ev.riskScore >= 0.7
                          ? "text-red-600"
                          : ev.riskScore >= 0.4
                          ? "text-amber-600"
                          : "text-emerald-600"
                      }`}>
                        {Math.round(ev.riskScore * 100)}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-slate-400 whitespace-nowrap">
                      {fmtDateTime(ev.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
