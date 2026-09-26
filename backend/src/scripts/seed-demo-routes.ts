/**
 * seed-demo-routes.ts
 *
 * Pre-warms the DemoRouteCache for the headline corridors used in the live
 * demo. Calls runGenerateRoutes (the real Gemini path) once per
 * (from, to, weightBucket) tuple and stores the response keyed for
 * <100ms hits at demo time.
 *
 * Run via:  npm --workspace=backend run seed:demo-routes
 *           # or from inside backend/:  npm run seed:demo-routes
 *
 * Idempotent: upserts on cacheKey, so re-running just refreshes the cache.
 */

// Load .env before any module that reads process.env at import time.
import "dotenv/config";
import dotenv from "dotenv";
import mongoose from "mongoose";

import { connectMongoDB } from "../lib/db.js";
import { runGenerateRoutes } from "../routers/logistics.js";
import {
  DemoRouteCacheModel,
  buildCacheKey,
  bucketWeight,
} from "../models/DemoRouteCache.js";

dotenv.config();

const CORRIDORS: Array<{ from: string; to: string }> = [
  // International headline corridors
  { from: "Mumbai, India", to: "Rotterdam, Netherlands" },
  { from: "Shanghai, China", to: "Los Angeles, USA" },
  { from: "Delhi, India", to: "Frankfurt, Germany" },
  { from: "Singapore", to: "Hamburg, Germany" },
  { from: "Dubai, UAE", to: "New York, USA" },

  // India domestic — Golden Quadrilateral + busiest freight arteries
  { from: "Delhi, India", to: "Mumbai, India" },
  { from: "Mumbai, India", to: "Delhi, India" },
  { from: "Mumbai, India", to: "Bengaluru, India" },
  { from: "Mumbai, India", to: "Chennai, India" },
  { from: "Delhi, India", to: "Kolkata, India" },
  { from: "Chennai, India", to: "Bengaluru, India" },
  { from: "Delhi, India", to: "Bengaluru, India" },
  { from: "Mumbai, India", to: "Ahmedabad, India" },
  { from: "Mumbai, India", to: "Pune, India" },
  { from: "Hyderabad, India", to: "Mumbai, India" },
  { from: "Kolkata, India", to: "Chennai, India" },
];

const WEIGHT_BUCKETS = [100, 500, 1000];

async function main(): Promise<void> {
  await connectMongoDB();

  console.log(`[seed] Pre-warming ${CORRIDORS.length * WEIGHT_BUCKETS.length} cache entries…`);

  let ok = 0;
  let skipped = 0;
  let failed = 0;

  for (const corridor of CORRIDORS) {
    for (const weight of WEIGHT_BUCKETS) {
      const key = buildCacheKey(corridor.from, corridor.to, weight);
      const existing = await DemoRouteCacheModel.findOne({ cacheKey: key }).lean();
      if (existing) {
        skipped++;
        console.log(`[seed] skip  ${key}  (already cached)`);
        continue;
      }

      try {
        console.log(`[seed] gen   ${key}`);
        const t0 = Date.now();
        const routes = await runGenerateRoutes({
          from: corridor.from,
          to: corridor.to,
          description: "General cargo",
          package: {
            quantity: 1,
            weight,
            height: 50,
            length: 50,
            width: 50,
          },
        });

        await DemoRouteCacheModel.updateOne(
          { cacheKey: key },
          {
            $set: {
              cacheKey: key,
              from: corridor.from,
              to: corridor.to,
              weightBucket: bucketWeight(weight),
              routes,
              createdAt: new Date(),
            },
          },
          { upsert: true }
        );

        const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
        console.log(`[seed] ok    ${key}  (${routes.length} routes in ${elapsed}s)`);
        ok++;
      } catch (err) {
        failed++;
        console.error(`[seed] fail  ${key}:`, (err as Error).message);
      }
    }
  }

  console.log(`[seed] done. ok=${ok} skipped=${skipped} failed=${failed}`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("[seed] fatal:", err);
  process.exit(1);
});
