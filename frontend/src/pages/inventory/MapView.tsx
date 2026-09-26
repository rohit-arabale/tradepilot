/// <reference types="@types/google.maps" />
import React, { useEffect, useRef, useState } from "react";
import { setOptions, importLibrary } from "@googlemaps/js-api-loader";
import { trpc } from "../../lib/trpc";
import type { MapData, RouteDirection } from "@server/routers/logistics";

const MAPS = import.meta.env.VITE_GOOGLE_API_KEY as string;

// setOptions must be called exactly once across the app lifetime. Track it
// so repeated MapView mounts don't trip the loader's "already configured" guard.
let mapsConfigured = false;
async function ensureMapsLoaded(): Promise<typeof google.maps> {
  if (!mapsConfigured) {
    setOptions({ key: MAPS, v: "weekly", libraries: ["geometry"] });
    mapsConfigured = true;
  }
  // Wrap in a 12s timeout so a network/referrer failure surfaces instead
  // of leaving the UI stuck on "Loading map…".
  const timeout = new Promise<never>((_, rej) =>
    setTimeout(() => rej(new Error("Map took too long to load. Check the API key & referrer restrictions.")), 12000)
  );
  await Promise.race([
    Promise.all([
      importLibrary("maps"),
      importLibrary("geometry"),
      importLibrary("marker"),
      importLibrary("core"),
    ]),
    timeout,
  ]);
  return google.maps;
}

interface MapViewProps {
  /** Existing usage — fetches route data from a persisted draft. */
  draftId?: string;
  /**
   * Inline preview usage — pass route directions directly.
   * When provided, MapView calls trpc.logistics.processRoutes without
   * persisting to a draft (pre-save preview). Takes precedence over draftId.
   */
  inlineRoutes?: { id: string; waypoints: string[]; state: "land" | "sea" | "air" }[];
}

function MapView({ draftId, inlineRoutes }: MapViewProps): React.ReactElement {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);
  const mapInstance = useRef<google.maps.Map | null>(null);

  // Strip noisy tRPC / Zod payloads so the user sees something readable.
  // The classic offender is a raw `[{"code":"invalid_value", ... }]` body
  // from a procedure rejecting our input — never user-facing.
  const friendlyError = (raw: unknown): string => {
    const msg = (raw as Error)?.message ?? String(raw ?? "");
    if (/^\s*[\[{]/.test(msg) || /invalid_value|invalid_type|"code"/.test(msg)) {
      return "We couldn't draw this route. The route data was malformed — please retry.";
    }
    if (/timeout|timed out|abort/i.test(msg)) {
      return "The map service took too long to respond. Please retry.";
    }
    return msg || "Could not draw the route.";
  };

  const utils = trpc.useUtils();
  const processRoutesMutation = trpc.logistics.processRoutes.useMutation();
  const updateDraftMutation = trpc.inventory.updateDraft.useMutation();

  const hasInline = inlineRoutes && inlineRoutes.length > 0;
  const hasDraft = Boolean(draftId);

  useEffect(() => {
    let isMounted = true;

    if (!MAPS) {
      setError("Map service is unavailable — VITE_GOOGLE_API_KEY missing.");
      setLoading(false);
      return;
    }

    if (!hasInline && !hasDraft) {
      setLoading(false);
      return;
    }

    const fetchAndRenderMap = async () => {
      if (!mapRef.current) {
        setError("Map container not found");
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        await ensureMapsLoaded();
        if (!isMounted) return;

        const map = new google.maps.Map(mapRef.current, {
          center: { lat: 0, lng: 0 },
          zoom: 2,
          mapTypeId: google.maps.MapTypeId.ROADMAP,
          disableDefaultUI: true,
          zoomControl: true,
        });
        mapInstance.current = map;

        let mapData: MapData;

        if (hasInline) {
          const post = await processRoutesMutation.mutateAsync({
            routes: inlineRoutes!,
          });
          mapData = { routes: post.routes, originalRoute: post.originalRoute };
        } else {
          try {
            mapData = await utils.logistics.getMapData.fetch({ draftId: draftId! });
          } catch {
            const draftResponse = await utils.inventory.getDraftById.fetch({
              id: draftId!,
            });
            const draft = (draftResponse as { draft?: { routeData?: { routeDirections?: RouteDirection[] } } })?.draft;
            if (!draft?.routeData?.routeDirections) {
              throw new Error("No route data on this draft yet.");
            }
            const routesData: RouteDirection[] = draft.routeData.routeDirections.map((d) => ({
              id: d.id,
              waypoints: d.waypoints,
              state: d.state,
            }));
            const post = await processRoutesMutation.mutateAsync({
              routes: routesData,
              draftId: draftId!,
            });
            mapData = { routes: post.routes, originalRoute: post.originalRoute };
            await updateDraftMutation.mutateAsync({
              id: draftId!,
              updateData: { mapData },
            });
          }
        }

        if (!isMounted) return;

        const { routes: processedRoutes, originalRoute } = mapData;
        const bounds = new google.maps.LatLngBounds();

        Object.entries(processedRoutes).forEach(([id, route]) => {
          const dir = originalRoute.find((d) => d.id === id);
          if (!dir) return;

          if (route.state === "land" && "encodedPolyline" in route) {
            const path = google.maps.geometry.encoding.decodePath(route.encodedPolyline);
            new google.maps.Polyline({
              path,
              geodesic: true,
              strokeColor: "#111827",
              strokeOpacity: 1.0,
              strokeWeight: 2,
              map,
            });
            placeMarkers(google, map, path[0], path[path.length - 1], dir.waypoints);
            path.forEach((latLng) => bounds.extend(latLng));
          } else if (
            (route.state === "air" || route.state === "sea") &&
            "coordinates" in route
          ) {
            const path = route.coordinates.map((c) => ({ lat: c.lat, lng: c.lng }));
            new google.maps.Polyline({
              path,
              geodesic: true,
              strokeColor: route.state === "air" ? "#2563eb" : "#0891b2",
              strokeOpacity: 1.0,
              strokeWeight: 2,
              map,
            });
            placeMarkers(google, map, path[0], path[path.length - 1], dir.waypoints);
            path.forEach((latLng) => bounds.extend(latLng));
          }
        });

        if (!bounds.isEmpty()) map.fitBounds(bounds);
      } catch (err) {
        if (isMounted) {
          setError(friendlyError(err));
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchAndRenderMap();

    return () => {
      isMounted = false;
      mapInstance.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftId, inlineRoutes, retryToken]);

  if (!loading && !error && !hasInline && !hasDraft) {
    return (
      <div className="relative h-96 rounded-lg bg-gray-50 border border-gray-200 flex items-center justify-center">
        <p className="text-gray-500 text-sm">Plan a route to see it on the map.</p>
      </div>
    );
  }

  return (
    <div className="relative h-96 rounded-lg overflow-hidden border border-gray-200">
      <div ref={mapRef} className="absolute inset-0 w-full h-full" />

      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/80">
          <div className="text-center">
            <div className="animate-spin rounded-full h-7 w-7 border-2 border-gray-200 border-t-gray-900 mx-auto" />
            <p className="mt-2 text-gray-600 text-sm">Loading map…</p>
          </div>
        </div>
      )}

      {error && !loading && (
        <div className="absolute inset-0 bg-gray-50 flex flex-col items-center justify-center px-6 gap-3">
          <p className="text-gray-700 text-sm text-center max-w-sm">{error}</p>
          <button
            type="button"
            onClick={() => {
              setError(null);
              setRetryToken((t) => t + 1);
            }}
            className="px-3 py-1.5 text-xs font-medium rounded-md bg-gray-900 text-white hover:bg-gray-800"
          >
            Retry
          </button>
        </div>
      )}
    </div>
  );
}

function placeMarkers(
  _google: typeof window.google,
  map: google.maps.Map,
  startLatLng: google.maps.LatLng | { lat: number; lng: number },
  endLatLng: google.maps.LatLng | { lat: number; lng: number },
  waypoints: string[]
) {
  const startMarker = new google.maps.Marker({
    position: startLatLng,
    map,
    title: waypoints[0],
  });
  const endMarker = new google.maps.Marker({
    position: endLatLng,
    map,
    title: waypoints[waypoints.length - 1],
  });

  const startInfo = new google.maps.InfoWindow({
    content: `<div style="font-family:'Plus Jakarta Sans',sans-serif">${waypoints[0]}</div>`,
  });
  const endInfo = new google.maps.InfoWindow({
    content: `<div style="font-family:'Plus Jakarta Sans',sans-serif">${waypoints[waypoints.length - 1]}</div>`,
  });

  startMarker.addListener("click", () => startInfo.open(map, startMarker));
  endMarker.addListener("click", () => endInfo.open(map, endMarker));
}

export default MapView;
