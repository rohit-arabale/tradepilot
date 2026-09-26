import React from "react";
import { Newspaper, AlertTriangle, ShieldAlert, Info, ExternalLink, Sparkles } from "lucide-react";
import { trpc } from "../lib/trpc";

/**
 * Visible AI+news workflow card.
 *
 * Per taste.txt: never hide the magic. This card surfaces:
 *  - what AI looked up (the news query)
 *  - which articles it actually considered
 *  - WHY each article changes the user's decision (Gemini reasoning)
 *  - a suggested action
 *
 * Drop this anywhere a user has just made (or is about to make) a shipment
 * decision. It self-fetches on mount and renders inline.
 */

type Surface = "compliance" | "route" | "risk" | "inspect";

interface NewsContextCardProps {
  origin?: string;
  destination?: string;
  productDescription?: string;
  hsCode?: string;
  transportMode?: string;
  surface: Surface;
  /** Optional override for the leading label (e.g. "Route intelligence"). */
  title?: string;
}

const SURFACE_TITLE: Record<Surface, string> = {
  compliance: "Compliance intelligence",
  route: "Route intelligence",
  risk: "Risk feed intelligence",
  inspect: "Inspection intelligence",
};

const SEVERITY_STYLES = {
  block: {
    bg: "bg-red-50",
    border: "border-red-200",
    text: "text-red-700",
    chip: "bg-red-100 text-red-700",
    Icon: ShieldAlert,
    label: "Action required",
  },
  warn: {
    bg: "bg-amber-50",
    border: "border-amber-200",
    text: "text-amber-700",
    chip: "bg-amber-100 text-amber-700",
    Icon: AlertTriangle,
    label: "Caution",
  },
  info: {
    bg: "bg-slate-50",
    border: "border-slate-200",
    text: "text-slate-700",
    chip: "bg-slate-100 text-slate-600",
    Icon: Info,
    label: "Advisory",
  },
} as const;

export default function NewsContextCard({
  origin,
  destination,
  productDescription,
  hsCode,
  transportMode,
  surface,
  title,
}: NewsContextCardProps) {
  const mutation = trpc.newsContext.contextualWarning.useMutation();

  // Fire once per (props) change. Using a mutation (rather than a query) so
  // the call happens on demand from a parent — but we self-trigger here.
  React.useEffect(() => {
    const haveAnyContext =
      origin || destination || productDescription || hsCode || transportMode;
    if (!haveAnyContext) return;
    mutation.mutate({
      origin,
      destination,
      productDescription,
      hsCode,
      transportMode,
      surface,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origin, destination, productDescription, hsCode, transportMode, surface]);

  const heading = title ?? SURFACE_TITLE[surface];

  // ── Loading: visible workflow per taste.txt ──────────────────────────────
  if (mutation.isPending) {
    return (
      <section className="bg-white border border-slate-200 rounded-2xl p-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 mb-3">
          <Newspaper className="w-4 h-4 text-blue-600" />
          {heading}
          <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full ml-auto">
            <Sparkles className="w-3 h-3 animate-pulse" />
            AI is reading the news
          </span>
        </div>
        <div className="space-y-2 text-xs text-slate-500">
          <p className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse" />
            Searching NewsAPI for{" "}
            {[origin, destination].filter(Boolean).join(" ↔ ") || "supply-chain signals"}…
          </p>
          <p className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse" />
            Gemini cross-checking each article against your shipment context…
          </p>
        </div>
      </section>
    );
  }

  // ── Error: still visible, never silent ───────────────────────────────────
  if (mutation.isError) {
    return (
      <section className="bg-white border border-slate-200 rounded-2xl p-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 mb-2">
          <Newspaper className="w-4 h-4 text-slate-400" />
          {heading}
        </div>
        <p className="text-xs text-slate-500">
          News context unavailable right now. Decision proceeds without news input.
        </p>
      </section>
    );
  }

  const data = mutation.data;
  if (!data) return null;

  // ── No material impact ──────────────────────────────────────────────────
  if (data.warnings.length === 0) {
    return (
      <section className="bg-white border border-slate-200 rounded-2xl p-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 mb-2">
          <Newspaper className="w-4 h-4 text-emerald-600" />
          {heading}
          <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full ml-auto">
            All clear
          </span>
        </div>
        <p className="text-xs text-slate-600">
          AI scanned {data.articlesConsidered} recent article
          {data.articlesConsidered === 1 ? "" : "s"} — {data.summary}
        </p>
      </section>
    );
  }

  // ── Warnings present — render each with source link and AI reasoning ───
  const overall = SEVERITY_STYLES[data.overallSeverity === "none" ? "info" : data.overallSeverity];

  return (
    <section className={`border ${overall.border} ${overall.bg} rounded-2xl p-5`}>
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 mb-3">
        <Newspaper className="w-4 h-4 text-blue-600" />
        {heading}
        <span
          className={`inline-flex items-center gap-1 text-xs font-semibold ${overall.chip} px-2 py-0.5 rounded-full ml-auto`}
        >
          <overall.Icon className="w-3 h-3" />
          {overall.label}
        </span>
      </div>

      <p className={`text-sm ${overall.text} mb-4 leading-relaxed`}>
        <span className="font-semibold">AI summary:</span> {data.summary}
      </p>

      <ol className="space-y-3">
        {data.warnings.map((w, i) => {
          const styles = SEVERITY_STYLES[w.severity];
          const Icon = styles.Icon;
          return (
            <li
              key={i}
              className="bg-white border border-slate-200 rounded-xl p-4 space-y-2"
            >
              <div className="flex items-start gap-3">
                <span
                  className={`flex-shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-full ${styles.chip}`}
                >
                  <Icon className="w-4 h-4" />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span
                      className={`text-xs font-semibold uppercase tracking-wide ${styles.text}`}
                    >
                      {styles.label}
                    </span>
                    <span className="text-xs text-slate-400">·</span>
                    <span className="text-xs text-slate-500">{w.source}</span>
                  </div>
                  <a
                    href={w.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-sm font-semibold text-slate-900 hover:text-blue-700 mt-0.5 leading-snug"
                  >
                    {w.headline}
                    <ExternalLink className="inline-block w-3 h-3 ml-1 -mt-0.5 text-slate-400" />
                  </a>
                </div>
              </div>

              <div className="pl-10 space-y-1.5">
                <p className="text-sm text-slate-700 leading-relaxed">
                  <span className="font-semibold text-slate-900">Why it matters:</span>{" "}
                  {w.reasoning}
                </p>
                <p className="text-sm text-slate-700 leading-relaxed">
                  <span className="font-semibold text-slate-900">Suggested action:</span>{" "}
                  {w.suggestedAction}
                </p>
              </div>
            </li>
          );
        })}
      </ol>

      <p className="text-[11px] text-slate-400 mt-3">
        Reviewed {data.articlesConsidered} article{data.articlesConsidered === 1 ? "" : "s"} from NewsAPI. Sources linked above.
      </p>
    </section>
  );
}
