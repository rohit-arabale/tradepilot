import React from "react";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface Violation {
  field: string;
  message: string;
}

interface Recommendation {
  field: string;
  message: string;
}

interface RiskLevel {
  riskScore: number;
  summary: string;
}

interface Scores {
  ShipmentDetails?: number;
  TradeAndRegulatoryDetails?: number;
  PartiesAndIdentifiers?: number;
  LogisticsAndHandling?: number;
  IntendedUseDetails?: number;
}

interface ComplianceResponseData {
  complianceStatus?: string;
  summary?: string;
  violations?: Violation[];
  recommendations?: Recommendation[];
  additionalTips?: string[];
  riskLevel?: RiskLevel;
  scores?: Scores;
}

interface ComplianceResponseProps {
  response: {
    complianceResponse?: ComplianceResponseData;
    [key: string]: unknown;
  } | null;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

class ErrorBoundary extends React.Component<
  React.PropsWithChildren<Record<never, never>>,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(_error: Error): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <div className="p-4 bg-red-50 text-red-700 rounded-lg text-sm">
          Something went wrong displaying the compliance results. Please try again.
        </div>
      );
    }
    return this.props.children;
  }
}

const ComplianceResponse: React.FC<ComplianceResponseProps> = ({ response }) => {
  if (
    !response ||
    !response.complianceResponse ||
    Object.keys(response.complianceResponse).length === 0
  ) {
    return (
      <div className="p-4 bg-yellow-50 text-yellow-700 rounded-lg text-sm">
        No compliance results available.
      </div>
    );
  }

  const complianceResponseData = response.complianceResponse;

  const complianceStatus = complianceResponseData.complianceStatus ?? "Not Ready";
  const summary = complianceResponseData.summary ?? "No summary provided";
  const violations = complianceResponseData.violations ?? [];
  const recommendations = complianceResponseData.recommendations ?? [];
  const additionalTips = complianceResponseData.additionalTips ?? [];

  const riskLevel = complianceResponseData.riskLevel ?? {
    riskScore: 0,
    summary: "No risk assessment available",
  };

  const scores = complianceResponseData.scores ?? {};

  const chartData = [
    { name: "Shipment Details", score: scores.ShipmentDetails || 0 },
    { name: "Trade & Regulatory", score: scores.TradeAndRegulatoryDetails || 0 },
    { name: "Parties & Identifiers", score: scores.PartiesAndIdentifiers || 0 },
    { name: "Logistics & Handling", score: scores.LogisticsAndHandling || 0 },
    { name: "Intended Use", score: scores.IntendedUseDetails || 0 },
  ];

  const isReady =
    complianceStatus.toLowerCase().trim() === "ready for shipment";

  return (
    <ErrorBoundary>
      <div className="space-y-10 border-t border-slate-200 pt-10">

        {/* Header */}
        <section>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2 mb-4">
            {isReady ? (
              <CheckCircle2 className="text-emerald-500 shrink-0" size={22} />
            ) : (
              <AlertTriangle className="text-red-500 shrink-0" size={22} />
            )}
            Compliance Results
          </h2>

          <span
            className={`inline-block px-3 py-1 rounded text-sm font-semibold ${
              isReady
                ? "bg-emerald-100 text-emerald-700"
                : "bg-red-100 text-red-700"
            }`}
          >
            {complianceStatus}
          </span>
        </section>

        {/* Summary */}
        <section>
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
            Summary
          </h3>
          <p className="text-sm text-slate-700">{summary}</p>
        </section>

        {/* Risk Level */}
        <section>
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
            Risk Score — {riskLevel.riskScore}/100
          </h3>
          <div className="w-full bg-slate-200 rounded h-2 overflow-hidden">
            <div
              style={{ width: `${riskLevel.riskScore}%` }}
              className={`h-2 rounded ${
                riskLevel.riskScore < 30
                  ? "bg-emerald-500"
                  : riskLevel.riskScore < 60
                  ? "bg-yellow-500"
                  : "bg-red-500"
              }`}
            />
          </div>
          <p className="mt-2 text-sm text-slate-600">{riskLevel.summary}</p>
        </section>

        {/* Issues & Recommendations */}
        {(violations.length > 0 || recommendations.length > 0) && (
          <section>
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
              Issues & Recommendations
            </h3>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-xs font-semibold text-slate-500 uppercase tracking-wide border-b border-slate-200">
                    <th className="px-4 py-3 text-left">Field</th>
                    <th className="px-4 py-3 text-left">Violation</th>
                    <th className="px-4 py-3 text-left">Recommendation</th>
                  </tr>
                </thead>
                <tbody>
                  {violations.map((violation, index) => {
                    const matchingRecommendation = recommendations.find(
                      (rec) => rec.field === violation.field
                    );
                    return (
                      <tr key={index} className="border-b border-slate-100 last:border-0">
                        <td className="px-4 py-3 text-slate-800">
                          {violation.field || "Unknown"}
                        </td>
                        <td className="px-4 py-3 text-red-600">
                          {violation.message || "No message"}
                        </td>
                        <td className="px-4 py-3 text-emerald-600">
                          {matchingRecommendation?.message || "N/A"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Compliance Scores */}
        <section>
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-4">
            Compliance Scores
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <XAxis
                  dataKey="name"
                  angle={-45}
                  textAnchor="end"
                  height={60}
                />
                <YAxis domain={[0, 100]} />
                <Tooltip />
                <Bar dataKey="score" fill="#2563EB" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* Additional Tips */}
        {additionalTips.length > 0 && (
          <section>
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
              Additional Tips
            </h3>
            <ul className="space-y-1.5">
              {additionalTips.map((tip, index) => (
                <li key={index} className="flex items-start gap-2 text-sm text-slate-600">
                  <span className="text-blue-500 mt-0.5 shrink-0">•</span>
                  {tip}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </ErrorBoundary>
  );
};

export default ComplianceResponse;
