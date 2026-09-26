import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

/**
 * Cached generateRoutes responses for headline demo corridors.
 *
 * Keying on a normalized triple (from|to|weightBucket) lets the live demo
 * return in <100ms for the corridors we curate, while letting any
 * non-cached request fall through to a real Gemini call.
 *
 * Treat `routes` as opaque from this layer's POV — schema matches the
 * generateRoutes mutation output, but storing as Mixed avoids tight coupling
 * to that router's shape (so we don't have to write a migration every time
 * a leg field is added).
 */
const demoRouteCacheSchema = new Schema(
  {
    cacheKey: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    from: { type: String, required: true },
    to: { type: String, required: true },
    weightBucket: { type: Number, required: true },
    routes: {
      type: Schema.Types.Mixed,
      required: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { strict: false }
);

export type DemoRouteCacheDocument = InferSchemaType<typeof demoRouteCacheSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const DemoRouteCacheModel: Model<DemoRouteCacheDocument> =
  (mongoose.models.DemoRouteCache as Model<DemoRouteCacheDocument>) ||
  mongoose.model<DemoRouteCacheDocument>("DemoRouteCache", demoRouteCacheSchema);

/**
 * Bucket a raw weight (kg) to one of the seeded values. Anything within ~30%
 * of a bucket counts. Keep this tiny — the goal is "instant demo hit", not
 * "smart cache".
 */
export function bucketWeight(w: number): number {
  const buckets = [100, 500, 1000];
  let best = buckets[0];
  let bestDiff = Math.abs(w - best);
  for (const b of buckets) {
    const d = Math.abs(w - b);
    if (d < bestDiff) {
      best = b;
      bestDiff = d;
    }
  }
  return best;
}

/**
 * Normalize a city/country string so "Mumbai, India" and "  mumbai , india  "
 * resolve to the same cache entry.
 */
export function normalizeCity(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\s*,\s*/g, ",")
    .trim();
}

export function buildCacheKey(from: string, to: string, weight: number): string {
  return `${normalizeCity(from)}|${normalizeCity(to)}|${bucketWeight(weight)}`;
}

export default DemoRouteCacheModel;
