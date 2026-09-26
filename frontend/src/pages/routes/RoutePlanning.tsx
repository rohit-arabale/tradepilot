import React, { useState, useMemo } from "react";
import {
  MapPin,
  Navigation,
  Compass,
  Clock,
  Wind,
  DollarSign,
  Route as RouteIcon,
  RefreshCcw,
  Play,
  Square,
  Leaf,
  Sun,
  Cloud,
  CloudRain,
  Plane,
  Ship,
  Truck,
} from "lucide-react";
import MapView from "../inventory/MapView";
import PageLead from "../../components/PageLead";
import CardSkeleton from "../../components/skeletons/CardSkeleton";
import NewsContextCard from "../../components/NewsContextCard";
import AIThinking from "../../components/AIThinking";
import ReferenceNewsButton from "../../components/ReferenceNewsButton";
import { trpc } from "../../lib/trpc";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RouteLeg {
  id: string;
  from?: string;
  to?: string;
  waypoints: string[];
  state: string;
  hub?: string;
  narrative?: string;
  durationHours?: number;
  costUsd?: number;
  distanceKm?: number;
  distance?: number;
}

interface GeneratedRoute {
  routeDirections: RouteLeg[];
  distanceByLeg: number[];
  totalDistance: number;
  totalCost: number;
  totalTime: number;
  totalTimeDaysRange?: string;
  totalCarbonScore: number;
  tag: string | null;
}

interface PingResult {
  _id: string;
  draftId: string;
  lat: number;
  lng: number;
  speedKmh: number;
  destinationLat: number;
  destinationLng: number;
  distanceKm: number;
  etaMinutes: number;
  createdAt: string | Date;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtEta(minutes: number): string {
  if (minutes < 1) return "< 1 min";
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return mins === 0 ? `${hours}h` : `${hours}h ${mins}m`;
}

function modeColor(state: string): string {
  if (state === "air") return "text-blue-600 bg-blue-50";
  if (state === "sea") return "text-emerald-600 bg-emerald-50";
  return "text-slate-600 bg-slate-100";
}

function modeLabel(state: string): string {
  if (state === "air") return "Air";
  if (state === "sea") return "Sea";
  return "Land";
}

function ModeIcon({ state, className = "" }: { state: string; className?: string }) {
  if (state === "air") return <Plane className={className} />;
  if (state === "sea") return <Ship className={className} />;
  return <Truck className={className} />;
}

function legFrom(leg: RouteLeg): string {
  return leg.from ?? leg.waypoints[0] ?? "";
}

function legTo(leg: RouteLeg): string {
  return leg.to ?? leg.waypoints[leg.waypoints.length - 1] ?? "";
}

// ---------------------------------------------------------------------------
// WeatherTile — current conditions for one city
// ---------------------------------------------------------------------------

interface WeatherData {
  city: string;
  country: string;
  tempC: number;
  condition: string;
  description: string;
  windKmh: number;
  humidity: number;
}

function weatherIcon(condition: string | undefined) {
  if (!condition) return <Cloud className="w-5 h-5 text-gray-400" />;
  const c = condition.toLowerCase();
  if (c.includes("rain") || c.includes("drizzle") || c.includes("thunder"))
    return <CloudRain className="w-5 h-5 text-blue-500" />;
  if (c.includes("cloud")) return <Cloud className="w-5 h-5 text-gray-400" />;
  return <Sun className="w-5 h-5 text-amber-400" />;
}

function WeatherTile({
  data,
  label,
}: {
  data: WeatherData | null | undefined;
  label: string;
}) {
  if (!data) {
    return (
      <div className="border border-gray-200 rounded-lg p-4">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">
          {label}
        </p>
        <p className="text-sm text-gray-400">Weather unavailable</p>
      </div>
    );
  }

  return (
    <div className="border border-gray-200 rounded-lg p-4">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">
        {label}
      </p>
      <div className="flex items-center gap-2 mb-2">
        {weatherIcon(data.condition)}
        <span className="text-2xl font-bold text-slate-800">{data.tempC}&deg;C</span>
      </div>
      <p className="text-sm font-semibold text-slate-700">
        {data.city}, {data.country}
      </p>
      <p className="text-xs text-gray-500 capitalize mt-0.5">{data.description}</p>
      <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
        <span className="flex items-center gap-1">
          <Wind className="w-3 h-3" /> {data.windKmh} km/h
        </span>
        <span>{data.humidity}% humidity</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// LegTimeline — vertical storytelling breakdown of route legs
// ---------------------------------------------------------------------------

function LegTimeline({ legs, distanceByLeg }: { legs: RouteLeg[]; distanceByLeg: number[] }) {
  return (
    <div className="relative">
      {legs.map((leg, i) => {
        const from = legFrom(leg);
        const to = legTo(leg);
        const dist = leg.distanceKm ?? distanceByLeg[i];
        const isLast = i === legs.length - 1;

        return (
          <div key={leg.id} className="relative flex gap-4">
            {/* Connector column */}
            <div className="flex flex-col items-center">
              {/* Stop dot */}
              <div className="w-2.5 h-2.5 rounded-full bg-slate-300 border-2 border-white ring-1 ring-slate-300 shrink-0 mt-1" />
              {/* Vertical line to next leg */}
              {!isLast && (
                <div className="w-px flex-1 bg-slate-200 my-1" />
              )}
            </div>

            {/* Leg content */}
            <div className={`flex-1 pb-5 ${isLast ? "pb-0" : ""}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  {/* Mode + city pair */}
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${modeColor(leg.state)}`}
                    >
                      <ModeIcon state={leg.state} className="w-3 h-3" />
                      {modeLabel(leg.state)}
                    </span>
                    <span className="text-sm font-semibold text-slate-800 truncate">
                      {from} &rarr; {to}
                    </span>
                  </div>

                  {/* Hub name */}
                  {leg.hub && (
                    <p className="text-xs font-medium text-slate-500 mb-0.5">{leg.hub}</p>
                  )}

                  {/* Narrative */}
                  {leg.narrative && (
                    <p className="text-xs italic text-slate-500 leading-relaxed">
                      {leg.narrative}
                    </p>
                  )}
                </div>

                {/* Right side: duration + cost */}
                <div className="text-right shrink-0 space-y-0.5">
                  {leg.durationHours != null && (
                    <p className="text-xs font-semibold text-slate-700">
                      {leg.durationHours < 24
                        ? `${leg.durationHours}h`
                        : `${Math.round(leg.durationHours / 24)}d`}
                    </p>
                  )}
                  {leg.costUsd != null && (
                    <p className="text-xs text-slate-400">${leg.costUsd.toFixed(0)}</p>
                  )}
                  {dist != null && (
                    <p className="text-xs text-slate-300">{dist.toFixed(0)} km</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })}

      {/* Final destination dot */}
      <div className="flex gap-4">
        <div className="flex flex-col items-center">
          <div className="w-2.5 h-2.5 rounded-full bg-blue-500 border-2 border-white ring-1 ring-blue-400 shrink-0 mt-1" />
        </div>
        <p className="text-xs font-semibold text-slate-500 mt-0.5">Destination</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// LiveTrackingRow — per-shipment toggle
// ---------------------------------------------------------------------------

interface SavedRoute {
  _id: string;
  formData: { from: string; to: string; weight: number };
  timestamp: string | Date;
}

const TRACKING_STEPS = [
  "Reading latest position ping…",
  "Calculating remaining distance…",
  "Estimating arrival window…",
];

function LiveTrackingRow({ route }: { route: SavedRoute }) {
  const [tracking, setTracking] = useState(false);
  const recordId = route._id;

  const latestPingQuery = trpc.tracking.latest.useQuery(
    { draftId: recordId },
    { enabled: tracking, retry: false, refetchInterval: tracking ? 5000 : false }
  );

  const ping = latestPingQuery.data as PingResult | undefined;

  return (
    <div className="flex flex-col py-3 px-1 border-b border-slate-100 last:border-0 gap-2">
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-800 truncate">
            {route.formData.from} &rarr; {route.formData.to}
          </p>
          <p className="text-xs text-slate-400 mt-0.5">
            {route.formData.weight} kg &middot; {new Date(route.timestamp).toLocaleDateString()}
          </p>
          {tracking && ping && (
            <p className="text-xs text-blue-600 mt-0.5 font-medium">
              {ping.distanceKm.toFixed(1)} km remaining &middot; ETA {fmtEta(ping.etaMinutes)}
            </p>
          )}
          {tracking && !ping && !latestPingQuery.isLoading && (
            <p className="text-xs text-slate-400 mt-0.5">No ping data yet</p>
          )}
        </div>
        <button
          onClick={() => setTracking((t) => !t)}
          title={tracking ? "Stop tracking" : "Start tracking"}
          className={`ml-3 flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border ${
            tracking
              ? "bg-gray-900 text-white border-gray-900 hover:bg-gray-800"
              : "bg-white text-slate-600 border-slate-300 hover:border-blue-400 hover:text-blue-600"
          }`}
        >
          {tracking ? <Square className="w-3 h-3" /> : <Play className="w-3 h-3" />}
          {tracking ? "Live" : "Track"}
        </button>
      </div>

      {/* AIThinking strip — subtle single-step, only while tracking is active */}
      {tracking && latestPingQuery.isFetching && (
        <AIThinking
          steps={TRACKING_STEPS}
          intervalMs={2000}
          className="py-2 px-3 text-xs"
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

const GENERATE_THINKING_STEPS = [
  "Searching multi-modal trade corridors…",
  "Weighing cost vs time vs carbon…",
  "Drafting 7 route storylines…",
];

export default function RoutePlanning() {
  // Form state
  const [from, setFrom] = useState("Mumbai, India");
  const [to, setTo] = useState("Rotterdam, Netherlands");
  const [weight, setWeight] = useState("500");
  const [description, setDescription] = useState("General cargo");

  // Results
  const [routes, setRoutes] = useState<GeneratedRoute[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const utils = trpc.useUtils();

  const [routeError, setRouteError] = useState<string>("");

  // Generate routes mutation
  const generateMutation = trpc.logistics.generateRoutes.useMutation({
    onSuccess: (data) => {
      const items = data as GeneratedRoute[];
      if (!items || items.length === 0) {
        setRouteError("No routes returned. Try different locations.");
        setRoutes([]);
        return;
      }
      setRouteError("");
      setRoutes(items);
      setSelectedIndex(0);
    },
    onError: (err) => {
      setRouteError(err.message || "Failed to generate routes.");
    },
  });

  // Route history (saved routes = "active shipments")
  const historyQuery = trpc.logistics.getRouteHistory.useQuery(undefined, {
    retry: false,
  });

  // Weather for origin + destination (fetched once routes are generated)
  const weatherQuery = trpc.logistics.weather.useQuery(
    { from: from.trim(), to: to.trim() },
    { enabled: routes.length > 0, retry: false }
  );
  const savedRoutes = (historyQuery.data?.routeHistory ?? []) as unknown as SavedRoute[];

  const handlePlanRoute = (e: React.FormEvent) => {
    e.preventDefault();
    if (!from.trim() || !to.trim()) return;
    const w = parseFloat(weight) || 100;
    generateMutation.mutate({
      from: from.trim(),
      to: to.trim(),
      description: description.trim() || "General cargo",
      package: {
        quantity: 1,
        weight: w,
        height: 50,
        length: 50,
        width: 50,
      },
    });
  };

  const selectedRoute = selectedIndex !== null ? routes[selectedIndex] : null;

  // Memoize so MapView's useEffect doesn't restart on every render
  const mapInlineRoutes = useMemo(() => {
    if (!selectedRoute) return undefined;
    return selectedRoute.routeDirections.map((d) => ({
      id: d.id,
      waypoints: d.waypoints,
      state: d.state as "land" | "sea" | "air",
    }));
  }, [selectedRoute]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-12">

      <PageLead
        title="Plan a global shipping route"
        sub="From and to. Gemini returns 7 options with cost, time, carbon, and a live map. Toggle live tracking on any saved route."
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

        {/* Left: form + results */}
        <div className="lg:col-span-5 space-y-12">

          {/* Plan form — kept as card: input container exception */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <h2 className="text-xl font-bold text-slate-900 mb-5 flex items-center gap-2">
              <Compass className="w-5 h-5 text-blue-600" /> Plan Route
            </h2>
            <form onSubmit={handlePlanRoute} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    From
                  </label>
                  <input
                    type="text"
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                    placeholder="e.g. Mumbai, India"
                    className="w-full px-4 py-3 border border-slate-300 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    To
                  </label>
                  <input
                    type="text"
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                    placeholder="e.g. Rotterdam, Netherlands"
                    className="w-full px-4 py-3 border border-slate-300 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Cargo weight (kg)
                </label>
                <input
                  type="number"
                  min="0.1"
                  step="any"
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                  className="w-full px-4 py-3 border border-slate-300 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <button
                type="submit"
                disabled={generateMutation.isPending}
                className="w-full px-5 py-3 bg-gray-900 hover:bg-gray-800 disabled:opacity-60 text-white text-sm font-semibold rounded-lg"
              >
                {generateMutation.isPending ? "Generating routes..." : "Plan Route"}
              </button>
            </form>
          </div>

          {/* AIThinking — visible while generating routes */}
          {generateMutation.isPending && (
            <div className="space-y-3">
              <AIThinking steps={GENERATE_THINKING_STEPS} intervalMs={2000} />
              <CardSkeleton height={88} />
              <CardSkeleton height={88} />
              <CardSkeleton height={88} />
            </div>
          )}

          {/* Weather strip — shown after routes are generated */}
          {weatherQuery.data && (
            <div className="grid grid-cols-2 gap-3 mb-4">
              <WeatherTile data={weatherQuery.data.origin} label="Origin" />
              <WeatherTile data={weatherQuery.data.destination} label="Destination" />
            </div>
          )}

          {/* Inline error if routes failed */}
          {routeError && !generateMutation.isPending && (
            <p className="text-sm text-red-600" role="alert">{routeError}</p>
          )}

          {/* News-grounded AI intelligence — visible workflow per CLAUDE.md */}
          {!generateMutation.isPending && routes.length > 0 && (
            <NewsContextCard
              surface="route"
              origin={from}
              destination={to}
              transportMode={routes[0]?.routeDirections?.[0]?.state}
            />
          )}

          {/* Route results — flat section, result buttons are the result primitives */}
          {!generateMutation.isPending && routes.length > 0 && (
            <section>
              <h2 className="text-xl font-bold text-slate-900 mb-5">
                {routes.length} Routes — select one
              </h2>
              <div className="space-y-3">
                {routes.map((route, idx) => {
                  const isSelected = selectedIndex === idx;
                  const primaryMode = route.routeDirections[0]?.state ?? "land";
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setSelectedIndex(idx)}
                      className={`w-full text-left p-4 rounded-xl border ${
                        isSelected
                          ? "bg-blue-50 border-blue-500 shadow-sm"
                          : "bg-white border-slate-200 hover:border-slate-300"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${modeColor(primaryMode)}`}>
                            {modeLabel(primaryMode)}
                          </span>
                          {route.tag === "popular" && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                              Popular
                            </span>
                          )}
                        </div>
                        <span className="text-xs font-semibold text-slate-500">
                          {route.totalDistance?.toFixed(0)} km
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-center border-t border-slate-100 pt-2">
                        <div>
                          <p className="text-[10px] text-slate-400 flex items-center justify-center gap-0.5 mb-0.5">
                            <DollarSign className="w-3 h-3" /> Cost
                          </p>
                          <p className="text-sm font-bold text-slate-800">
                            ${route.totalCost?.toFixed(0)}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] text-slate-400 flex items-center justify-center gap-0.5 mb-0.5">
                            <Clock className="w-3 h-3" /> Time
                          </p>
                          <p className="text-sm font-bold text-slate-800">
                            {route.totalTimeDaysRange ?? `${route.totalTime?.toFixed(0)}h`}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] text-slate-400 flex items-center justify-center gap-0.5 mb-0.5">
                            <Leaf className="w-3 h-3" /> CO2
                          </p>
                          <p className="text-sm font-bold text-slate-800">
                            {route.totalCarbonScore?.toFixed(0)} kg
                          </p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {/* Empty state — no routes yet, flat inline nudge */}
          {!generateMutation.isPending && routes.length === 0 && (
            <div className="py-10 text-center">
              <RouteIcon className="w-10 h-10 mx-auto text-slate-300 mb-3" />
              <p className="text-sm font-semibold text-slate-600">No routes planned yet</p>
              <p className="text-sm text-slate-500 mt-1">
                Enter an origin and destination above, then click Plan Route.
              </p>
            </div>
          )}
        </div>

        {/* Right: map + active shipments — no outer cards */}
        <div className="lg:col-span-7 space-y-12">

          {/* Route visualization — bare map, result panel only when needed */}
          <section>
            <h2 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2">
              <Navigation className="w-5 h-5 text-blue-600" /> Route Visualization
            </h2>
            <MapView inlineRoutes={mapInlineRoutes} />

            {/* Selected route detail — leg timeline + summary */}
            {selectedRoute && (
              <div className="mt-5 p-5 bg-white rounded-xl border border-slate-200 shadow-sm">
                {/* ReferenceNewsButton — above the timeline */}
                <div className="mb-4">
                  <ReferenceNewsButton
                    subject={`${from.trim()} to ${to.trim()} shipping route`}
                    kind="route"
                  />
                </div>

                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-4">
                  Route story
                </p>

                {/* Vertical leg timeline */}
                <LegTimeline
                  legs={selectedRoute.routeDirections}
                  distanceByLeg={selectedRoute.distanceByLeg}
                />

                {/* Summary totals */}
                <div className="mt-5 pt-4 border-t border-slate-200 grid grid-cols-3 gap-2 text-center text-xs">
                  <div>
                    <p className="text-slate-400">Total Distance</p>
                    <p className="font-bold text-slate-700">{selectedRoute.totalDistance?.toFixed(0)} km</p>
                  </div>
                  <div>
                    <p className="text-slate-400">Est. Cost</p>
                    <p className="font-bold text-slate-700">${selectedRoute.totalCost?.toFixed(0)}</p>
                  </div>
                  <div>
                    <p className="text-slate-400">Carbon</p>
                    <p className="font-bold text-emerald-600">{selectedRoute.totalCarbonScore?.toFixed(0)} kg CO2</p>
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* Active shipments — flat section, no card wrapper */}
          <section className="border-t border-slate-200 pt-12">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                <MapPin className="w-5 h-5 text-blue-600" /> Active Shipments
              </h2>
              <button
                type="button"
                onClick={() => historyQuery.refetch()}
                className="text-xs font-semibold text-slate-500 hover:text-slate-700 flex items-center gap-1"
              >
                <RefreshCcw className="w-3 h-3" /> Refresh
              </button>
            </div>
            <p className="text-sm text-slate-500 mb-5">
              Toggle live tracking on any saved route.
            </p>

            {historyQuery.isLoading ? (
              <div className="space-y-2">
                <CardSkeleton height={48} />
                <CardSkeleton height={48} />
              </div>
            ) : historyQuery.error ? (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700">
                Failed to load shipments.{" "}
                <button onClick={() => historyQuery.refetch()} className="underline">
                  Retry
                </button>
              </div>
            ) : savedRoutes.length === 0 ? (
              <div className="py-8 text-center text-slate-400">
                <Wind className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No saved routes yet. Plan and save a route to track it here.</p>
              </div>
            ) : (
              <div>
                {savedRoutes.map((route) => (
                  <LiveTrackingRow key={route._id} route={route} />
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
