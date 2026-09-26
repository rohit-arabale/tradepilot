import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  Package,
  TrendingUp,
  Leaf,
  AlertTriangle,
  Truck,
  FileCheck,
  Globe,
  Inbox,
} from "lucide-react";
import { trpc } from "../../lib/trpc";

const AnalysisTab: React.FC = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<string>("compliance");

  const meQuery = trpc.auth.getMe.useQuery(undefined, { retry: false });
  const userId = (meQuery.data?.user as any)?.id ?? "";

  const { data, isLoading, isError, refetch } = trpc.inventory.getDraftsByUser.useQuery(
    { userId, complianceStatus: "done", routeOptimizationStatus: "done" },
    { enabled: !!userId, retry: false }
  );

  const shipmentData: any[] = data?.drafts ?? [];

  const analytics = React.useMemo(() => {
    if (!shipmentData.length) return null;

    const totalShipments = shipmentData.length;
    const totalCost = shipmentData.reduce((s, d) => s + (d.routeData?.totalCost || 0), 0);
    const totalEmissions = shipmentData.reduce((s, d) => {
      const raw = d.carbonAnalysis?.totalEmissions;
      return s + (raw ? parseFloat(String(raw).replace(" kg CO2e", "")) : 0);
    }, 0);
    const avgRiskScore = shipmentData.reduce((s, d) => s + (d.complianceData?.riskLevel?.riskScore || 0), 0) / totalShipments;

    const routes = shipmentData.map((d) => ({
      route: d.formData?.ShipmentDetails
        ? `${d.formData.ShipmentDetails["Origin Country"]}→${d.formData.ShipmentDetails["Destination Country"]}`
        : "Unknown",
      risk: d.complianceData?.riskLevel?.riskScore || 0,
    }));

    const kpis = {
      avgTime: (shipmentData.reduce((s, d) => s + (d.routeData?.totalTime || 0), 0) / totalShipments).toFixed(1),
      avgCostPerKm: (
        shipmentData.reduce((s, d) =>
          s + (d.routeData?.totalCost && d.routeData?.totalDistance ? d.routeData.totalCost / d.routeData.totalDistance : 0), 0)
        / totalShipments
      ).toFixed(3),
      avgLegs: (shipmentData.reduce((s, d) => s + (d.routeData?.routeDirections?.length || 0), 0) / totalShipments).toFixed(1),
    };

    const incotermMap = shipmentData.reduce((acc: Record<string, number>, d) => {
      const term = d.formData?.TradeAndRegulatoryDetails?.["Incoterms 2020"] || "Unknown";
      acc[term] = (acc[term] || 0) + 1;
      return acc;
    }, {});
    const incoterms = Object.entries(incotermMap).map(([name, value]) => ({ name, value }));

    const emissionsByMode = shipmentData.map((d) => ({
      route: d.formData?.ShipmentDetails
        ? `${d.formData.ShipmentDetails["Origin Country"]}→${d.formData.ShipmentDetails["Destination Country"]}`
        : "Unknown",
      land: d.carbonAnalysis?.routeAnalysis?.filter((r: any) => r.mode === "land")
        .reduce((s: number, r: any) => s + parseFloat(String(r.emissions ?? "0").replace(" kg CO2e", "") || "0"), 0) || 0,
      sea: d.carbonAnalysis?.routeAnalysis?.filter((r: any) => r.mode === "sea")
        .reduce((s: number, r: any) => s + parseFloat(String(r.emissions ?? "0").replace(" kg CO2e", "") || "0"), 0) || 0,
      air: d.carbonAnalysis?.routeAnalysis?.filter((r: any) => r.mode === "air")
        .reduce((s: number, r: any) => s + parseFloat(String(r.emissions ?? "0").replace(" kg CO2e", "") || "0"), 0) || 0,
    }));

    return { totalShipments, totalCost, totalEmissions, avgRiskScore, routes, kpis, incoterms, emissionsByMode };
  }, [shipmentData]);

  if (meQuery.isLoading || isLoading) {
    return (
      <div className="space-y-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-20 bg-slate-100 rounded" />)}
        </div>
        <div className="h-64 bg-slate-100 rounded" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="py-16 text-center">
        <AlertTriangle className="w-10 h-10 text-red-400 mx-auto mb-4" />
        <p className="text-red-600 mb-5 text-sm">Could not load analytics.</p>
        <button onClick={() => void refetch()}
          className="px-5 py-3 bg-gray-900 hover:bg-gray-800 text-white text-sm font-semibold rounded-lg">
          Retry
        </button>
      </div>
    );
  }

  if (!analytics) {
    return (
      <div className="py-16 text-center">
        <Inbox className="w-10 h-10 text-slate-300 mx-auto mb-4" />
        <p className="text-slate-500 mb-2 text-sm">No fully-processed shipments yet.</p>
        <p className="text-xs text-slate-400 mb-5">Complete compliance and route optimization on at least one shipment to see analytics.</p>
        <button onClick={() => navigate("/inventory")}
          className="px-5 py-3 bg-gray-900 hover:bg-gray-800 text-white text-sm font-semibold rounded-lg">
          Go to Inventory
        </button>
      </div>
    );
  }

  const statCards = [
    { icon: Package,       label: "Total Shipments", value: String(analytics.totalShipments), color: "text-blue-600" },
    { icon: TrendingUp,    label: "Total Cost",       value: `$${parseInt(String(analytics.totalCost)).toLocaleString()}`, color: "text-slate-700" },
    { icon: Leaf,          label: "CO2 Emissions",   value: `${analytics.totalEmissions.toFixed(1)} kg`, color: "text-slate-700" },
    { icon: AlertTriangle, label: "Avg Risk Score",  value: analytics.avgRiskScore.toFixed(1), color: "text-slate-700" },
  ];

  const innerTabs = [
    { value: "compliance", label: "Compliance", icon: FileCheck },
    { value: "trade",      label: "Trade",      icon: Globe    },
    { value: "logistics",  label: "Logistics",  icon: Truck    },
  ];

  return (
    <div className="space-y-12">

      {/* KPI row — inline stats, no card wrappers */}
      <section>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
          {statCards.map(({ icon: Icon, label, value, color }) => (
            <div key={label} className="text-center py-4 border-r border-slate-100 last:border-0">
              <Icon className={`w-6 h-6 mx-auto mb-2 ${color}`} />
              <p className="text-2xl font-extrabold text-slate-900">{value}</p>
              <p className="text-xs text-slate-500 font-semibold uppercase tracking-wide mt-1">{label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Flat sub-tab bar */}
      <div className="flex border-b border-slate-200 gap-6 pb-px overflow-x-auto">
        {innerTabs.map(({ value, label, icon: Icon }) => (
          <button key={value} onClick={() => setActiveTab(value)}
            className={`flex items-center gap-2 px-1 py-3 border-b-2 text-sm font-semibold transition-colors whitespace-nowrap ${
              activeTab === value
                ? "border-blue-600 text-blue-700"
                : "border-transparent text-slate-500 hover:text-slate-900"
            }`}>
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Compliance section */}
      {activeTab === "compliance" && (
        <section className="space-y-8">
          <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <FileCheck className="w-5 h-5 text-blue-600" /> Compliance Overview
          </h3>

          <div>
            <h4 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">Risk by Route</h4>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide border-b border-slate-200">
                    <th className="px-4 py-3">Route</th>
                    <th className="px-4 py-3">Risk Score</th>
                  </tr>
                </thead>
                <tbody>
                  {analytics.routes.map((r, i) => (
                    <tr key={i} className="border-b border-slate-100 last:border-0">
                      <td className="px-4 py-3 text-slate-700">{r.route}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                          r.risk <= 20 ? "bg-emerald-100 text-emerald-800"
                            : r.risk <= 40 ? "bg-yellow-100 text-yellow-800"
                            : "bg-red-100 text-red-800"
                        }`}>
                          {r.risk} ({r.risk <= 20 ? "Low" : r.risk <= 40 ? "Moderate" : "High"})
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-2">Best Practices</h4>
            <ul className="list-disc pl-4 space-y-1 text-sm text-slate-600">
              <li>Switch air to sea freight for 90% emissions reduction where time allows.</li>
              <li>Consolidate shipments to reduce per-unit emissions.</li>
              <li>Ensure MSDS for hazardous materials to avoid compliance issues.</li>
            </ul>
          </div>
        </section>
      )}

      {/* Trade section */}
      {activeTab === "trade" && (
        <section className="space-y-8">
          <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Globe className="w-5 h-5 text-blue-600" /> Trade & Regulatory Insights
          </h3>

          {analytics.incoterms.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-4">Incoterms Distribution</h4>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={analytics.incoterms}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="value" fill="#2563EB" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          <div>
            <h4 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">Incoterms Impact</h4>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide border-b border-slate-200">
                    <th className="px-4 py-3">Incoterms</th>
                    <th className="px-4 py-3">Cost Impact</th>
                    <th className="px-4 py-3">Risk Impact</th>
                    <th className="px-4 py-3">Compliance Responsibility</th>
                  </tr>
                </thead>
                <tbody className="text-slate-600">
                  {[
                    ["FOB", "Moderate", "Low",      "Seller (until loaded)"],
                    ["CIF", "High",     "Moderate", "Seller (until port)"],
                    ["DDP", "High",     "High",     "Seller (full)"],
                    ["EXW", "Low",      "Low",      "Buyer (full)"],
                  ].map(([term, cost, risk, resp]) => (
                    <tr key={term} className="border-b border-slate-100 last:border-0">
                      <td className="px-4 py-3 font-semibold text-slate-800">{term}</td>
                      <td className="px-4 py-3">{cost}</td>
                      <td className="px-4 py-3">{risk}</td>
                      <td className="px-4 py-3">{resp}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* Logistics section */}
      {activeTab === "logistics" && (
        <section className="space-y-8">
          <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Truck className="w-5 h-5 text-blue-600" /> Logistics & Route Optimization
          </h3>

          <div className="grid grid-cols-3 gap-5">
            {[
              { label: "Avg Transit Time", value: `${analytics.kpis.avgTime} hrs` },
              { label: "Avg Cost / km",    value: `$${analytics.kpis.avgCostPerKm}` },
              { label: "Avg Route Legs",   value: analytics.kpis.avgLegs },
            ].map(({ label, value }) => (
              <div key={label} className="text-center py-4 border-r border-slate-100 last:border-0">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">{label}</p>
                <p className="text-2xl font-extrabold text-slate-900">{value}</p>
              </div>
            ))}
          </div>

          {analytics.emissionsByMode.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-4">Emissions by Mode (kg CO2e)</h4>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={analytics.emissionsByMode}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="route" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v: number) => `${v} kg CO2e`} />
                  <Bar dataKey="land" fill="#94A3B8" stackId="a" name="Land" />
                  <Bar dataKey="sea"  fill="#2563EB" stackId="a" name="Sea"  />
                  <Bar dataKey="air"  fill="#EF4444" stackId="a" name="Air"  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>
      )}

    </div>
  );
};

export default AnalysisTab;
