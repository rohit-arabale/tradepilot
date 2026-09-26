import React, { useEffect, useRef, useState } from "react";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TWEEN_DURATION_MS = 600;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface TrustGaugeProps {
  /** 0 - 100. Anything outside that range is clamped. */
  value: number;
  /** Diameter in px. Default 200. */
  size?: number;
  /** Stroke width of the arc. Default size / 12 (min 8). */
  stroke?: number;
  /** Label shown beneath the score. */
  label?: string;
  /** Pulse halo animation. Defaults true. Disabled when prefers-reduced-motion. */
  pulse?: boolean;
  /** Whether to render a compact variant (smaller text). */
  compact?: boolean;
  /** Optional sub-label rendered under the value. */
  subLabel?: string;
}

// ---------------------------------------------------------------------------
// Color logic: emerald (high) → blue (mid-high) → amber (mid-low) → red (low)
// ---------------------------------------------------------------------------

interface ScoreColors {
  ring: string;
  soft: string;
  text: string;
}

function colorForScore(v: number): ScoreColors {
  if (v >= 80) {
    return { ring: "#10b981", soft: "#6ee7b7", text: "#047857" }; // emerald
  }
  if (v >= 60) {
    return { ring: "#3b82f6", soft: "#93c5fd", text: "#1d4ed8" }; // blue
  }
  if (v >= 40) {
    return { ring: "#f59e0b", soft: "#fcd34d", text: "#b45309" }; // amber
  }
  return { ring: "#ef4444", soft: "#fca5a5", text: "#b91c1c" };    // red
}

// ---------------------------------------------------------------------------
// useAnimatedValue hook
// ---------------------------------------------------------------------------

/**
 * Tween a number toward `target` over `durationMs` using rAF.
 * Respects prefers-reduced-motion — snaps instantly when set.
 * Cancels rAF on unmount.
 */
function useAnimatedValue(target: number, durationMs: number): number {
  const [animValue, setAnimValue] = useState(target);
  const fromRef = useRef(target);
  const startRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const mountedRef = useRef(true);

  const prefersReducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  useEffect(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    if (prefersReducedMotion) {
      setAnimValue(target);
      fromRef.current = target;
      return;
    }

    const from = fromRef.current;
    if (from === target) {
      setAnimValue(target);
      return;
    }

    startRef.current = null;

    const animate = (now: number) => {
      if (!mountedRef.current) return;
      if (startRef.current === null) startRef.current = now;
      const elapsed = now - startRef.current;
      const t = Math.min(1, elapsed / durationMs);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      const next = from + (target - from) * eased;
      setAnimValue(next);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(animate);
      } else {
        setAnimValue(target);
        fromRef.current = target;
        rafRef.current = null;
      }
    };

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, durationMs]);

  return animValue;
}

// ---------------------------------------------------------------------------
// Pulse halo — CSS-only to respect reduce-motion without framer-motion overhead
// ---------------------------------------------------------------------------

const pulseKeyframes = `
@keyframes tg-pulse-halo {
  0%   { box-shadow: 0 0 0 0px var(--tg-soft); opacity: 0.45; }
  100% { box-shadow: 0 0 0 var(--tg-pulse-size) transparent; opacity: 0; }
}
@media (prefers-reduced-motion: reduce) {
  .tg-pulse-halo { animation: none !important; }
}
`;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const TrustGauge: React.FC<TrustGaugeProps> = ({
  value,
  size = 200,
  stroke,
  label = "Trust Index",
  pulse = true,
  compact = false,
  subLabel,
}) => {
  const clamped = Math.max(0, Math.min(100, value));
  const animated = useAnimatedValue(clamped, TWEEN_DURATION_MS);

  const strokeWidth = stroke ?? Math.max(8, Math.round(size / 12));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (animated / 100) * circumference;
  const colors = colorForScore(animated);
  const gradId = `tg-grad-${size}`;
  const pulseSize = Math.round(size / 10);

  return (
    <>
      {/* Inject keyframes once (idempotent in the browser) */}
      <style>{pulseKeyframes}</style>
      <div
        className="relative inline-flex flex-col items-center justify-center"
        style={{ width: size, height: size }}
        role="meter"
        aria-label={`${label}: ${Math.round(animated)} out of 100`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(animated)}
      >
        {/* SVG arc */}
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="block"
          aria-hidden="true"
          style={{ transform: "rotate(-90deg)" }}
        >

          {/* Track */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="#e2e8f0"
            strokeWidth={strokeWidth}
            fill="none"
          />
          {/* Progress arc — CSS transition so reduce-motion is handled by the browser */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={colors.ring}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{ transition: "stroke-dashoffset 0.25s ease-out" }}
          />
        </svg>

        {/* Pulse halo — CSS-only, disabled via media query */}
        {pulse && (
          <span
            aria-hidden="true"
            className="tg-pulse-halo absolute inset-2 rounded-full"
            style={
              {
                "--tg-soft": colors.soft,
                "--tg-pulse-size": `${pulseSize}px`,
                animation: "tg-pulse-halo 2s ease-out infinite",
              } as React.CSSProperties
            }
          />
        )}

        {/* Center label */}
        <div
          className="absolute inset-0 flex flex-col items-center justify-center select-none"
          style={{ color: colors.text }}
          aria-hidden="true"
        >
          <span
            className={
              compact
                ? "text-3xl font-bold tabular-nums"
                : "text-5xl font-extrabold tabular-nums"
            }
          >
            {Math.round(animated)}
          </span>
          <span
            className={
              compact
                ? "text-[10px] font-semibold uppercase tracking-wider text-slate-500 mt-0.5"
                : "text-xs font-semibold uppercase tracking-wider text-slate-500 mt-1"
            }
          >
            {label}
          </span>
          {subLabel && (
            <span className="text-[10px] text-slate-400 mt-0.5">{subLabel}</span>
          )}
        </div>
      </div>
    </>
  );
};

export default TrustGauge;
