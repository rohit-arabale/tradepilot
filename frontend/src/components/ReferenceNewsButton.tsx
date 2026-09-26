import React, { useState } from "react";
import { Newspaper, RefreshCw, ExternalLink, ChevronDown, ChevronUp } from "lucide-react";
import { trpc } from "../lib/trpc";
import AIThinking from "./AIThinking";

interface ReferenceNewsButtonProps {
  subject: string;
  kind: "product" | "route" | "compliance";
  className?: string;
}

const INSIGHT_ROWS: Array<{ key: keyof InsightData; label: string }> = [
  { key: "supplyChain", label: "Supply Chain" },
  { key: "priceTrends", label: "Price Trends" },
  { key: "logistics", label: "Logistics" },
  { key: "transportCosts", label: "Transport Costs" },
  { key: "bulkTrends", label: "Bulk Trends" },
  { key: "marketRisks", label: "Market Risks" },
];

interface InsightData {
  supplyChain: string;
  priceTrends: string;
  logistics: string;
  transportCosts: string;
  bulkTrends: string;
  marketRisks: string;
  articles: Array<{ title: string; source: string; url: string }>;
}

export default function ReferenceNewsButton({
  subject,
  kind,
  className = "",
}: ReferenceNewsButtonProps) {
  const [expanded, setExpanded] = useState(false);

  const mutation = trpc.newsContext.marketInsights.useMutation();

  function handleOpen() {
    if (!expanded) {
      setExpanded(true);
      mutation.mutate({ subject, kind });
    } else {
      setExpanded(false);
    }
  }

  function handleRefresh() {
    mutation.mutate({ subject, kind });
  }

  return (
    <div className={`w-full ${className}`}>
      {/* Trigger button */}
      <button
        type="button"
        onClick={handleOpen}
        className="inline-flex items-center gap-2 text-sm font-medium text-slate-700 border border-slate-200 bg-white rounded-xl px-4 py-2.5 shadow-sm hover:bg-slate-50 hover:border-slate-300 transition-colors"
      >
        <Newspaper className="w-4 h-4 text-blue-600 flex-shrink-0" />
        View recent news &amp; market insights
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-slate-400 ml-auto" />
        ) : (
          <ChevronDown className="w-4 h-4 text-slate-400 ml-auto" />
        )}
      </button>

      {/* Expanded panel */}
      {expanded && (
        <div className="mt-2 border border-slate-200 rounded-xl bg-white shadow-sm overflow-hidden">
          {/* Header */}
          <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
            <Newspaper className="w-4 h-4 text-blue-600 flex-shrink-0" />
            <span className="text-sm font-semibold text-slate-900 flex-1">
              Market insights — {subject}
            </span>
            {!mutation.isPending && mutation.data && (
              <button
                type="button"
                onClick={handleRefresh}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Refresh
              </button>
            )}
          </div>

          {/* Pending */}
          {mutation.isPending && (
            <div className="p-4">
              <AIThinking
                steps={[
                  "Searching market news…",
                  "Analyzing supply chain trends…",
                  "Cross-checking pricing & logistics…",
                ]}
              />
            </div>
          )}

          {/* Error */}
          {mutation.isError && !mutation.isPending && (
            <div className="px-4 py-4">
              <p className="text-sm text-slate-500">
                Market insights unavailable right now.{" "}
                <button
                  type="button"
                  onClick={handleRefresh}
                  className="text-blue-600 hover:underline font-medium"
                >
                  Retry
                </button>
              </p>
            </div>
          )}

          {/* Results */}
          {mutation.data && !mutation.isPending && (
            <>
              <div className="divide-y divide-slate-100">
                {INSIGHT_ROWS.map(({ key, label }) => (
                  <div key={key} className="flex items-start gap-3 px-4 py-3">
                    <span className="w-28 flex-shrink-0 text-xs font-semibold text-slate-500 uppercase tracking-wide pt-px">
                      {label}
                    </span>
                    <span className="text-sm text-slate-800 leading-relaxed">
                      {mutation.data[key as keyof InsightData] as string}
                    </span>
                  </div>
                ))}
              </div>

              {/* Sources footer */}
              {mutation.data.articles.length > 0 && (
                <div className="px-4 py-3 bg-slate-50 border-t border-slate-100">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                    Sources
                  </p>
                  <ul className="space-y-1">
                    {mutation.data.articles.map((article, i) => (
                      <li key={i}>
                        <a
                          href={article.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-start gap-1.5 text-xs text-blue-700 hover:text-blue-900 hover:underline leading-snug"
                        >
                          <ExternalLink className="w-3 h-3 mt-0.5 flex-shrink-0" />
                          <span>
                            {article.title}
                            <span className="text-slate-400 font-normal ml-1">
                              — {article.source}
                            </span>
                          </span>
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
