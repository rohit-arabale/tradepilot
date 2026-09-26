import { TRPCError } from "@trpc/server";
import mongoose from "mongoose";
import { z } from "zod";

import { requireUserId } from "../lib/auth.js";
import { TruckModel } from "../models/Truck.js";
import { FleetTripModel } from "../models/FleetTrip.js";
import { protectedProcedure, router } from "../trpc.js";
import { genai, FLASH_MODEL } from "../lib/genai.js";

// ---------------------------------------------------------------------------
// Seed data helpers
// ---------------------------------------------------------------------------

const DEMO_CITIES = [
  "Mumbai", "Delhi", "Bangalore", "Chennai", "Pune", "Kolkata",
  "Hyderabad", "Ahmedabad", "Jaipur", "Lucknow"
];

const DEMO_TRUCKS = [
  // Mumbai (5 trucks)
  { plate: "MH-04-AC-1234", capacityKg: 15000, baseCity: "Mumbai",    driverName: "Rahul Sharma",    phone: "98200-11001" },
  { plate: "MH-04-BZ-5678", capacityKg: 10000, baseCity: "Mumbai",    driverName: "Sanjay Patil",    phone: "98200-22002" },
  { plate: "MH-04-XP-2901", capacityKg: 8000,  baseCity: "Mumbai",    driverName: "Amit Singh",      phone: "98200-33003" },
  { plate: "MH-04-YQ-4012", capacityKg: 22000, baseCity: "Mumbai",    driverName: "Rajesh Kumar",    phone: "98200-44004" },
  { plate: "MH-04-ZR-5123", capacityKg: 12000, baseCity: "Mumbai",    driverName: "Vikram Patel",    phone: "98200-55005" },
  // Delhi (5 trucks)
  { plate: "DL-01-AA-9012", capacityKg: 20000, baseCity: "Delhi",     driverName: "Vikas Yadav",     phone: "98100-33003" },
  { plate: "DL-01-CB-3456", capacityKg: 8000,  baseCity: "Delhi",     driverName: "Mohan Gupta",     phone: "98100-44004" },
  { plate: "DL-01-DC-7834", capacityKg: 18000, baseCity: "Delhi",     driverName: "Harsh Verma",     phone: "98100-66006" },
  { plate: "DL-01-ED-9045", capacityKg: 25000, baseCity: "Delhi",     driverName: "Ashok Malhotra",  phone: "98100-77007" },
  { plate: "DL-01-FE-0156", capacityKg: 5000,  baseCity: "Delhi",     driverName: "Nitin Sharma",    phone: "98100-88008" },
  // Bangalore (5 trucks)
  { plate: "KA-05-MN-7890", capacityKg: 12000, baseCity: "Bangalore", driverName: "Kiran Kumar",     phone: "98440-55005" },
  { plate: "KA-05-PQ-2345", capacityKg: 25000, baseCity: "Bangalore", driverName: "Suresh Naidu",    phone: "98440-66006" },
  { plate: "KA-05-QR-3467", capacityKg: 10000, baseCity: "Bangalore", driverName: "Ramesh Reddy",    phone: "98440-99009" },
  { plate: "KA-05-RS-4578", capacityKg: 20000, baseCity: "Bangalore", driverName: "Arun Nair",       phone: "98440-10010" },
  { plate: "KA-05-ST-5689", capacityKg: 7000,  baseCity: "Bangalore", driverName: "Srinivas Rao",    phone: "98440-11011" },
  // Chennai (5 trucks)
  { plate: "TN-09-XY-6789", capacityKg: 18000, baseCity: "Chennai",   driverName: "Murugan Raja",    phone: "98410-77007" },
  { plate: "TN-09-ZA-0123", capacityKg: 30000, baseCity: "Chennai",   driverName: "Arjun Pillai",    phone: "98410-88008" },
  { plate: "TN-09-AB-1234", capacityKg: 15000, baseCity: "Chennai",   driverName: "Ravi Chandran",   phone: "98410-22022" },
  { plate: "TN-09-BC-2345", capacityKg: 22000, baseCity: "Chennai",   driverName: "Kumar Natarajan", phone: "98410-33033" },
  { plate: "TN-09-CD-3456", capacityKg: 9000,  baseCity: "Chennai",   driverName: "Bala Subramani",  phone: "98410-44044" },
  // Pune (5 trucks)
  { plate: "MH-12-CD-4567", capacityKg: 7000,  baseCity: "Pune",      driverName: "Prakash Desai",   phone: "98220-99009" },
  { plate: "MH-12-EF-8901", capacityKg: 16000, baseCity: "Pune",      driverName: "Nilesh Joshi",    phone: "98220-10010" },
  { plate: "MH-12-FG-0012", capacityKg: 13000, baseCity: "Pune",      driverName: "Shrikant Kulkarni",phone: "98220-55055" },
  { plate: "MH-12-GH-1123", capacityKg: 28000, baseCity: "Pune",      driverName: "Madhav Pawar",    phone: "98220-66066" },
  { plate: "MH-12-HI-2234", capacityKg: 11000, baseCity: "Pune",      driverName: "Sameer Sawant",   phone: "98220-77077" },
  // Kolkata (5 trucks)
  { plate: "WB-02-GH-2345", capacityKg: 22000, baseCity: "Kolkata",   driverName: "Debasis Bose",    phone: "98300-11011" },
  { plate: "WB-02-IJ-6789", capacityKg: 5000,  baseCity: "Kolkata",   driverName: "Suman Ghosh",     phone: "98300-22022" },
  { plate: "WB-02-JK-7890", capacityKg: 19000, baseCity: "Kolkata",   driverName: "Sourav Das",      phone: "98300-33033" },
  { plate: "WB-02-KL-8901", capacityKg: 24000, baseCity: "Kolkata",   driverName: "Arun Chatterjee", phone: "98300-44044" },
  { plate: "WB-02-LM-9012", capacityKg: 8000,  baseCity: "Kolkata",   driverName: "Ravi Banerjee",   phone: "98300-55055" },
  // Hyderabad (5 trucks)
  { plate: "TG-05-MN-0123", capacityKg: 14000, baseCity: "Hyderabad", driverName: "Sunil Rao",       phone: "98480-66066" },
  { plate: "TG-05-NO-1234", capacityKg: 26000, baseCity: "Hyderabad", driverName: "Ramakrishna",    phone: "98480-77077" },
  { plate: "TG-05-OP-2345", capacityKg: 11000, baseCity: "Hyderabad", driverName: "Manoj Verma",     phone: "98480-88088" },
  { plate: "TG-05-PQ-3456", capacityKg: 19000, baseCity: "Hyderabad", driverName: "Pawan Kumar",     phone: "98480-99099" },
  { plate: "TG-05-QR-4567", capacityKg: 6000,  baseCity: "Hyderabad", driverName: "Vinod Sinha",     phone: "98480-00100" },
  // Ahmedabad (5 trucks)
  { plate: "GJ-01-RS-5678", capacityKg: 17000, baseCity: "Ahmedabad", driverName: "Deepak Patel",    phone: "98260-11111" },
  { plate: "GJ-01-ST-6789", capacityKg: 23000, baseCity: "Ahmedabad", driverName: "Jayesh Joshi",    phone: "98260-22222" },
  { plate: "GJ-01-TU-7890", capacityKg: 9000,  baseCity: "Ahmedabad", driverName: "Rashid Khan",     phone: "98260-33333" },
  { plate: "GJ-01-UV-8901", capacityKg: 20000, baseCity: "Ahmedabad", driverName: "Hiren Solanki",   phone: "98260-44444" },
  { plate: "GJ-01-VW-9012", capacityKg: 12000, baseCity: "Ahmedabad", driverName: "Kalpesh Nair",    phone: "98260-55555" },
  // Jaipur (5 trucks)
  { plate: "RJ-02-WX-0123", capacityKg: 16000, baseCity: "Jaipur",    driverName: "Bhagwan Singh",   phone: "98290-66666" },
  { plate: "RJ-02-XY-1234", capacityKg: 21000, baseCity: "Jaipur",    driverName: "Rajesh Meena",    phone: "98290-77777" },
  { plate: "RJ-02-YZ-2345", capacityKg: 7000,  baseCity: "Jaipur",    driverName: "Vikram Singh",    phone: "98290-88888" },
  { plate: "RJ-02-ZA-3456", capacityKg: 24000, baseCity: "Jaipur",    driverName: "Mohan Lal",       phone: "98290-99999" },
  { plate: "RJ-02-AB-4567", capacityKg: 10000, baseCity: "Jaipur",    driverName: "Suresh Sharma",   phone: "98290-00000" },
  // Lucknow (5 trucks)
  { plate: "UP-02-BC-5678", capacityKg: 13000, baseCity: "Lucknow",   driverName: "Ravi Kumar",      phone: "98510-11111" },
  { plate: "UP-02-CD-6789", capacityKg: 27000, baseCity: "Lucknow",   driverName: "Arjun Verma",     phone: "98510-22222" },
  { plate: "UP-02-DE-7890", capacityKg: 8000,  baseCity: "Lucknow",   driverName: "Pramod Singh",    phone: "98510-33333" },
  { plate: "UP-02-EF-8901", capacityKg: 18000, baseCity: "Lucknow",   driverName: "Anuj Kumar",      phone: "98510-44444" },
  { plate: "UP-02-FG-9012", capacityKg: 11000, baseCity: "Lucknow",   driverName: "Shailendra Yadav",phone: "98510-55555" },
];

// Realistic city-pair distances (km)
const ROUTE_DISTANCES: Record<string, number> = {
  "Mumbai-Pune":       149,
  "Mumbai-Bangalore":  984,
  "Mumbai-Chennai":   1338,
  "Mumbai-Delhi":     1421,
  "Mumbai-Kolkata":   1967,
  "Mumbai-Hyderabad": 708,
  "Mumbai-Ahmedabad": 462,
  "Mumbai-Jaipur":    890,
  "Mumbai-Lucknow":   1313,
  "Delhi-Kolkata":    1472,
  "Delhi-Bangalore":  2150,
  "Delhi-Chennai":    2194,
  "Delhi-Hyderabad":  1577,
  "Delhi-Ahmedabad":  975,
  "Delhi-Jaipur":     240,
  "Delhi-Lucknow":    490,
  "Bangalore-Chennai":  346,
  "Bangalore-Kolkata": 1871,
  "Bangalore-Hyderabad": 567,
  "Bangalore-Ahmedabad": 1430,
  "Bangalore-Jaipur":  2020,
  "Bangalore-Lucknow": 2116,
  "Chennai-Kolkata":  1659,
  "Chennai-Hyderabad": 629,
  "Chennai-Ahmedabad": 1797,
  "Chennai-Jaipur":   2187,
  "Chennai-Lucknow":  2049,
  "Pune-Bangalore":    838,
  "Pune-Chennai":     1185,
  "Pune-Hyderabad":    683,
  "Pune-Ahmedabad":    547,
  "Pune-Jaipur":      1126,
  "Pune-Lucknow":     1355,
  "Kolkata-Hyderabad": 1372,
  "Kolkata-Ahmedabad": 1881,
  "Kolkata-Jaipur":   1719,
  "Kolkata-Lucknow":  1073,
  "Hyderabad-Ahmedabad": 1199,
  "Hyderabad-Jaipur": 1524,
  "Hyderabad-Lucknow": 1631,
  "Ahmedabad-Jaipur":  745,
  "Ahmedabad-Lucknow": 1428,
  "Jaipur-Lucknow":    975,
};

function routeDistance(a: string, b: string): number {
  return ROUTE_DISTANCES[`${a}-${b}`] ?? ROUTE_DISTANCES[`${b}-${a}`] ?? 600;
}

function isoDate(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

function rng(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function buildTrips(
  userId: mongoose.Types.ObjectId,
  truckId: mongoose.Types.ObjectId,
  capacityKg: number,
  baseCity: string,
  count: number,
) {
  const cities = DEMO_CITIES.filter((c) => c !== baseCity);
  const trips = [];

  for (let i = 0; i < count; i++) {
    const dest = cities[Math.floor(Math.random() * cities.length)];
    const dist = routeDistance(baseCity, dest);
    const payload = Math.round(rng(0.4, 0.95) * capacityKg);
    const durationHours = parseFloat((dist / rng(55, 70)).toFixed(1));
    const fuelCost = Math.round(dist * rng(3.2, 4.5));         // INR per km
    const onTime = Math.random() > 0.20;                         // ~80% on-time
    const daysAgo = Math.floor(rng(0, 60));                      // Spread across 60 days

    trips.push({
      userId,
      truckId,
      dateISO: isoDate(daysAgo),
      originCity: baseCity,
      destCity: dest,
      payloadKg: payload,
      distanceKm: dist,
      durationHours,
      fuelCost,
      onTime,
    });
  }

  return trips;
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const trucksRouter = router({
  /**
   * POST trucks.register
   */
  register: protectedProcedure
    .input(
      z.object({
        plate: z.string().min(1).max(20).trim(),
        capacityKg: z.number().positive().max(200000),
        baseCity: z.string().min(1).max(120).trim(),
        driverName: z.string().min(1).max(120).trim(),
        phone: z.string().max(30).trim().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = requireUserId(ctx);

      const truck = await TruckModel.create({
        userId,
        plate: input.plate,
        capacityKg: input.capacityKg,
        baseCity: input.baseCity,
        driverName: input.driverName,
        phone: input.phone ? input.phone : undefined,
      });

      return truck;
    }),

  /**
   * GET trucks.list
   */
  list: protectedProcedure
    .input(z.object({}).optional())
    .query(async ({ ctx }) => {
      const userId = requireUserId(ctx);

      const trucks = await TruckModel.find({ userId }).sort({ createdAt: -1 });

      return trucks;
    }),

  /**
   * DELETE trucks.remove
   */
  remove: protectedProcedure
    .input(z.object({ truckId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = requireUserId(ctx);

      if (!mongoose.Types.ObjectId.isValid(input.truckId)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid truckId format",
        });
      }

      const deleted = await TruckModel.findOneAndDelete({
        _id: new mongoose.Types.ObjectId(input.truckId),
        userId,
      });

      if (!deleted) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Truck not found or not authorized",
        });
      }

      // Also remove associated trips
      await FleetTripModel.deleteMany({ userId, truckId: new mongoose.Types.ObjectId(input.truckId) });

      return { ok: true };
    }),

  /**
   * POST trucks.seedDemoFleet
   * Idempotent: tops up to 50 demo trucks; generates 200+ historical trips (5-6 per truck).
   */
  seedDemoFleet: protectedProcedure
    .input(z.object({}).optional())
    .mutation(async ({ ctx }) => {
      const userId = requireUserId(ctx);

      const existing = await TruckModel.find({ userId }).select("_id plate").lean();
      const existingPlates = new Set(existing.map((t) => t.plate));

      // Only add if fewer than 40 trucks exist
      const shouldTopUp = existing.length < 40;
      let newTrucks: any[] = [];

      if (shouldTopUp) {
        const toCreate = DEMO_TRUCKS.filter((t) => !existingPlates.has(t.plate));
        newTrucks = toCreate.length > 0
          ? await TruckModel.insertMany(
              toCreate.map((t) => ({ ...t, userId })),
            )
          : [];
      }

      const allTrucks = [
        ...existing,
        ...newTrucks.map((t) => ({ _id: t._id, plate: t.plate })),
      ];

      // Build trips only for trucks that don't already have trips
      const trucksWithTrips = await FleetTripModel.distinct("truckId", { userId });
      const trucksWithTripsSet = new Set(trucksWithTrips.map(String));

      const allTruckDocs = await TruckModel.find({ userId }).lean();
      const truckMap = new Map(allTruckDocs.map((t) => [String(t._id), t]));

      type TripInput = {
        userId: mongoose.Types.ObjectId;
        truckId: mongoose.Types.ObjectId;
        dateISO: string;
        originCity: string;
        destCity: string;
        payloadKg: number;
        distanceKm: number;
        durationHours: number;
        fuelCost: number;
        onTime: boolean;
      };

      const tripDocs: TripInput[] = [];
      for (const t of allTrucks) {
        const idStr = String(t._id);
        if (trucksWithTripsSet.has(idStr)) continue;
        const doc = truckMap.get(idStr);
        if (!doc) continue;
        // 5-6 trips per truck → 200+ total for 40+ trucks
        const tripsForTruck = Math.floor(rng(5, 6.5));
        tripDocs.push(
          ...buildTrips(userId, t._id, doc.capacityKg, doc.baseCity, tripsForTruck),
        );
      }

      if (tripDocs.length > 0) {
        await FleetTripModel.insertMany(tripDocs);
      }

      return { trucksAdded: newTrucks.length, tripsAdded: tripDocs.length };
    }),

  /**
   * GET trucks.analytics
   * Returns per-truck utilization + fleet-wide KPIs.
   */
  analytics: protectedProcedure
    .input(z.object({}).optional())
    .query(async ({ ctx }) => {
      const userId = requireUserId(ctx);

      const [trucks, trips] = await Promise.all([
        TruckModel.find({ userId }).lean(),
        FleetTripModel.find({ userId }).lean(),
      ]);

      if (trucks.length === 0) {
        return {
          perTruck: [] as {
            truckId: string;
            plate: string;
            baseCity: string;
            totalTrips: number;
            utilizationPct: number;
            onTimeRate: number;
          }[],
          fleet: {
            avgUtilizationPct: 0,
            onTimePct: 0,
            totalFuelLastWeek: 0,
            maintenanceFlags: 0,
          },
        };
      }

      // Group trips by truckId
      const tripsByTruck = new Map<string, typeof trips>();
      for (const trip of trips) {
        const key = String(trip.truckId);
        if (!tripsByTruck.has(key)) tripsByTruck.set(key, []);
        tripsByTruck.get(key)!.push(trip);
      }

      // Last 7 days fence
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const fenceISO = sevenDaysAgo.toISOString().slice(0, 10);

      let totalFuelLastWeek = 0;
      let maintenanceFlags = 0;

      const perTruck = trucks.map((truck) => {
        const truckTrips = tripsByTruck.get(String(truck._id)) ?? [];
        const totalTrips = truckTrips.length;

        // Utilization: average payload / capacity across all trips
        const utilizationPct =
          totalTrips === 0
            ? 0
            : Math.min(
                100,
                Math.round(
                  (truckTrips.reduce((s, t) => s + t.payloadKg, 0) /
                    (totalTrips * truck.capacityKg)) *
                    100,
                ),
              );

        const onTimeCount = truckTrips.filter((t) => t.onTime).length;
        const onTimeRate = totalTrips === 0 ? 100 : Math.round((onTimeCount / totalTrips) * 100);

        // Fleet-wide aggregations
        for (const trip of truckTrips) {
          if (trip.dateISO >= fenceISO) {
            totalFuelLastWeek += trip.fuelCost;
          }
        }

        // Maintenance flag: >20 trips without a service interval (heuristic)
        if (totalTrips > 20) maintenanceFlags += 1;

        return {
          truckId: String(truck._id),
          plate: truck.plate,
          baseCity: truck.baseCity,
          totalTrips,
          utilizationPct,
          onTimeRate,
        };
      });

      const trucksWithTripsData = perTruck.filter((t) => t.totalTrips > 0);
      const avgUtilizationPct =
        trucksWithTripsData.length === 0
          ? 0
          : Math.round(
              trucksWithTripsData.reduce((s, t) => s + t.utilizationPct, 0) /
                trucksWithTripsData.length,
            );

      const allTripsCount = trips.length;
      const onTimeCount = trips.filter((t) => t.onTime).length;
      const onTimePct =
        allTripsCount === 0 ? 100 : Math.round((onTimeCount / allTripsCount) * 100);

      return {
        perTruck,
        fleet: {
          avgUtilizationPct,
          onTimePct,
          totalFuelLastWeek: Math.round(totalFuelLastWeek),
          maintenanceFlags,
        },
      };
    }),

  /**
   * POST trucks.askAI
   * Input: a question about fleet analytics.
   * Output: 2-4 bullet-point insights + 1 concrete recommendation.
   */
  askAI: protectedProcedure
    .input(z.object({ question: z.string().min(1).max(500) }))
    .mutation(async ({ ctx, input }) => {
      const userId = requireUserId(ctx);

      // Fetch user's trucks and trips (last 60 days)
      const [trucks, allTrips] = await Promise.all([
        TruckModel.find({ userId }).lean(),
        FleetTripModel.find({ userId }).lean(),
      ]);

      if (trucks.length === 0) {
        return {
          bullets: ["No truck data available yet. Register vehicles to get insights."],
          recommendation: "Start by seeding demo data or registering your first vehicle.",
        };
      }

      const sixtyDaysAgo = new Date();
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
      const fenceISO = sixtyDaysAgo.toISOString().slice(0, 10);
      const trips = allTrips.filter((t) => t.dateISO >= fenceISO);

      // Compute per-truck summary
      const tripsByTruck = new Map<string, typeof trips>();
      for (const trip of trips) {
        const key = String(trip.truckId);
        if (!tripsByTruck.has(key)) tripsByTruck.set(key, []);
        tripsByTruck.get(key)!.push(trip);
      }

      const truckSummaries = trucks.map((truck) => {
        const truckTrips = tripsByTruck.get(String(truck._id)) ?? [];
        const totalTrips = truckTrips.length;
        const totalPayload = truckTrips.reduce((s, t) => s + t.payloadKg, 0);
        const totalFuel = truckTrips.reduce((s, t) => s + t.fuelCost, 0);
        const totalKm = truckTrips.reduce((s, t) => s + t.distanceKm, 0);
        const onTimeCount = truckTrips.filter((t) => t.onTime).length;
        const utilization =
          totalTrips === 0
            ? 0
            : Math.min(100, Math.round((totalPayload / (totalTrips * truck.capacityKg)) * 100));
        const onTimeRate = totalTrips === 0 ? 100 : Math.round((onTimeCount / totalTrips) * 100);
        const fuelPerKm = totalKm > 0 ? Math.round(totalFuel / totalKm) : 0;

        return {
          plate: truck.plate,
          baseCity: truck.baseCity,
          capacity: truck.capacityKg,
          trips: totalTrips,
          utilization,
          onTimeRate,
          fuelPerKm,
        };
      });

      // Fleet aggregates
      const fleetTrips = trips.length;
      const fleetOnTime = trips.filter((t) => t.onTime).length;
      const fleetOnTimePct = fleetTrips > 0 ? Math.round((fleetOnTime / fleetTrips) * 100) : 100;
      const fleetFuel = trips.reduce((s, t) => s + t.fuelCost, 0);
      const fleetKm = trips.reduce((s, t) => s + t.distanceKm, 0);
      const fleetFuelPerKm = fleetKm > 0 ? Math.round(fleetFuel / fleetKm) : 0;

      const summaryJson = JSON.stringify({
        trucks: truckSummaries,
        fleet: {
          totalTrips: fleetTrips,
          onTimeRate: fleetOnTimePct,
          totalFuelCost: fleetFuel,
          totalKm: fleetKm,
          fuelPerKm: fleetFuelPerKm,
        },
        period: "last 60 days",
      });

      const prompt = `You are a fleet logistics analyst. Analyze this fleet data and answer the user's question.

Fleet data (JSON):
${summaryJson}

User question: ${input.question}

Provide your response in exactly this JSON format:
{
  "bullets": ["insight 1", "insight 2", "insight 3"],
  "recommendation": "one concrete actionable recommendation"
}

Keep bullets concise (1 sentence each). Recommendation should be specific and actionable.`;

      try {
        const response = await genai().models.generateContent({
          model: FLASH_MODEL,
          contents: [{ role: "user", parts: [{ text: prompt }] }],
        });

        const responseText = response.text || "";
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          return {
            bullets: ["Unable to parse AI response."],
            recommendation: "Try asking a more specific question.",
          };
        }

        const parsed = JSON.parse(jsonMatch[0]);
        const bullets = Array.isArray(parsed.bullets) ? parsed.bullets.slice(0, 4) : [];
        const recommendation = typeof parsed.recommendation === "string" ? parsed.recommendation : "";

        if (bullets.length === 0 || !recommendation) {
          return {
            bullets: bullets.length > 0 ? bullets : ["Analysis completed."],
            recommendation: recommendation || "Review your fleet metrics above.",
          };
        }

        return { bullets, recommendation };
      } catch (err) {
        const errMsg = (err as Error)?.message ?? "unknown";
        return {
          bullets: [`AI analysis error: ${errMsg.slice(0, 50)}`],
          recommendation: "Please try again or check your fleet data.",
        };
      }
    }),
});
