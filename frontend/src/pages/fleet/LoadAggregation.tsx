import { useCallback, useState } from "react";
import { MapPin, Package, RefreshCcw, Truck } from "lucide-react";

import InsightsRail from "../../components/InsightsRail";
import CountUp from "../../components/CountUp";
import CardSkeleton from "../../components/skeletons/CardSkeleton";
import { trpc } from "../../lib/trpc";


// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function fmtDate(date: string | Date): string {
  return new Date(date).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function fmtWeight(kg: number): string {
  return kg.toLocaleString(undefined, { maximumFractionDigits: 1 }) + " kg";
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LoadOffer {
  _id: string;
  originCity: string;
  destinationCity: string;
  weightKg: number;
  pickupDate: string | Date;
  status: string;
  notes?: string;
  createdAt: string | Date;
}

interface MatchResult extends LoadOffer {
  similarityScore: number;
}

// ---------------------------------------------------------------------------
// Status badge colors
// ---------------------------------------------------------------------------

const STATUS_COLORS: Record<string, string> = {
  open: "bg-emerald-100 text-emerald-800",
  matched: "bg-blue-100 text-blue-800",
  cancelled: "bg-red-100 text-red-800",
};

// ---------------------------------------------------------------------------
// CorridorArc — static SVG showing the origin → destination corridor.
// ---------------------------------------------------------------------------

function CorridorArc({
  origin,
  destination,
}: {
  origin: string;
  destination: string;
}) {
  const sameCity = origin.trim() !== "" && origin.trim() === destination.trim();

  if (sameCity) {
    return (
      <div
        className="rounded-xl border border-slate-200 px-5 py-4"
        aria-label={`Same origin and destination: ${origin}`}
      >
        <svg viewBox="0 0 400 100" className="w-full h-16" aria-hidden="true">
          <circle cx="200" cy="50" r="18" fill="none" stroke="#3b82f6" strokeWidth="3" strokeDasharray="6,4" />
          <circle cx="200" cy="50" r="6" fill="#3b82f6" />
          <circle cx="200" cy="50" r="3" fill="#fff" />
        </svg>
        <div className="flex justify-center text-xs text-slate-600 font-semibold mt-1">
          <span className="flex items-center gap-1">
            <MapPin className="w-3 h-3 text-blue-600" aria-hidden="true" />
            {origin} (same city)
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      className="rounded-xl border border-slate-200 px-5 py-4"
      aria-label={`Corridor from ${origin || "origin"} to ${destination || "destination"}`}
    >
      <svg viewBox="0 0 400 100" className="w-full h-16" aria-hidden="true">
        <path
          d="M 30 80 Q 200 0 370 80"
          fill="none"
          stroke="#3b82f6"
          strokeWidth="2.5"
          strokeDasharray="5,4"
        />
        <circle cx="30" cy="80" r="6" fill="#3b82f6" />
        <circle cx="30" cy="80" r="3" fill="#fff" />
        <circle cx="370" cy="80" r="6" fill="#3b82f6" />
        <circle cx="370" cy="80" r="3" fill="#fff" />
      </svg>
      <div className="flex items-center justify-between text-xs text-slate-600 font-semibold mt-1">
        <span className="flex items-center gap-1">
          <MapPin className="w-3 h-3 text-blue-600" aria-hidden="true" />
          {origin || "—"}
        </span>
        <span className="flex items-center gap-1">
          {destination || "—"}
          <MapPin className="w-3 h-3 text-blue-600" aria-hidden="true" />
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SimilarityRing — small circular SVG showing match %
// ---------------------------------------------------------------------------

const SimilarityRing = ({ pct }: { pct: number }) => {
  const r = 18;
  const c = 2 * Math.PI * r;
  const safePct = Math.min(100, Math.max(0, pct));
  const offset = c * (1 - safePct / 100);
  return (
    <div className="relative w-12 h-12" aria-label={`${Math.round(safePct)}% match`}>
      <svg viewBox="0 0 44 44" className="w-full h-full -rotate-90" aria-hidden="true">
        <circle cx="22" cy="22" r={r} stroke="#e2e8f0" strokeWidth="4" fill="none" />
        <circle
          cx="22"
          cy="22"
          r={r}
          stroke="#3b82f6"
          strokeWidth="4"
          strokeLinecap="round"
          fill="none"
          strokeDasharray={c}
          strokeDashoffset={offset}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-blue-700">
        {Math.round(safePct)}%
      </span>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export default function LoadAggregation({ asTab = false }: { asTab?: boolean }) {
  const [originCity, setOriginCity] = useState("");
  const [destinationCity, setDestinationCity] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [pickupDate, setPickupDate] = useState("");
  const [notes, setNotes] = useState("");

  const [selectedOfferId, setSelectedOfferId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string>("");

  const utils = trpc.useUtils();

  const createOffer = trpc.loadMatch.createOffer.useMutation({
    onSuccess: () => {
      setLoadError("");
      setOriginCity("");
      setDestinationCity("");
      setWeightKg("");
      setPickupDate("");
      setNotes("");
      utils.loadMatch.listMine.invalidate().catch(() => null);
    },
    onError: (err) => {
      setLoadError(err.message || "Failed to create load offer.");
    },
  });

  const cancelOffer = trpc.loadMatch.cancel.useMutation({
    onSuccess: (_data, variables) => {
      setLoadError("");
      utils.loadMatch.listMine.invalidate().catch(() => null);
      setSelectedOfferId((current) =>
        current === variables.offerId ? null : current,
      );
    },
    onError: (err) => {
      setLoadError(err.message || "Failed to cancel offer.");
    },
  });

  const offersQuery = trpc.loadMatch.listMine.useQuery({});
  const myOffers: LoadOffer[] =
    (offersQuery.data?.offers as unknown as LoadOffer[]) ?? [];

  const matchQuery = trpc.loadMatch.findMatches.useQuery(
    { offerId: selectedOfferId! },
    { enabled: !!selectedOfferId }
  );
  const matches: MatchResult[] =
    (matchQuery.data?.matches as unknown as MatchResult[]) ?? [];

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (createOffer.isPending) return;
      if (!originCity.trim()) {
        setLoadError("Origin city is required.");
        return;
      }
      if (!destinationCity.trim()) {
        setLoadError("Destination city is required.");
        return;
      }
      const weight = parseFloat(weightKg);
      if (isNaN(weight) || weight <= 0) {
        setLoadError("Weight must be a positive number.");
        return;
      }
      if (!pickupDate) {
        setLoadError("Pickup date is required.");
        return;
      }
      setLoadError("");
      createOffer.mutate({
        originCity: originCity.trim(),
        destinationCity: destinationCity.trim(),
        weightKg: weight,
        pickupDate,
        notes: notes.trim() || undefined,
      });
    },
    [originCity, destinationCity, weightKg, pickupDate, notes, createOffer]
  );

  const handleFindMatches = useCallback(
    (offerId: string) => {
      setSelectedOfferId((current) => (current === offerId ? null : offerId));
    },
    []
  );

  const handleCancel = useCallback(
    (offerId: string) => {
      if (cancelOffer.isPending) return;
      cancelOffer.mutate({ offerId });
    },
    [cancelOffer]
  );

  const selectedOffer = myOffers.find((o) => o._id === selectedOfferId);

  const inner = (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
      {/* ----------------------------------------------------------------
          Left column: form + offers
      ---------------------------------------------------------------- */}
      <div className="lg:col-span-8 space-y-12">

        {/* Post Load Form — one card, groups the form inputs */}
        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8">
          <h2 className="text-xl font-bold text-slate-900 mb-1">
            Post a Load Offer
          </h2>
          <p className="text-sm text-slate-500 mb-6">
            Share your available truck capacity. The system will find
            compatible loads along the same corridor.
          </p>

          {(originCity.trim() || destinationCity.trim()) && (
            <div className="mb-6">
              <CorridorArc
                origin={originCity}
                destination={destinationCity}
              />
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="la-origin"
                  className="block text-sm font-medium text-slate-700 mb-1.5"
                >
                  Origin City
                </label>
                <input
                  id="la-origin"
                  type="text"
                  value={originCity}
                  onChange={(e) => setOriginCity(e.target.value)}
                  placeholder="e.g. Chicago"
                  maxLength={120}
                  className="w-full px-4 py-3 rounded-lg border border-slate-300 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div>
                <label
                  htmlFor="la-destination"
                  className="block text-sm font-medium text-slate-700 mb-1.5"
                >
                  Destination City
                </label>
                <input
                  id="la-destination"
                  type="text"
                  value={destinationCity}
                  onChange={(e) => setDestinationCity(e.target.value)}
                  placeholder="e.g. Detroit"
                  maxLength={120}
                  className="w-full px-4 py-3 rounded-lg border border-slate-300 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div>
                <label
                  htmlFor="la-weight"
                  className="block text-sm font-medium text-slate-700 mb-1.5"
                >
                  Weight (kg)
                </label>
                <input
                  id="la-weight"
                  type="number"
                  value={weightKg}
                  onChange={(e) => setWeightKg(e.target.value)}
                  placeholder="e.g. 800"
                  min="0.1"
                  step="0.1"
                  className="w-full px-4 py-3 rounded-lg border border-slate-300 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div>
                <label
                  htmlFor="la-date"
                  className="block text-sm font-medium text-slate-700 mb-1.5"
                >
                  Pickup Date
                </label>
                <input
                  id="la-date"
                  type="date"
                  value={pickupDate}
                  onChange={(e) => setPickupDate(e.target.value)}
                  className="w-full px-4 py-3 rounded-lg border border-slate-300 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="la-notes"
                className="block text-sm font-medium text-slate-700 mb-1.5"
              >
                Notes{" "}
                <span className="font-normal text-slate-400">(optional)</span>
              </label>
              <textarea
                id="la-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any special requirements, cargo type, etc."
                rows={3}
                maxLength={500}
                className="w-full px-4 py-3 rounded-lg border border-slate-300 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
              />
            </div>

            {loadError && (
              <p className="text-sm text-red-600" role="alert">{loadError}</p>
            )}
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={createOffer.isPending}
                aria-label="Post load offer"
                className="px-5 py-3 bg-gray-900 hover:bg-gray-800 disabled:bg-slate-400 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg flex items-center gap-2"
              >
                {createOffer.isPending ? (
                  <>
                    <span
                      className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full"
                      aria-hidden="true"
                    />
                    Posting…
                  </>
                ) : (
                  "Post Load Offer"
                )}
              </button>
            </div>
          </form>
        </section>

        {/* My Offers — flat list, no card wrapper */}
        <section aria-label="My load offers">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-xl font-bold text-slate-900">My Load Offers</h2>
            {myOffers.length > 0 && (
              <span
                className="text-sm text-slate-500"
                aria-live="polite"
              >
                <CountUp value={myOffers.length} /> active
              </span>
            )}
          </div>

          {offersQuery.isLoading ? (
            <div className="space-y-3" aria-busy="true">
              <CardSkeleton height={120} />
              <CardSkeleton height={120} />
            </div>
          ) : offersQuery.error ? (
            <div className="bg-red-50 border border-red-200 rounded-xl p-5">
              <p className="text-sm text-red-700 font-medium mb-2">
                {offersQuery.error.message || "Failed to load your offers."}
              </p>
              <button
                type="button"
                onClick={() => offersQuery.refetch()}
                className="text-xs text-red-600 hover:text-red-700 underline"
              >
                Retry
              </button>
            </div>
          ) : myOffers.length === 0 ? (
            <div className="flex flex-col items-center py-10 text-center">
              <Truck className="w-8 h-8 text-slate-300 mb-3" aria-hidden="true" />
              <p className="text-sm font-semibold text-slate-600">No load offers yet</p>
              <p className="text-sm text-slate-500 mt-1">Post your first offer above to start aggregating loads.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {myOffers.map((offer) => (
                <OfferCard
                  key={offer._id}
                  offer={offer}
                  isSelected={selectedOfferId === offer._id}
                  matches={matches}
                  matchLoading={matchQuery.isLoading}
                  matchError={matchQuery.error?.message ?? null}
                  onFindMatches={handleFindMatches}
                  onCancel={handleCancel}
                  cancelPending={cancelOffer.isPending}
                  onRefetchMatches={() => matchQuery.refetch()}
                />
              ))}
            </div>
          )}
        </section>

        {selectedOffer && (
          <div
            className="text-xs text-slate-500 flex items-center gap-2"
            aria-live="polite"
          >
            <RefreshCcw className="w-3 h-3" aria-hidden="true" />
            Match candidates refresh whenever you change selection.
          </div>
        )}
      </div>

      <aside className="lg:col-span-4">
        <InsightsRail title="Verification Activity" />
      </aside>
    </div>
  );

  if (asTab) return inner;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
      {inner}
    </div>
  );
}

// ---------------------------------------------------------------------------
// OfferCard — extracted for performance (result panel — one card allowed)
// ---------------------------------------------------------------------------

interface OfferCardProps {
  offer: LoadOffer;
  isSelected: boolean;
  matches: MatchResult[];
  matchLoading: boolean;
  matchError: string | null;
  onFindMatches: (id: string) => void;
  onCancel: (id: string) => void;
  cancelPending: boolean;
  onRefetchMatches: () => void;
}

const OfferCard = ({
  offer,
  isSelected,
  matches,
  matchLoading,
  matchError,
  onFindMatches,
  onCancel,
  cancelPending,
  onRefetchMatches,
}: OfferCardProps) => {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 sm:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-2 flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-base font-bold text-slate-900">
              {offer.originCity}
              <span className="mx-2 text-blue-400" aria-hidden="true">→</span>
              {offer.destinationCity}
            </span>
            <span
              className={`px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize ${
                STATUS_COLORS[offer.status] ?? "bg-slate-100 text-slate-700"
              }`}
            >
              {offer.status}
            </span>
          </div>

          <div className="flex flex-wrap gap-4 text-sm text-slate-600">
            <span>
              <span className="font-semibold text-slate-700">Weight:</span>{" "}
              {fmtWeight(offer.weightKg)}
            </span>
            <span>
              <span className="font-semibold text-slate-700">Pickup:</span>{" "}
              {fmtDate(offer.pickupDate)}
            </span>
            <span>
              <span className="font-semibold text-slate-700">Posted:</span>{" "}
              {fmtDate(offer.createdAt)}
            </span>
          </div>

          {offer.notes && (
            <p className="text-sm text-slate-500 italic">{offer.notes}</p>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {offer.status === "open" && (
            <>
              <button
                type="button"
                onClick={() => onFindMatches(offer._id)}
                aria-label={
                  isSelected
                    ? `Hide matches for ${offer.originCity} to ${offer.destinationCity}`
                    : `Find matches for ${offer.originCity} to ${offer.destinationCity}`
                }
                aria-expanded={isSelected}
                className={`px-5 py-3 text-sm font-semibold rounded-lg ${
                  isSelected
                    ? "bg-gray-900 text-white"
                    : "border border-gray-200 hover:bg-gray-50 text-gray-900"
                }`}
              >
                {isSelected ? "Hide Matches" : "Find Matches"}
              </button>

              <button
                type="button"
                onClick={() => onCancel(offer._id)}
                disabled={cancelPending}
                aria-label={`Cancel offer from ${offer.originCity} to ${offer.destinationCity}`}
                className="px-5 py-3 text-sm font-semibold rounded-lg border-2 border-red-200 hover:border-red-300 text-red-700 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
            </>
          )}
        </div>
      </div>

      {isSelected && (
        <div className="mt-5 pt-5 border-t border-slate-100">
          <h3 className="text-sm font-bold text-slate-700 mb-4">
            Compatible Load Matches
          </h3>

          <div className="mb-5">
            <CorridorArc
              origin={offer.originCity}
              destination={offer.destinationCity}
            />
          </div>

          {matchLoading ? (
            <div className="space-y-3" aria-busy="true">
              <CardSkeleton height={70} />
              <CardSkeleton height={70} />
            </div>
          ) : matchError ? (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <p className="text-sm text-red-700 font-medium">{matchError}</p>
              <button
                type="button"
                onClick={onRefetchMatches}
                className="text-xs text-red-600 hover:text-red-700 underline mt-1"
              >
                Retry
              </button>
            </div>
          ) : matches.length === 0 ? (
            <div className="flex flex-col items-center py-6 text-center">
              <Package
                className="w-8 h-8 text-slate-300 mb-2"
                aria-hidden="true"
              />
              <p className="text-sm text-slate-500 font-medium">
                No compatible loads found
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Check back later or adjust your offer details.
              </p>
            </div>
          ) : (
            <div role="list" aria-label="Match results">
              {matches.map((match) => (
                <div
                  key={match._id}
                  role="listitem"
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 last:border-0 py-3"
                >
                  <div className="space-y-1 flex-1 min-w-0">
                    <div className="text-sm font-semibold text-slate-800">
                      {match.originCity}
                      <span className="mx-2 text-blue-400" aria-hidden="true">→</span>
                      {match.destinationCity}
                    </div>
                    <div className="flex flex-wrap gap-3 text-xs text-slate-500">
                      <span>{fmtWeight(match.weightKg)}</span>
                      <span>Pickup: {fmtDate(match.pickupDate)}</span>
                      {match.notes && (
                        <span className="italic truncate">
                          {match.notes}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <SimilarityRing pct={match.similarityScore} />
                    <p className="text-xs text-slate-500 whitespace-nowrap">
                      Combined:{" "}
                      <strong className="text-slate-700">
                        {fmtWeight(offer.weightKg + match.weightKg)}
                      </strong>
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
