// Shared helpers for trust scoring colors, formatting, and tiny stateless utilities
// used across the verification feature pages.
// All functions are pure (no side-effects) and exported for direct use.

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TrustTone = "ok" | "warn" | "danger" | "info" | "neutral";

export type SeverityLevel = "low" | "medium" | "high" | "critical" | "info";

// ---------------------------------------------------------------------------
// Score → tone
// ---------------------------------------------------------------------------

/**
 * Map a 0-100 trust score to a semantic tone.
 * Bands match the verdict bands so tone never disagrees with the verdict label.
 */
export function trustToneFromScore(score: number): TrustTone {
  if (score >= 80) return "ok";
  if (score >= 60) return "warn";
  if (score >= 0) return "danger";
  return "neutral";
}

// ---------------------------------------------------------------------------
// Score → verdict label
// ---------------------------------------------------------------------------

/** Human-readable verdict for a 0-100 trust score. */
export function verdictFromScore(score: number): string {
  if (score >= 90) return "Verified";
  if (score >= 80) return "Trusted";
  if (score >= 60) return "Caution";
  if (score >= 40) return "At Risk";
  if (score >= 20) return "Suspect";
  return "Critical";
}

// ---------------------------------------------------------------------------
// Score → color hex (for SVG / canvas consumers)
// ---------------------------------------------------------------------------

/** Returns a CSS hex color for a 0-100 score: emerald → amber → red. */
export function colorFromScore(score: number): string {
  if (score >= 80) return "#10b981"; // emerald-500
  if (score >= 60) return "#3b82f6"; // blue-500
  if (score >= 40) return "#f59e0b"; // amber-500
  return "#ef4444";                  // red-500
}

// ---------------------------------------------------------------------------
// Tone → Tailwind class helpers
// ---------------------------------------------------------------------------

/** Tailwind text color class for a trust tone. */
export function trustText(tone: TrustTone): string {
  switch (tone) {
    case "ok":      return "text-emerald-600";
    case "warn":    return "text-amber-600";
    case "danger":  return "text-red-600";
    case "info":    return "text-blue-600";
    default:        return "text-slate-700";
  }
}

/** Tailwind background + border + text classes for a trust tone (badge/chip use). */
export function trustBg(tone: TrustTone): string {
  switch (tone) {
    case "ok":      return "bg-emerald-50 border-emerald-200 text-emerald-700";
    case "warn":    return "bg-amber-50 border-amber-200 text-amber-700";
    case "danger":  return "bg-red-50 border-red-200 text-red-700";
    case "info":    return "bg-blue-50 border-blue-200 text-blue-700";
    default:        return "bg-slate-50 border-slate-200 text-slate-700";
  }
}

/** Tailwind solid background class for a trust tone (progress bar / dot use). */
export function trustSolid(tone: TrustTone): string {
  switch (tone) {
    case "ok":      return "bg-emerald-500";
    case "warn":    return "bg-amber-500";
    case "danger":  return "bg-red-500";
    case "info":    return "bg-blue-500";
    default:        return "bg-slate-400";
  }
}

// ---------------------------------------------------------------------------
// Severity → Tailwind class
// ---------------------------------------------------------------------------

/**
 * Map a raw severity string to a Tailwind color-class trio
 * (ring/background, dot, text) for consistent UI treatment.
 */
export function severityToTailwind(severity: SeverityLevel | string): {
  ring: string;
  dot: string;
  text: string;
} {
  const s = severity.toLowerCase();
  if (s === "critical" || s === "high") {
    return {
      ring: "ring-red-200 bg-red-50",
      dot:  "bg-red-500",
      text: "text-red-700",
    };
  }
  if (s === "medium" || s === "warn") {
    return {
      ring: "ring-amber-200 bg-amber-50",
      dot:  "bg-amber-500",
      text: "text-amber-700",
    };
  }
  if (s === "ok" || s === "success") {
    return {
      ring: "ring-emerald-200 bg-emerald-50",
      dot:  "bg-emerald-500",
      text: "text-emerald-700",
    };
  }
  // low / info / anything else
  return {
    ring: "ring-blue-200 bg-blue-50",
    dot:  "bg-blue-500",
    text: "text-blue-700",
  };
}

// ---------------------------------------------------------------------------
// Number / date formatting helpers
// ---------------------------------------------------------------------------

/** Format a count with locale separators (e.g. 1,234). */
export function formatCount(n: number): string {
  return n.toLocaleString();
}

/** Format a decimal as a percentage string (e.g. 0.753 → "75.3%"). */
export function formatPercent(ratio: number, decimals = 1): string {
  return `${(ratio * 100).toFixed(decimals)}%`;
}

/** Format bytes to a human-readable string (KB / MB / GB). */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/** Format a number as USD currency (e.g. 1234.5 → "$1,234.50"). */
export function formatCurrency(amount: number, currency = "USD"): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/** Format a Date or string to a short locale date string (e.g. "Jun 12, 2026"). */
export function formatDate(input: Date | string | number): string {
  const d = new Date(input);
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// ---------------------------------------------------------------------------
// Hashing
// ---------------------------------------------------------------------------

/** A tiny djb2-style hash that yields a short hex string. Stable across runs. */
export function shortHash(input: string, length = 8): string {
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) + h) ^ input.charCodeAt(i);
    h |= 0;
  }
  const hex = (h >>> 0).toString(16).padStart(8, "0");
  if (hex.length >= length) return hex.slice(0, length);
  const extra = ((h ^ (h >>> 13)) >>> 0).toString(16).padStart(8, "0");
  return (hex + extra).slice(0, length);
}

// ---------------------------------------------------------------------------
// Relative time
// ---------------------------------------------------------------------------

/** Human-readable relative time (e.g. "just now", "3m ago", "2d ago"). */
export function formatRelativeTime(input: Date | string | number): string {
  const d = new Date(input);
  const diffMs = Date.now() - d.getTime();
  const sec = Math.max(0, Math.round(diffMs / 1000));
  if (sec < 5) return "just now";
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  return `${day}d ago`;
}
