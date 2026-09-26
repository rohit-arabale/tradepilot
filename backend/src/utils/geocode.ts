import axios from "axios";

// ---------------------------------------------------------------------------
// Named constants
// ---------------------------------------------------------------------------

/** Milliseconds before an upstream geocoding request is aborted. */
const GEOCODE_TIMEOUT_MS = 8_000;

/** Milliseconds before an upstream Routes API request is aborted. */
const ROUTES_TIMEOUT_MS = 12_000;

/** How many times to retry a failed geocode before propagating the error. */
const GEOCODE_MAX_RETRIES = 2;

/** Base delay (ms) between geocode retries — doubles on each attempt. */
const GEOCODE_RETRY_BASE_MS = 500;

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LatLng {
  lat: number;
  lng: number;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Sleep for `ms` milliseconds. Used for exponential-backoff retry.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Errors that are permanent for a given address — retrying will not help.
 * We tag them so the retry loop can break out early.
 */
class GeocodePermanentError extends Error {
  readonly apiStatus: string;
  constructor(message: string, apiStatus: string) {
    super(message);
    this.name = "GeocodePermanentError";
    this.apiStatus = apiStatus;
  }
}

const PERMANENT_GEOCODE_STATUSES = new Set([
  "ZERO_RESULTS",
  "INVALID_REQUEST",
  "REQUEST_DENIED",
  "NOT_FOUND",
]);

/**
 * Single geocode attempt — does NOT retry.
 */
async function geocodeOnce(address: string): Promise<LatLng> {
  if (!GOOGLE_API_KEY) {
    throw new Error(
      "[geocode] GOOGLE_API_KEY is not set — cannot call the Geocoding API",
    );
  }
  const response = await axios.get<{
    status: string;
    error_message?: string;
    results: Array<{ geometry: { location: { lat: number; lng: number } } }>;
  }>("https://maps.googleapis.com/maps/api/geocode/json", {
    params: { address, key: GOOGLE_API_KEY },
    timeout: GEOCODE_TIMEOUT_MS,
  });

  if (response.data.status === "OK" && response.data.results.length > 0) {
    const location = response.data.results[0].geometry.location;
    return { lat: location.lat, lng: location.lng };
  }

  const apiStatus = response.data.status;
  const apiMsg = response.data.error_message ?? "No error message";
  console.error(
    `[geocode] Geocoding failed for "${address}" — status: ${apiStatus}, message: ${apiMsg}`,
  );
  if (PERMANENT_GEOCODE_STATUSES.has(apiStatus)) {
    throw new GeocodePermanentError(
      `Geocoding failed for address "${address}" (status: ${apiStatus})`,
      apiStatus,
    );
  }
  throw new Error(
    `Geocoding failed for address "${address}" (status: ${apiStatus})`,
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Geocode a human-readable address to lat/lng coordinates.
 * Retries up to GEOCODE_MAX_RETRIES times with exponential back-off before
 * propagating the error.
 */
export async function geocodeAddress(address: string): Promise<LatLng> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= GEOCODE_MAX_RETRIES; attempt++) {
    try {
      return await geocodeOnce(address);
    } catch (err) {
      lastError = err;
      // Permanent failures (ZERO_RESULTS, INVALID_REQUEST, ...) won't
      // succeed on retry — break out immediately.
      if (err instanceof GeocodePermanentError) {
        console.warn(
          `[geocode] Not retrying permanent failure for "${address}": ${err.apiStatus}`,
        );
        break;
      }
      if (attempt < GEOCODE_MAX_RETRIES) {
        const delayMs = GEOCODE_RETRY_BASE_MS * Math.pow(2, attempt);
        console.warn(
          `[geocode] Attempt ${attempt + 1} failed for "${address}", retrying in ${delayMs} ms`,
        );
        await sleep(delayMs);
      }
    }
  }
  console.error("[geocode] All retry attempts exhausted for:", address);
  throw lastError;
}

/**
 * Compute a driving route through the given ordered waypoints and return the
 * encoded polyline for map rendering.
 *
 * Requires at least 2 waypoints (origin + destination).
 */
export async function getDirections(waypoints: string[]): Promise<string> {
  if (!GOOGLE_API_KEY) {
    throw new Error(
      "[geocode] GOOGLE_API_KEY is not set — cannot call the Routes API",
    );
  }
  if (waypoints.length < 2) {
    throw new Error("[geocode] getDirections requires at least 2 waypoints");
  }

  let waypointsLatLng: LatLng[];
  try {
    waypointsLatLng = await Promise.all(waypoints.map(geocodeAddress));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[geocode] Failed to geocode one or more waypoints:", message);
    throw err;
  }

  const routesApiUrl =
    "https://routes.googleapis.com/directions/v2:computeRoutes";

  const requestData: Record<string, unknown> = {
    origin: {
      location: {
        latLng: {
          latitude: waypointsLatLng[0].lat,
          longitude: waypointsLatLng[0].lng,
        },
      },
    },
    destination: {
      location: {
        latLng: {
          latitude: waypointsLatLng[waypointsLatLng.length - 1].lat,
          longitude: waypointsLatLng[waypointsLatLng.length - 1].lng,
        },
      },
    },
    travelMode: "DRIVE",
    routingPreference: "TRAFFIC_AWARE",
    computeAlternativeRoutes: false,
    routeModifiers: {
      avoidTolls: false,
      avoidHighways: false,
      avoidFerries: false,
    },
    languageCode: "en-US",
    units: "IMPERIAL",
  };

  if (waypointsLatLng.length > 2) {
    requestData.intermediates = waypointsLatLng.slice(1, -1).map((point) => ({
      location: {
        latLng: { latitude: point.lat, longitude: point.lng },
      },
    }));
  }

  const headers = {
    "Content-Type": "application/json",
    "X-Goog-Api-Key": GOOGLE_API_KEY,
    "X-Goog-FieldMask": "routes.polyline.encodedPolyline",
  };

  try {
    const response = await axios.post<{
      routes?: Array<{ polyline: { encodedPolyline: string } }>;
    }>(routesApiUrl, requestData, { headers, timeout: ROUTES_TIMEOUT_MS });

    if (!response.data.routes || response.data.routes.length === 0) {
      console.error("[geocode] Routes API returned no routes for waypoints:", waypoints);
      throw new Error("No routes found for the given waypoints");
    }

    const encoded = response.data.routes[0]?.polyline?.encodedPolyline;
    if (!encoded || typeof encoded !== "string") {
      console.error(
        "[geocode] Routes API returned a route without an encoded polyline:",
        waypoints,
      );
      throw new Error("Routes API returned an empty polyline");
    }
    return encoded;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[geocode] Routes API request failed:", message);
    throw err;
  }
}
