import { TileSkeleton } from "./CardSkeleton";

/**
 * Hero skeleton — occupies the exact footprint of the dashboard hero block
 * while the trust gauge + stat tiles are loading.
 * Uses the same class as all other skeleton variants.
 */
export default function HeroSkeleton() {
  return (
    <div
      className="bg-white  rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-8"
      aria-hidden="true"
    >
      <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-8 items-center">
        {/* Gauge placeholder */}
        <div className="flex items-center justify-center">
          <div className="w-[200px] h-[200px] rounded-full bg-slate-100" />
        </div>
        {/* Stat tiles placeholder */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <TileSkeleton />
          <TileSkeleton />
          <TileSkeleton />
          <TileSkeleton />
        </div>
      </div>
    </div>
  );
}
