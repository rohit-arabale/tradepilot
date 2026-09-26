// Skeleton variants: Card, Row, Hero tile — all use the same pulse animation
// for visual unity. Import the variant you need.

interface CardSkeletonProps {
  className?: string;
  /** Explicit height in px. If omitted the block is auto-height via padding. */
  height?: number;
}

/**
 * Card skeleton — occupies a full card slot while data loads.
 * The rounded-2xl + shadow-sm intentionally match the real card style so
 * there is no layout shift when the real content arrives.
 */
export default function CardSkeleton({ className, height = 128 }: CardSkeletonProps) {
  return (
    <div
      className={`bg-white rounded-2xl border border-slate-200 shadow-sm ${className ?? ""}`}
      style={{ height }}
      aria-hidden="true"
    />
  );
}

// ---------------------------------------------------------------------------
// Tile — used inside grids / stat blocks (label + number two-liner)
// ---------------------------------------------------------------------------

export function TileSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={`bg-white rounded-2xl border border-slate-200 p-4 shadow-sm ${className ?? ""}`}
      aria-hidden="true"
    >
      <div className="h-2 w-16 rounded bg-slate-100" />
      <div className="h-7 w-24 rounded bg-slate-100 mt-3" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Row — used in list/table contexts (icon + two lines of text + badge)
// ---------------------------------------------------------------------------

export function RowSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={`bg-white rounded-2xl border border-slate-200 p-4 shadow-sm ${className ?? ""}`}
      aria-hidden="true"
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-slate-100 flex-shrink-0" />
        <div className="flex-1 space-y-2 min-w-0">
          <div className="h-3 w-40 rounded bg-slate-100" />
          <div className="h-3 w-24 rounded bg-slate-100" />
        </div>
        <div className="h-6 w-16 rounded-full bg-slate-100 flex-shrink-0" />
      </div>
    </div>
  );
}
