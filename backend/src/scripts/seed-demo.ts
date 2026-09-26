// Load .env before any module that reads process.env at import time.
import "dotenv/config";
import dotenv from "dotenv";
import mongoose from "mongoose";
import bcrypt from "bcrypt";

import connectMongoDB from "../lib/db.js";

import { UserModel } from "../models/User.js";
import { DraftModel } from "../models/Draft.js";
import { SaveRouteModel } from "../models/SaveRoute.js";
import { ProductAnalysisModel } from "../models/ProductAnalysis.js";
import { BoxCountResultModel } from "../models/BoxCountResult.js";
import { WeightCheckModel } from "../models/WeightCheck.js";
import { RfidScanResultModel } from "../models/RfidScanResult.js";
import { ShipmentDiffModel } from "../models/ShipmentDiff.js";
import { ComplianceRecordModel } from "../models/ComplianceRecord.js";
import { AnomalyReportModel } from "../models/AnomalyReport.js";
import { AuditEventModel } from "../models/AuditEvent.js";
import { LoadOfferModel } from "../models/LoadOffer.js";
import { TruckModel } from "../models/Truck.js";
import { TrackingPingModel } from "../models/TrackingPing.js";

dotenv.config();

const DEMO_EMAIL = "demo@gmail.com";
const DEMO_PASSWORD = "abc123";

const PER_MODEL = 10;
const DAYS = 24 * 60 * 60 * 1000;

// Repeatable pseudo-random — seed scripts must be deterministic so two runs
// against the same DB produce the same demo baseline.
let rngSeed = 0xc0ffee;
function rand(): number {
  rngSeed = (rngSeed * 1664525 + 1013904223) >>> 0;
  return rngSeed / 0xffffffff;
}
function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(rand() * arr.length)]!;
}
function range(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i);
}
function daysAgo(n: number): Date {
  return new Date(Date.now() - n * DAYS);
}

// ---------------------------------------------------------------------------
// Reference data — short, realistic-looking values
// ---------------------------------------------------------------------------

const PRODUCTS = [
  "Industrial coffee beans, vacuum-sealed",
  "Cold-rolled steel coils, grade A",
  "Lithium-ion battery cells, 21700",
  "Organic cotton textiles, woven",
  "Solar PV modules, 540W bifacial",
  "Medical-grade nitrile gloves",
  "Espresso machines, commercial",
  "Ceramic kitchen tiles, 60x60",
  "Lab reagents, refrigerated",
  "Bicycle frames, aluminum 7005",
];

const ROUTES = [
  { from: "Shanghai", to: "Hamburg", origin: "CN", dest: "DE", port1: "Shanghai", port2: "Hamburg", weight: 12500 },
  { from: "Mumbai", to: "Rotterdam", origin: "IN", dest: "NL", port1: "Nhava Sheva", port2: "Rotterdam", weight: 8400 },
  { from: "Los Angeles", to: "Yokohama", origin: "US", dest: "JP", port1: "Long Beach", port2: "Yokohama", weight: 6200 },
  { from: "Hong Kong", to: "Long Beach", origin: "HK", dest: "US", port1: "Hong Kong", port2: "Long Beach", weight: 9700 },
  { from: "Antwerp", to: "New York", origin: "BE", dest: "US", port1: "Antwerp", port2: "Port Newark", weight: 5300 },
  { from: "Singapore", to: "Dubai", origin: "SG", dest: "AE", port1: "Singapore", port2: "Jebel Ali", weight: 11200 },
  { from: "Busan", to: "Seattle", origin: "KR", dest: "US", port1: "Busan", port2: "Tacoma", weight: 7800 },
  { from: "Vancouver", to: "Tokyo", origin: "CA", dest: "JP", port1: "Vancouver", port2: "Tokyo", weight: 4900 },
  { from: "Genoa", to: "Casablanca", origin: "IT", dest: "MA", port1: "Genoa", port2: "Casablanca", weight: 3600 },
  { from: "Felixstowe", to: "Halifax", origin: "GB", dest: "CA", port1: "Felixstowe", port2: "Halifax", weight: 6800 },
];

const HS_CODES = [
  "0901.21", "7208.39", "8507.60", "5208.42", "8541.43",
  "4015.19", "8516.71", "6907.40", "3822.00", "8714.91",
];

const INCOTERMS = ["FOB", "CIF", "EXW", "DAP", "DDP"];
const TRANSPORT = ["Sea Freight", "Air Freight", "Sea Freight", "Sea Freight", "Land Freight"];

const COMPANIES = [
  "Pacific Trade Holdings Ltd.",
  "Northbridge Logistics GmbH",
  "Greenfield Imports B.V.",
  "Apex Maritime Co.",
  "Cascade Freight Inc.",
];

const DRIVER_NAMES = [
  "Marcus Chen", "Priya Nair", "Aiko Tanaka", "Diego Rivera", "Sofia Lindqvist",
  "Omar Al-Sayed", "Lukas Weber", "Mei Wong", "Tomas Novak", "Anna Kowalski",
];

const CITIES = [
  "Hamburg", "Rotterdam", "Antwerp", "Marseille", "Genoa",
  "Singapore", "Hong Kong", "Shanghai", "Mumbai", "Dubai",
];

const NEWS_HEADLINES = [
  { title: "Red Sea attacks reroute 12% of global container traffic", source: "Lloyd's List" },
  { title: "EU CBAM transitional reporting deadline tightened for 2026", source: "Reuters" },
  { title: "Port of Long Beach posts record monthly throughput", source: "JOC" },
  { title: "China extends export tax rebate for solar PV modules", source: "Bloomberg" },
  { title: "IMO 2026 sulfur cap drives shift to LNG bunkering", source: "TradeWinds" },
];

// ---------------------------------------------------------------------------
// Builders — one per model
// ---------------------------------------------------------------------------

function buildDraft(userId: mongoose.Types.ObjectId, i: number) {
  const route = ROUTES[i % ROUTES.length]!;
  const hs = HS_CODES[i % HS_CODES.length]!;
  const product = PRODUCTS[i % PRODUCTS.length]!;
  const incoterm = pick(INCOTERMS);
  const transport = pick(TRANSPORT);
  const company = pick(COMPANIES);
  const value = 25_000 + Math.floor(rand() * 200_000);

  return {
    userId,
    formData: {
      ShipmentDetails: {
        "Origin Country": route.origin,
        "Destination Country": route.dest,
        "HS Code": hs,
        "Product Description": product,
        Quantity: String(50 + Math.floor(rand() * 400)),
        "Gross Weight": String(route.weight),
      },
      TradeAndRegulatoryDetails: {
        "Incoterms 2020": incoterm,
        "Declared Value": { currency: "USD", amount: String(value) },
        "Currency of Transaction": "USD",
        "Trade Agreement Claimed": pick(["RCEP", "USMCA", "EU-Korea FTA", "CPTPP", "—"]),
        "Dual-Use Goods": "No",
        "Hazardous Material": i % 7 === 0 ? "Yes" : "No",
        Perishable: i % 5 === 0 ? "Yes" : "No",
      },
      PartiesAndIdentifiers: {
        "Shipper/Exporter": company,
        "Consignee/Importer": pick(COMPANIES),
        "Manufacturer Information": pick(COMPANIES),
        "EORI/Tax ID": `EORI${1000000 + Math.floor(rand() * 9000000)}`,
      },
      LogisticsAndHandling: {
        "Means of Transport": transport,
        "Port of Loading": route.port1,
        "Port of Discharge": route.port2,
        "Special Handling": pick(["Fragile", "Stack ≤ 3", "Keep dry", "None"]),
        "Temperature Requirements": pick(["Ambient", "2–8 °C", "−18 °C", "Ambient"]),
      },
      DocumentVerification: {
        "Commercial Invoice": {
          checked: true,
          subItems: {
            "Invoice number present": true,
            "Details match shipment": true,
            "Customs compliant": i % 3 !== 0,
          },
        },
        "Packing List": {
          checked: true,
          subItems: {
            "Contents accurate": true,
            "Quantities match": true,
            "Matches invoice": true,
          },
        },
        "Certificate of Origin": {
          checked: i % 2 === 0,
          subItems: {
            "Origin verified": i % 2 === 0,
            "Trade agreement compliant": i % 2 === 0,
          },
        },
        "Licenses/Permits": {
          checked: i % 4 !== 0,
          subItems: {
            "Valid number": i % 4 !== 0,
            "Not expired": true,
            "Authority verified": i % 4 !== 0,
          },
        },
        "Bill of Lading": {
          checked: true,
          subItems: {
            "Accurate details": true,
            "Shipping regulations compliant": true,
          },
        },
      },
      IntendedUseDetails: {
        "Intended Use": pick([
          "Wholesale distribution",
          "Manufacturing input",
          "Retail resale",
          "R&D / sampling",
        ]),
      },
    },
    routeData: {
      totalDistance: 4_000 + Math.floor(rand() * 14_000),
      distanceByLeg: [1200, 6800, 2400].map((n) => n + Math.floor(rand() * 400)),
      routeDirections: [
        { id: "leg-1", state: "land", waypoints: [route.from, route.port1], distance: 1200 },
        { id: "leg-2", state: "sea", waypoints: [route.port1, route.port2], distance: 6800 },
        { id: "leg-3", state: "land", waypoints: [route.port2, route.to], distance: 2400 },
      ],
    },
    mapData: {
      origin: { lat: 31.2304 + (rand() - 0.5) * 20, lng: 121.4737 + (rand() - 0.5) * 60 },
      destination: { lat: 53.5511 + (rand() - 0.5) * 10, lng: 9.9937 + (rand() - 0.5) * 30 },
    },
    statuses: {
      compliance: pick(["pending", "passed", "review"]),
      routeOptimization: pick(["pending", "optimized"]),
    },
    timestamp: daysAgo(i * 2 + 1),
  };
}

function buildSaveRoute(userId: mongoose.Types.ObjectId, i: number) {
  const route = ROUTES[i % ROUTES.length]!;
  return {
    userId,
    formData: {
      from: route.from,
      to: route.to,
      weight: route.weight,
    },
    routeData: {
      totalDistance: 4_000 + Math.floor(rand() * 14_000),
      distanceByLeg: [1200, 6800, 2400],
      routeDirections: [
        { id: "leg-1", state: "land", waypoints: [route.from, route.port1], distance: 1200 },
        { id: "leg-2", state: "sea", waypoints: [route.port1, route.port2], distance: 6800 },
        { id: "leg-3", state: "land", waypoints: [route.port2, route.to], distance: 2400 },
      ],
      carbonKg: 800 + Math.floor(rand() * 3200),
    },
    timestamp: daysAgo(i * 3 + 1),
  };
}

function buildProductAnalysis(userId: mongoose.Types.ObjectId, i: number) {
  const product = PRODUCTS[i % PRODUCTS.length]!;
  return {
    userId,
    imageDetails: {
      bucketName: "tradepilot-uploads",
      fileName: `demo-product-${i + 1}.jpg`,
      mimeType: "image/jpeg",
      signedUrl: `https://storage.googleapis.com/demo/sample-${i + 1}.jpg`,
    },
    visionResponse: {
      labels: ["Box", "Package", "Cargo", "Shipping container"],
      text: product,
      confidence: 0.85 + rand() * 0.13,
    },
    geminiResponse: {
      summary: `${product} — packaging intact, labels legible, no visible damage.`,
      classification: "compliant",
      hsCodeSuggestion: HS_CODES[i % HS_CODES.length]!,
    },
    timestamp: daysAgo(i + 1),
  };
}

function buildBoxCount(
  userId: mongoose.Types.ObjectId,
  draftId: string,
  i: number,
) {
  const declared = 20 + Math.floor(rand() * 80);
  const mismatch = i % 4 === 0;
  const detected = mismatch ? declared - (1 + Math.floor(rand() * 3)) : declared;
  const diffPct = ((Math.abs(declared - detected) / declared) * 100);
  return {
    userId,
    draftId,
    declaredCount: declared,
    detectedCount: detected,
    mismatch,
    mismatchPct: Number(diffPct.toFixed(2)),
    confidence: Number((0.82 + rand() * 0.16).toFixed(2)),
    notes: mismatch
      ? "Camera count under manifest — investigate before release."
      : "All boxes accounted for.",
    createdAt: daysAgo(i + 1),
  };
}

function buildWeightCheck(
  userId: mongoose.Types.ObjectId,
  draftId: string,
  i: number,
) {
  const declared = 800 + Math.floor(rand() * 4_000);
  const flagged = i % 5 === 0;
  const dev = flagged ? declared * (0.05 + rand() * 0.05) : declared * (rand() * 0.015);
  const measured = declared + (i % 2 === 0 ? dev : -dev);
  return {
    userId,
    draftId,
    declaredWeightKg: declared,
    measuredWeightKg: Number(measured.toFixed(1)),
    deviationKg: Number(Math.abs(declared - measured).toFixed(1)),
    deviationPct: Number((Math.abs(declared - measured) / declared * 100).toFixed(2)),
    thresholdPct: 3,
    flagged,
    createdAt: daysAgo(i + 1),
  };
}

function buildRfid(
  userId: mongoose.Types.ObjectId,
  draftId: string,
  i: number,
) {
  const total = 12;
  const manifest = range(total).map((n) => `TAG-${(i + 1) * 1000 + n}`);
  const missingN = i % 3 === 0 ? 1 : 0;
  const extraN = i % 4 === 0 ? 1 : 0;
  const scanned = [...manifest.slice(0, total - missingN)];
  for (let e = 0; e < extraN; e++) scanned.push(`TAG-EXTRA-${e}-${i}`);
  const matched = manifest.filter((t) => scanned.includes(t));
  const missing = manifest.filter((t) => !scanned.includes(t));
  const extra = scanned.filter((t) => !manifest.includes(t));
  return {
    userId,
    draftId,
    manifestTags: manifest,
    scannedTags: scanned,
    matched,
    missing,
    extra,
    matchPct: Number(((matched.length / manifest.length) * 100).toFixed(1)),
    createdAt: daysAgo(i + 1),
  };
}

function buildShipmentDiff(
  userId: mongoose.Types.ObjectId,
  draftId: string,
  i: number,
) {
  const risk = i % 5 === 0 ? 60 + Math.floor(rand() * 30) : 8 + Math.floor(rand() * 22);
  return {
    userId,
    draftId,
    riskScore: risk,
    tamperingProbability: Number((risk / 100).toFixed(2)),
    missingItems: risk > 40 ? ["1× outer carton", "Tamper seal on pallet 3"] : [],
    damageDescription:
      risk > 40
        ? "Pallet 3 outer film torn; one carton crushed on top layer."
        : "No visible damage; seals intact.",
    summary:
      risk > 40
        ? "Elevated tamper risk — escalate to inspection team before clearing."
        : "Shipment matches manifest; safe to release.",
    createdAt: daysAgo(i + 1),
  };
}

function buildCompliance(userId: mongoose.Types.ObjectId, draftId: string, i: number) {
  const status = pick(["compliant", "review", "compliant", "non-compliant"]);
  return {
    userId,
    formData: { draftId, hsCode: HS_CODES[i % HS_CODES.length]! },
    complianceResponse: {
      status,
      score: status === "compliant" ? 92 + Math.floor(rand() * 8) : 55 + Math.floor(rand() * 25),
      flags:
        status === "non-compliant"
          ? ["Missing Certificate of Origin", "EORI format invalid"]
          : status === "review"
          ? ["License expiry within 14 days"]
          : [],
      summary:
        status === "compliant"
          ? "All checks passed against destination customs requirements."
          : "Resolve flagged items before submission.",
    },
    type: pick(["form", "csv"]),
    timestamp: daysAgo(i + 1),
  };
}

function buildAnomaly(userId: mongoose.Types.ObjectId, draftId: string, i: number) {
  const severity = pick(["low", "medium", "high"] as const);
  const declared = 1_000 + Math.floor(rand() * 4_000);
  const measured = declared + (severity === "high" ? declared * 0.08 : declared * 0.01);
  const declaredCount = 40 + Math.floor(rand() * 60);
  const detectedCount = severity === "high" ? declaredCount - 4 : declaredCount;
  return {
    userId,
    draftId,
    declaredWeightKg: declared,
    measuredWeightKg: Number(measured.toFixed(1)),
    declaredCount,
    detectedCount,
    originCity: pick(CITIES),
    destinationCity: pick(CITIES),
    routeDeviationKm: severity === "high" ? 90 + Math.floor(rand() * 60) : Math.floor(rand() * 8),
    flags:
      severity === "high"
        ? ["weight-mismatch", "count-mismatch", "route-deviation"]
        : severity === "medium"
        ? ["weight-mismatch"]
        : [],
    severity,
    riskScore:
      severity === "high" ? 70 + Math.floor(rand() * 25) : severity === "medium" ? 40 + Math.floor(rand() * 20) : 5 + Math.floor(rand() * 15),
    summary:
      severity === "high"
        ? "Multi-signal anomaly — weight, count, and route all diverge."
        : severity === "medium"
        ? "Mild weight discrepancy detected at midpoint scale."
        : "Within normal operating envelope.",
    createdAt: daysAgo(i + 1),
  };
}

function buildAudit(userId: mongoose.Types.ObjectId, draftId: string, i: number) {
  const types = [
    { eventType: "draft.created", summary: "Draft created from blank manifest." },
    { eventType: "compliance.passed", summary: "Compliance check passed all customs gates." },
    { eventType: "route.optimized", summary: "Route optimized — 320 km saved vs baseline." },
    { eventType: "inspection.boxcount", summary: "Box count inspection saved — no mismatch." },
    { eventType: "inspection.weight", summary: "Weight check within 2% threshold." },
    { eventType: "inspection.rfid", summary: "RFID scan: 12/12 tags matched." },
    { eventType: "inspection.diff", summary: "Tamper diff clean — no risk flags." },
    { eventType: "shipment.released", summary: "Shipment released to carrier." },
    { eventType: "anomaly.flagged", summary: "Anomaly detector raised a medium-severity flag." },
    { eventType: "report.exported", summary: "Export report PDF generated." },
  ];
  const ev = types[i % types.length]!;
  return {
    userId,
    draftId,
    eventType: ev.eventType,
    summary: ev.summary,
    payload: { i },
    clientToken: `seed-${i}-${ev.eventType}`,
    createdAt: daysAgo(i * 0.5 + 0.5),
  };
}

function buildLoadOffer(userId: mongoose.Types.ObjectId, i: number) {
  const route = ROUTES[i % ROUTES.length]!;
  return {
    userId,
    originCity: route.from,
    destinationCity: route.to,
    weightKg: route.weight + Math.floor(rand() * 500),
    pickupDate: new Date(Date.now() + (i + 1) * DAYS),
    status: pick(["open", "open", "open", "matched", "cancelled"] as const),
    notes: pick([
      "Forklift required at destination.",
      "Bonded warehouse handling needed.",
      "Refrigerated trailer mandatory.",
      "Standard dry-van OK.",
    ]),
    createdAt: daysAgo(i + 1),
  };
}

function buildTruck(userId: mongoose.Types.ObjectId, i: number) {
  return {
    userId,
    plate: `D${100 + i}-${String.fromCharCode(65 + (i % 26))}${String.fromCharCode(65 + ((i * 3) % 26))}${100 + i * 7}`,
    capacityKg: 12_000 + i * 1500,
    baseCity: pick(CITIES),
    driverName: DRIVER_NAMES[i % DRIVER_NAMES.length]!,
    phone: `+1-555-${String(1000 + i * 37).padStart(4, "0")}`,
    createdAt: daysAgo(i + 1),
  };
}

function buildTrackingPing(
  userId: mongoose.Types.ObjectId,
  draftId: string,
  i: number,
  k: number,
) {
  // k = ping index along the route (0..3), giving a small movement trail.
  const progress = k / 3;
  const startLat = 31.23;
  const startLng = 121.47;
  const endLat = 53.55;
  const endLng = 9.99;
  return {
    userId,
    draftId,
    lat: startLat + (endLat - startLat) * progress + (rand() - 0.5) * 0.4,
    lng: startLng + (endLng - startLng) * progress + (rand() - 0.5) * 0.4,
    speedKmh: 35 + Math.floor(rand() * 45),
    destinationLat: endLat,
    destinationLng: endLng,
    distanceKm: Math.round((1 - progress) * 9_200),
    etaMinutes: Math.round((1 - progress) * 14_400),
    createdAt: daysAgo(i + (3 - k) * 0.25),
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("[seed] Connecting to MongoDB…");
  await connectMongoDB();
  console.log("[seed] Connected.\n");

  // ---- 1. Upsert demo user -------------------------------------------------
  console.log(`[seed] Upserting demo user (${DEMO_EMAIL})…`);
  const hashedPassword = await bcrypt.hash(DEMO_PASSWORD, 10);
  const user = await UserModel.findOneAndUpdate(
    { emailAddress: DEMO_EMAIL },
    {
      $set: {
        firstName: "Demo",
        lastName: "Operator",
        emailAddress: DEMO_EMAIL,
        password: hashedPassword,
        phoneNumber: "+1-555-0100",
        companyName: "Pacific Trade Holdings Ltd.",
        companyAddress: {
          street: "120 Harbor Way",
          city: "Long Beach",
          state: "CA",
          postalCode: "90802",
          country: "United States",
        },
        taxId: "EIN-88-1234567",
        businessType: "Freight forwarder",
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  const userId = user._id;
  console.log(`[seed]   user._id = ${userId}\n`);

  // ---- 2. Wipe existing demo data -----------------------------------------
  console.log("[seed] Wiping existing demo records…");
  const wipeResults = await Promise.all([
    DraftModel.deleteMany({ userId }),
    SaveRouteModel.deleteMany({ userId }),
    ProductAnalysisModel.deleteMany({ userId }),
    BoxCountResultModel.deleteMany({ userId }),
    WeightCheckModel.deleteMany({ userId }),
    RfidScanResultModel.deleteMany({ userId }),
    ShipmentDiffModel.deleteMany({ userId }),
    ComplianceRecordModel.deleteMany({ userId }),
    AnomalyReportModel.deleteMany({ userId }),
    AuditEventModel.deleteMany({ userId }),
    LoadOfferModel.deleteMany({ userId }),
    TruckModel.deleteMany({ userId }),
    TrackingPingModel.deleteMany({ userId }),
  ]);
  const totalDeleted = wipeResults.reduce((sum, r) => sum + r.deletedCount, 0);
  console.log(`[seed]   removed ${totalDeleted} records\n`);

  // ---- 3. Drafts (the spine other collections reference) -------------------
  console.log(`[seed] Seeding ${PER_MODEL} drafts…`);
  const drafts = await DraftModel.insertMany(
    range(PER_MODEL).map((i) => buildDraft(userId, i)),
  );
  const draftIds = drafts.map((d) => String(d._id));
  console.log(`[seed]   ${drafts.length} drafts inserted\n`);

  // ---- 4. Per-draft verification records ----------------------------------
  console.log("[seed] Seeding verification records (box count, weight, rfid, diff)…");
  await Promise.all([
    BoxCountResultModel.insertMany(
      draftIds.map((id, i) => buildBoxCount(userId, id, i)),
    ),
    WeightCheckModel.insertMany(
      draftIds.map((id, i) => buildWeightCheck(userId, id, i)),
    ),
    RfidScanResultModel.insertMany(
      draftIds.map((id, i) => buildRfid(userId, id, i)),
    ),
    ShipmentDiffModel.insertMany(
      draftIds.map((id, i) => buildShipmentDiff(userId, id, i)),
    ),
    ComplianceRecordModel.insertMany(
      draftIds.map((id, i) => buildCompliance(userId, id, i)),
    ),
    AnomalyReportModel.insertMany(
      draftIds.map((id, i) => buildAnomaly(userId, id, i)),
    ),
  ]);
  console.log("[seed]   verification records inserted\n");

  // ---- 5. Audit chain — multiple events per draft -------------------------
  console.log("[seed] Seeding audit chain…");
  const auditDocs = draftIds.flatMap((id, i) =>
    range(4).map((k) => buildAudit(userId, id, i * 4 + k)),
  );
  await AuditEventModel.insertMany(auditDocs);
  console.log(`[seed]   ${auditDocs.length} audit events inserted\n`);

  // ---- 6. Tracking pings — 4 per draft to draw a short trail --------------
  console.log("[seed] Seeding tracking pings…");
  const pings = draftIds.flatMap((id, i) =>
    range(4).map((k) => buildTrackingPing(userId, id, i, k)),
  );
  await TrackingPingModel.insertMany(pings);
  console.log(`[seed]   ${pings.length} tracking pings inserted\n`);

  // ---- 7. Standalone collections (not tied to drafts) ---------------------
  console.log("[seed] Seeding routes, product analyses, load offers, trucks…");
  await Promise.all([
    SaveRouteModel.insertMany(range(PER_MODEL).map((i) => buildSaveRoute(userId, i))),
    ProductAnalysisModel.insertMany(
      range(PER_MODEL).map((i) => buildProductAnalysis(userId, i)),
    ),
    LoadOfferModel.insertMany(range(PER_MODEL).map((i) => buildLoadOffer(userId, i))),
    TruckModel.insertMany(range(PER_MODEL).map((i) => buildTruck(userId, i))),
  ]);
  console.log("[seed]   standalone records inserted\n");

  console.log("[seed] ✓ Demo seed complete.");
  console.log(`[seed]   login: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
  console.log(`[seed]   ${PER_MODEL} drafts, ${auditDocs.length} audit events, ${pings.length} pings`);

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error("[seed] FATAL:", err);
  void mongoose.disconnect();
  process.exit(1);
});
