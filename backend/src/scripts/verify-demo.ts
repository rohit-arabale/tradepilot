/**
 * Quick verification: confirm the demo user exists and report record counts
 * across every collection so we can prove the seed landed.
 */
// Load .env before any module that reads process.env at import time.
import "dotenv/config";
import dotenv from "dotenv";
import mongoose from "mongoose";

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

async function main() {
  await connectMongoDB();

  const user = await UserModel.findOne({ emailAddress: "demo@gmail.com" });
  if (!user) {
    console.log("[verify] ✗ demo@gmail.com user NOT found in DB");
    await mongoose.disconnect();
    process.exit(1);
  }
  console.log(`[verify] ✓ demo@gmail.com user._id = ${user._id}`);
  console.log(`[verify]   name: ${user.firstName} ${user.lastName}`);

  const userId = user._id;
  const counts = await Promise.all([
    DraftModel.countDocuments({ userId }),
    BoxCountResultModel.countDocuments({ userId }),
    WeightCheckModel.countDocuments({ userId }),
    RfidScanResultModel.countDocuments({ userId }),
    ShipmentDiffModel.countDocuments({ userId }),
    ComplianceRecordModel.countDocuments({ userId }),
    AnomalyReportModel.countDocuments({ userId }),
    AuditEventModel.countDocuments({ userId }),
    TrackingPingModel.countDocuments({ userId }),
    SaveRouteModel.countDocuments({ userId }),
    ProductAnalysisModel.countDocuments({ userId }),
    LoadOfferModel.countDocuments({ userId }),
    TruckModel.countDocuments({ userId }),
  ]);

  const labels = [
    "Drafts",
    "BoxCount results",
    "Weight checks",
    "RFID scans",
    "Shipment diffs",
    "Compliance records",
    "Anomaly reports",
    "Audit events",
    "Tracking pings",
    "Saved routes",
    "Product analyses",
    "Load offers",
    "Trucks",
  ];

  console.log("\n[verify] Record counts for demo@gmail.com:");
  labels.forEach((l, i) => {
    const c = counts[i]!;
    const mark = c > 0 ? "✓" : "✗";
    console.log(`  ${mark} ${l.padEnd(22)} ${c}`);
  });

  // Cross-check: how many TOTAL users + drafts exist?
  const totalUsers = await UserModel.countDocuments({});
  const totalDrafts = await DraftModel.countDocuments({});
  console.log(`\n[verify] Whole DB: ${totalUsers} users, ${totalDrafts} drafts`);

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error("[verify] FATAL:", e);
  void mongoose.disconnect();
  process.exit(1);
});
