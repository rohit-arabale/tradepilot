import { router } from "../trpc.js";
import { authRouter } from "./auth.js";
import { inventoryRouter } from "./inventory.js";
import { complianceRouter } from "./compliance.js";
import { logisticsRouter } from "./logistics.js";
import { boxCountRouter } from "./boxCount.js";
import { shipmentDiffRouter } from "./shipmentDiff.js";
import { loadMatchRouter } from "./loadMatch.js";
import { trackingRouter } from "./tracking.js";
import { anomalyRouter } from "./anomaly.js";
import { rfidRouter } from "./rfid.js";
import { weightCheckRouter } from "./weightCheck.js";
import { fraudRouter } from "./fraud.js";
import { trucksRouter } from "./trucks.js";
import { auditRouter } from "./audit.js";
import { insightsRouter } from "./insights.js";
import { newsContextRouter } from "./newsContext.js";

/**
 * Root tRPC router. Domain agents will add their sub-routers
 * here in Phase 2 (auth, compliance, routes, carbon, products, drafts,
 * users, news).
 */
export const appRouter = router({
  auth: authRouter,
  inventory: inventoryRouter,
  compliance: complianceRouter,
  logistics: logisticsRouter,
  boxCount: boxCountRouter,
  shipmentDiff: shipmentDiffRouter,
  loadMatch: loadMatchRouter,
  tracking: trackingRouter,
  anomaly: anomalyRouter,
  rfid: rfidRouter,
  weightCheck: weightCheckRouter,
  fraud: fraudRouter,
  trucks: trucksRouter,
  audit: auditRouter,
  insights: insightsRouter,
  newsContext: newsContextRouter,
});

export type AppRouter = typeof appRouter;
