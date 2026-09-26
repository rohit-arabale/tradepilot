import React, { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";

interface AIThinkingProps {
  steps: string[];
  intervalMs?: number;
  className?: string;
}

export default function AIThinking({
  steps,
  intervalMs = 1500,
  className = "",
}: AIThinkingProps) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (steps.length <= 1) return;
    const id = setInterval(() => {
      setIndex((prev) => (prev + 1) % steps.length);
    }, intervalMs);
    return () => clearInterval(id);
  }, [steps.length, intervalMs]);

  const current = steps[index] ?? "";

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={current}
      className={`bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 flex flex-col gap-2 shadow-sm ${className}`}
    >
      <div className="flex items-center gap-2.5">
        <span className="flex-shrink-0 flex items-center justify-center w-6 h-6">
          <Sparkles className="w-4 h-4 text-blue-600 animate-pulse" />
        </span>
        <span
          key={current}
          className="text-sm text-slate-700 font-medium leading-snug flex-1 ai-thinking-fade"
        >
          {current}
        </span>
      </div>

      {/* Indeterminate shimmer progress bar */}
      <div className="relative h-0.5 bg-slate-200 rounded-full overflow-hidden">
        <div className="absolute inset-y-0 left-0 w-1/2 bg-blue-600 rounded-full ai-thinking-shimmer" />
      </div>

      <style>{`
        @keyframes ai-thinking-fade-in {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        .ai-thinking-fade {
          animation: ai-thinking-fade-in 0.3s ease-in both;
        }
        @keyframes ai-thinking-shimmer {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(300%); }
        }
        .ai-thinking-shimmer {
          animation: ai-thinking-shimmer 1.4s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
