import React, { useState } from "react";
import { Truck, Plus, Trash2, Users, RefreshCcw, Sparkles, Send } from "lucide-react";
import PageLead from "../../components/PageLead";
import CardSkeleton from "../../components/skeletons/CardSkeleton";
import AIThinking from "../../components/AIThinking";
import { trpc } from "../../lib/trpc";

const SEED_STEPS = [
  "Generating fleet roster…",
  "Computing utilization baselines…",
  "Building analytics…",
];

function utilizationColor(pct: number) {
  if (pct >= 80) return "text-red-500";
  if (pct >= 60) return "text-amber-500";
  return "text-emerald-500";
}

export default function Fleet() {
  const [plate, setPlate] = useState("");
  const [capacity, setCapacity] = useState("");
  const [baseCity, setBaseCity] = useState("");
  const [driverName, setDriverName] = useState("");
  const [driverPhone, setDriverPhone] = useState("");

  const [fleetError, setFleetError] = useState<string>("");
  const [aiQuestion, setAiQuestion] = useState("");
  const [aiResult, setAiResult] = useState<{ bullets: string[]; recommendation: string } | null>(null);
  const utils = trpc.useUtils();

  const listTrucksQuery = trpc.trucks.list.useQuery();
  const analyticsQuery = trpc.trucks.analytics.useQuery();

  const registerTruckMutation = trpc.trucks.register.useMutation({
    onSuccess: () => {
      setFleetError("");
      setPlate("");
      setCapacity("");
      setBaseCity("");
      setDriverName("");
      setDriverPhone("");
      utils.trucks.list.invalidate().catch(() => null);
      utils.trucks.analytics.invalidate().catch(() => null);
    },
    onError: (err) => {
      setFleetError(err.message || "Registration failed.");
    },
  });

  const removeTruckMutation = trpc.trucks.remove.useMutation({
    onSuccess: () => {
      setFleetError("");
      utils.trucks.list.invalidate().catch(() => null);
      utils.trucks.analytics.invalidate().catch(() => null);
    },
    onError: (err) => {
      setFleetError(err.message || "Failed to remove truck.");
    },
  });

  const seedMutation = trpc.trucks.seedDemoFleet.useMutation({
    onSuccess: () => {
      utils.trucks.list.invalidate().catch(() => null);
      utils.trucks.analytics.invalidate().catch(() => null);
    },
  });

  const askAIMutation = trpc.trucks.askAI.useMutation({
    onSuccess: (result) => {
      setAiResult(result);
      setAiQuestion("");
    },
    onError: (err) => {
      setAiResult({
        bullets: ["Error: " + (err.message || "Failed to analyze fleet")],
        recommendation: "Please try again.",
      });
    },
  });

  const handleRegisterTruck = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!plate.trim() || !capacity.trim() || !baseCity.trim() || !driverName.trim()) {
      setFleetError("Please fill in all required truck fields.");
      return;
    }
    setFleetError("");
    await registerTruckMutation.mutateAsync({
      plate: plate.trim().toUpperCase(),
      capacityKg: parseFloat(capacity) || 1000,
      baseCity: baseCity.trim(),
      driverName: driverName.trim(),
      phone: driverPhone.trim() || undefined,
    });
  };

  const handleAskAI = async () => {
    if (!aiQuestion.trim()) return;
    await askAIMutation.mutateAsync({ question: aiQuestion.trim() });
  };

  const ASK_AI_SUGGESTIONS = [
    "Where am I losing money?",
    "Which truck is underused?",
    "Cost per km trend?",
    "On-time risk this week?",
  ];

  const fleet = analyticsQuery.data?.fleet;
  const perTruck = analyticsQuery.data?.perTruck ?? [];

  // Build a utilization lookup keyed by truckId string
  const utilByTruck = new Map(perTruck.map((t) => [t.truckId, t]));

  // Top-3 trucks by utilization (from analytics)
  const topTrucks = [...perTruck]
    .filter((t) => t.totalTrips > 0)
    .sort((a, b) => b.utilizationPct - a.utilizationPct)
    .slice(0, 3);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-12">

      <div className="flex items-start justify-between gap-4">
        <PageLead
          title="Manage your fleet"
          sub="Register trucks with plate, capacity, and base city. Match small loads sharing corridors so empty backhauls don't waste fuel."
        />
        <button
          onClick={() => seedMutation.mutate({})}
          disabled={seedMutation.isPending}
          className="flex-shrink-0 mt-1 inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Sparkles className="w-4 h-4 text-blue-500" />
          Seed Demo Fleet
        </button>
      </div>

      {seedMutation.isPending && (
        <AIThinking steps={SEED_STEPS} intervalMs={1400} />
      )}

      {/* Analytics panel */}
      {fleet && (
        <section className="space-y-4">
          <h2 className="text-base font-semibold text-slate-700">Fleet Analytics</h2>

          {/* KPI row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="border border-slate-200 rounded-xl bg-slate-50 px-4 py-3">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Avg Utilization</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{fleet.avgUtilizationPct}%</p>
            </div>
            <div className="border border-slate-200 rounded-xl bg-slate-50 px-4 py-3">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">On-Time Rate</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{fleet.onTimePct}%</p>
            </div>
            <div className="border border-slate-200 rounded-xl bg-slate-50 px-4 py-3">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Fuel (last 7 d)</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">
                {fleet.totalFuelLastWeek > 0
                  ? `₹${fleet.totalFuelLastWeek.toLocaleString("en-IN")}`
                  : "—"}
              </p>
            </div>
            <div className="border border-slate-200 rounded-xl bg-slate-50 px-4 py-3">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Maintenance Flags</p>
              <p className={`mt-1 text-2xl font-bold ${fleet.maintenanceFlags > 0 ? "text-amber-600" : "text-slate-900"}`}>
                {fleet.maintenanceFlags}
              </p>
            </div>
          </div>

          {/* Top utilized trucks */}
          {topTrucks.length > 0 && (
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-4 py-2.5 border-b border-slate-100 bg-slate-50">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Top Utilized Trucks</p>
              </div>
              {topTrucks.map((t, i) => (
                <div
                  key={t.truckId}
                  className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 last:border-0"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold text-slate-400 w-4">{i + 1}</span>
                    <span className="text-sm font-semibold text-slate-800">{t.plate}</span>
                    <span className="text-xs text-slate-500">{t.baseCity}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-xs text-slate-500">{t.totalTrips} trips</span>
                    <span className={`text-xs font-bold ${utilizationColor(t.utilizationPct)}`}>
                      {t.utilizationPct}% util
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Ask AI panel */}
      {fleet && (
        <section className="border border-slate-200 rounded-2xl bg-white p-6">
          <h2 className="text-lg font-bold text-slate-900 mb-4">Ask AI about your fleet</h2>

          {askAIMutation.isPending && (
            <AIThinking
              steps={["Reading fleet activity…", "Crunching trip data…", "Drafting recommendation…"]}
              intervalMs={1200}
              className="mb-4"
            />
          )}

          {aiResult && !askAIMutation.isPending && (
            <div className="space-y-4 mb-4">
              <div className="space-y-2">
                {aiResult.bullets.map((bullet, idx) => (
                  <div key={idx} className="flex gap-2 text-sm text-slate-800">
                    <span className="text-slate-400">—</span>
                    <span>{bullet}</span>
                  </div>
                ))}
              </div>
              <div className="border-l-4 border-blue-500 bg-slate-50 px-4 py-3 text-sm text-slate-800">
                <p className="font-semibold text-slate-900 mb-1">Recommendation</p>
                <p>{aiResult.recommendation}</p>
              </div>
            </div>
          )}

          {!askAIMutation.isPending && (
            <>
              <div className="flex flex-wrap gap-2 mb-4">
                {ASK_AI_SUGGESTIONS.map((sugg) => (
                  <button
                    key={sugg}
                    onClick={() => {
                      setAiQuestion(sugg);
                      setAiResult(null);
                    }}
                    className="text-xs px-3 py-1.5 border border-slate-200 rounded-full text-slate-700 hover:bg-slate-50 font-medium"
                  >
                    {sugg}
                  </button>
                ))}
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Ask about costs, utilization, on-time rate…"
                  value={aiQuestion}
                  onChange={(e) => setAiQuestion(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && aiQuestion.trim()) handleAskAI();
                  }}
                  className="flex-1 px-4 py-3 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <button
                  onClick={handleAskAI}
                  disabled={!aiQuestion.trim() || askAIMutation.isPending}
                  className="px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Send className="w-4 h-4" />
                  Send
                </button>
              </div>
            </>
          )}
        </section>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">

          {/* Left: Register form */}
          <div className="lg:col-span-5 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm h-fit">
            <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2 mb-5">
              <Plus className="w-5 h-5 text-blue-600" /> Register Vehicle
            </h2>
            <form onSubmit={handleRegisterTruck} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">License Plate *</label>
                  <input
                    type="text"
                    placeholder="MH-04-AC-1234"
                    value={plate}
                    onChange={(e) => setPlate(e.target.value)}
                    className="w-full px-4 py-3 rounded-lg border border-slate-300 text-base uppercase focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Capacity (kg) *</label>
                  <input
                    type="number"
                    placeholder="e.g. 5000"
                    value={capacity}
                    onChange={(e) => setCapacity(e.target.value)}
                    className="w-full px-4 py-3 rounded-lg border border-slate-300 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Base City *</label>
                <input
                  type="text"
                  placeholder="e.g. Mumbai"
                  value={baseCity}
                  onChange={(e) => setBaseCity(e.target.value)}
                  className="w-full px-4 py-3 rounded-lg border border-slate-300 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Driver Name *</label>
                  <input
                    type="text"
                    placeholder="Rahul Sharma"
                    value={driverName}
                    onChange={(e) => setDriverName(e.target.value)}
                    className="w-full px-4 py-3 rounded-lg border border-slate-300 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Driver Phone</label>
                  <input
                    type="text"
                    placeholder="98200-11001"
                    value={driverPhone}
                    onChange={(e) => setDriverPhone(e.target.value)}
                    className="w-full px-4 py-3 rounded-lg border border-slate-300 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>
              {fleetError && (
                <p className="text-sm text-red-600" role="alert">{fleetError}</p>
              )}
              <button
                type="submit"
                disabled={registerTruckMutation.isPending}
                className="w-full px-5 py-3 bg-gray-900 hover:bg-gray-800 text-white text-sm font-semibold rounded-lg"
              >
                {registerTruckMutation.isPending ? "Registering..." : "Add to Registry"}
              </button>
            </form>
          </div>

          {/* Right: Fleet directory */}
          <section className="lg:col-span-7 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-900">Fleet Directory</h2>
              <button
                onClick={() => {
                  listTrucksQuery.refetch();
                  analyticsQuery.refetch();
                }}
                className="text-xs font-semibold text-slate-500 hover:text-slate-700 inline-flex items-center gap-1"
              >
                <RefreshCcw className="w-3.5 h-3.5" /> Refresh
              </button>
            </div>

            {listTrucksQuery.isLoading ? (
              <div className="space-y-3">
                <CardSkeleton height={60} />
                <CardSkeleton height={60} />
              </div>
            ) : listTrucksQuery.data && listTrucksQuery.data.length > 0 ? (
              <div>
                <div className="grid grid-cols-[1fr_auto_auto] text-xs font-semibold text-slate-500 uppercase tracking-wide border-b border-slate-200 pb-2 px-1">
                  <span>Vehicle / Driver</span>
                  <span className="text-right pr-8">Utilization</span>
                  <span />
                </div>
                {listTrucksQuery.data.map((truck) => {
                  const truckAnalytics = utilByTruck.get(String(truck._id));
                  const pct = truckAnalytics?.utilizationPct ?? null;
                  const ringColor = pct !== null ? utilizationColor(pct) : "text-slate-400";
                  return (
                    <div key={String(truck._id)} className="grid grid-cols-[1fr_auto_auto] items-center border-b border-slate-100 last:border-0 px-1 py-3 gap-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-800 text-sm">{truck.plate}</span>
                          <span className="text-xs px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full font-mono">{truck.baseCity}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-1 text-xs text-slate-500">
                          <Users className="w-3 h-3" />
                          <span>{truck.driverName}</span>
                          {truck.phone && <span>· {truck.phone}</span>}
                        </div>
                      </div>
                      <div className="text-right">
                        {pct !== null ? (
                          <>
                            <p className={`text-xs font-bold ${ringColor}`}>{pct}% util</p>
                            <p className="text-[10px] text-slate-400 mt-0.5">
                              {truckAnalytics?.totalTrips ?? 0} trips · {truck.capacityKg} kg cap
                            </p>
                          </>
                        ) : (
                          <>
                            <p className="text-xs font-bold text-slate-400">No trips yet</p>
                            <p className="text-[10px] text-slate-400 mt-0.5">{truck.capacityKg} kg cap</p>
                          </>
                        )}
                      </div>
                      <button
                        onClick={() => removeTruckMutation.mutate({ truckId: String(truck._id) })}
                        className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-slate-100"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center py-10 text-center">
                <Truck className="w-8 h-8 text-slate-300 mb-3" />
                <p className="text-sm font-semibold text-slate-600">No trucks registered yet</p>
                <p className="text-sm text-slate-500 mt-1">
                  Add your first vehicle using the form, or{" "}
                  <button
                    onClick={() => seedMutation.mutate({})}
                    className="text-blue-600 hover:underline font-medium"
                  >
                    seed demo data
                  </button>
                  .
                </p>
              </div>
            )}
          </section>

      </div>
    </div>
  );
}
