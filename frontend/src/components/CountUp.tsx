import { useEffect, useRef, useState } from "react";

/** Duration used when prop is not provided. */
const DEFAULT_DURATION_MS = 400;

interface CountUpProps {
  value: number;
  /** Animation duration in ms. Default 400. Ignored when prefers-reduced-motion is set. */
  duration?: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
}

/**
 * Animated number tween using requestAnimationFrame with easeOutCubic.
 * - Respects prefers-reduced-motion (snaps to value instantly).
 * - Cancels rAF on unmount to prevent memory leaks.
 * - Handles both positive and negative deltas correctly.
 * - Default duration is 400 ms.
 */
export default function CountUp({
  value,
  duration = DEFAULT_DURATION_MS,
  decimals = 0,
  prefix = "",
  suffix = "",
  className,
}: CountUpProps) {
  const [display, setDisplay] = useState<number>(value);
  const fromRef = useRef<number>(value);
  const startRef = useRef<number>(0);
  const rafRef = useRef<number | null>(null);
  const mountedRef = useRef<boolean>(true);

  // Detect reduce-motion preference once; re-evaluate on each render is fine
  // because the media query result is synchronously available.
  const prefersReducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (Number.isNaN(value)) return;

    // Cancel any in-flight animation before starting a new one.
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    // Snap immediately when reduced-motion is requested or delta is zero.
    if (prefersReducedMotion || fromRef.current === value) {
      setDisplay(value);
      fromRef.current = value;
      return;
    }

    const from = fromRef.current;
    startRef.current = performance.now();

    const tick = (now: number) => {
      if (!mountedRef.current) return;
      const elapsed = now - startRef.current;
      const t = Math.min(1, elapsed / duration);
      // easeOutCubic — works for both positive and negative deltas
      const eased = 1 - Math.pow(1 - t, 3);
      const next = from + (value - from) * eased;
      setDisplay(next);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setDisplay(value);
        fromRef.current = value;
        rafRef.current = null;
      }
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [value, duration, prefersReducedMotion]);

  const factor = Math.pow(10, decimals);
  const rounded = Math.round(display * factor) / factor;
  const formatted = rounded.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  return (
    <span className={className}>
      {prefix}
      {formatted}
      {suffix}
    </span>
  );
}
