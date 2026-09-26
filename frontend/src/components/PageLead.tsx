import React from "react";

interface PageLeadProps {
  title: string;
  sub: string;
  /** Optional right-side controls (e.g. a DraftPicker or a CTA). */
  right?: React.ReactNode;
}

/**
 * Per-page lead block. One sentence about what the page does and one
 * sentence about what's happening. Replaces the old blue Header. No card,
 * no shadow — direct typography against the slate-50 page bg.
 */
function PageLead({ title, sub, right }: PageLeadProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 pb-2">
      <div className="max-w-3xl">
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
          {title}
        </h1>
        <p className="text-sm sm:text-base text-slate-600 mt-1.5 leading-relaxed">
          {sub}
        </p>
      </div>
      {right && (
        <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">{right}</div>
      )}
    </div>
  );
}

export default PageLead;
