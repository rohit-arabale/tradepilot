import { TRPCError } from "@trpc/server";
import mongoose from "mongoose";
import { z } from "zod";

import { genai, PRO_MODEL } from "../lib/genai.js";
import { assertObjectId, requireUserId } from "../lib/auth.js";
import ComplianceRecordModel from "../models/ComplianceRecord.js";
import DraftModel from "../models/Draft.js";
import ProductAnalysisModel from "../models/ProductAnalysis.js";
import { protectedProcedure, router } from "../trpc.js";

// ---------------------------------------------------------------------------
// Inline input schemas
// ---------------------------------------------------------------------------

const ShipmentDetailsSchema = z.record(z.string(), z.unknown());
const TradeAndRegulatoryDetailsSchema = z.record(z.string(), z.unknown());
const PartiesAndIdentifiersSchema = z.record(z.string(), z.unknown());
const LogisticsAndHandlingSchema = z.record(z.string(), z.unknown());
const DocumentVerificationSchema = z.record(z.string(), z.unknown());
const IntendedUseDetailsSchema = z.record(z.string(), z.unknown());

const ComplianceCheckInputSchema = z.object({
  draftId: z.string().optional(),
  ShipmentDetails: ShipmentDetailsSchema,
  TradeAndRegulatoryDetails: TradeAndRegulatoryDetailsSchema,
  PartiesAndIdentifiers: PartiesAndIdentifiersSchema,
  LogisticsAndHandling: LogisticsAndHandlingSchema,
  DocumentVerification: DocumentVerificationSchema,
  IntendedUseDetails: IntendedUseDetailsSchema,
});

const RecordIdInputSchema = z.object({
  recordId: z.string().min(1),
});

const CsvDraftInputSchema = z.object({
  formData: z.record(z.string(), z.unknown()),
});

// ---------------------------------------------------------------------------
// complianceRouter
// ---------------------------------------------------------------------------

export const complianceRouter = router({
  // POST /api/compliance-check
  check: protectedProcedure
    .input(ComplianceCheckInputSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = requireUserId(ctx);

      const {
        draftId,
        ShipmentDetails,
        TradeAndRegulatoryDetails,
        PartiesAndIdentifiers,
        LogisticsAndHandling,
        DocumentVerification,
        IntendedUseDetails,
      } = input;

      const formData = {
        ShipmentDetails,
        TradeAndRegulatoryDetails,
        PartiesAndIdentifiers,
        LogisticsAndHandling,
        DocumentVerification,
        IntendedUseDetails,
      };

      const documentVerificationString = JSON.stringify(DocumentVerification, null, 2);

      const prompt = `
You are a compliance checker AI for international trade shipments, designed to assess compliance using World Customs Organization (WCO) standards.

**Inputs**:
- Shipment Details:
  - Origin Country: ${(ShipmentDetails as Record<string, unknown>)["Origin Country"] ?? "Not Provided"}
  - Destination Country: ${(ShipmentDetails as Record<string, unknown>)["Destination Country"] ?? "Not Provided"}
  - HS Code: ${(ShipmentDetails as Record<string, unknown>)["HS Code"] ?? "Not Provided"}
  - Product Description: ${(ShipmentDetails as Record<string, unknown>)["Product Description"] ?? "Not Provided"}
  - Quantity: ${(ShipmentDetails as Record<string, unknown>)["Quantity"] ?? "Not Provided"}
  - Gross Weight: ${(ShipmentDetails as Record<string, unknown>)["Gross Weight"] ?? "Not Provided"} kg
- Trade and Regulatory Details:
  - Incoterms: ${(TradeAndRegulatoryDetails as Record<string, unknown>)["Incoterms 2020"] ?? "Not Provided"}
  - Declared Value: ${((TradeAndRegulatoryDetails as Record<string, unknown>)["Declared Value"] as Record<string, unknown>)?.amount ?? "Not Provided"} ${((TradeAndRegulatoryDetails as Record<string, unknown>)["Declared Value"] as Record<string, unknown>)?.currency ?? "Not Provided"}
  - Currency: ${(TradeAndRegulatoryDetails as Record<string, unknown>)["Currency of Transaction"] ?? "Not Provided"}
  - Trade Agreement: ${(TradeAndRegulatoryDetails as Record<string, unknown>)["Trade Agreement Claimed"] ?? "None"}
  - Dual-Use Goods: ${(TradeAndRegulatoryDetails as Record<string, unknown>)["Dual-Use Goods"] ?? "Not Provided"}
  - Hazardous Material: ${(TradeAndRegulatoryDetails as Record<string, unknown>)["Hazardous Material"] ?? "Not Provided"}
  - Perishable: ${(TradeAndRegulatoryDetails as Record<string, unknown>)["Perishable"] ?? "Not Provided"}
- Parties and Identifiers:
  - Shipper/Exporter: ${(PartiesAndIdentifiers as Record<string, unknown>)["Shipper/Exporter"] ?? "Not Provided"}
  - Consignee/Importer: ${(PartiesAndIdentifiers as Record<string, unknown>)["Consignee/Importer"] ?? "Not Provided"}
  - Manufacturer: ${(PartiesAndIdentifiers as Record<string, unknown>)["Manufacturer Information"] ?? "Not Provided"}
  - EORI/Tax ID: ${(PartiesAndIdentifiers as Record<string, unknown>)["EORI/Tax ID"] ?? "Not Provided"}
- Logistics and Handling:
  - Means of Transport: ${(LogisticsAndHandling as Record<string, unknown>)["Means of Transport"] ?? "Not Provided"}
  - Port of Loading: ${(LogisticsAndHandling as Record<string, unknown>)["Port of Loading"] ?? "Not Provided"}
  - Port of Discharge: ${(LogisticsAndHandling as Record<string, unknown>)["Port of Discharge"] ?? "Not Provided"}
  - Special Handling: ${(LogisticsAndHandling as Record<string, unknown>)["Special Handling"] ?? "None"}
  - Temperature Requirements: ${(LogisticsAndHandling as Record<string, unknown>)["Temperature Requirements"] ?? "Not Specified"}
- Document Verification:
  ${documentVerificationString}
- Intended Use Details:
  - Intended Use: ${(IntendedUseDetails as Record<string, unknown>)["Intended Use"] ?? "Not Specified"}

**Response Format (JSON)**:
{
  "complianceStatus": "string",
  "riskLevel": {
    "riskScore": "number",
    "summary": "string"
  },
  "summary": "string",
  "violations": [],
  "recommendations": [],
  "scores": {
    "ShipmentDetails": "number",
    "TradeAndRegulatoryDetails": "number",
    "PartiesAndIdentifiers": "number",
    "LogisticsAndHandling": "number",
    "IntendedUseDetails": "number"
  },
  "additionalTips": ["string"]
}
`;

      let rawResponse: string;
      try {
        const response = await genai().models.generateContent({
          model: PRO_MODEL,
          contents: prompt,
        });
        rawResponse = response.text ?? "";
      } catch (err) {
        throw new TRPCError({
          code: "BAD_GATEWAY",
          message: `Gemini compliance check failed: ${(err as Error)?.message ?? "unknown"}`,
        });
      }

      const jsonRegex = /\{[\s\S]*\}/;
      const match = rawResponse.match(jsonRegex);

      if (!match) {
        console.error("No JSON object found in the raw AI response.");
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Invalid AI response format: No JSON object found.",
        });
      }

      const cleanResponseText = match[0];
      let complianceResponse: Record<string, unknown>;

      try {
        complianceResponse = JSON.parse(cleanResponseText) as Record<string, unknown>;
      } catch (parseError) {
        console.error("Error parsing extracted JSON from AI response:", parseError);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Invalid AI response format: Malformed JSON.",
        });
      }

      // Tolerate minor casing/whitespace drift from the AI response — Gemini
      // sometimes returns "READY FOR SHIPMENT" or "ready for shipment" instead
      // of the documented "Ready for Shipment", which used to silently flip
      // the draft to nonCompliant.
      const originalAIComplianceStatus = String(
        complianceResponse.complianceStatus ?? ""
      ).trim();
      const normalizedAIStatus = originalAIComplianceStatus.toLowerCase();

      let standardizedStatus: string;
      if (normalizedAIStatus === "ready for shipment") {
        standardizedStatus = "compliant";
      } else if (normalizedAIStatus === "not ready") {
        standardizedStatus = "nonCompliant";
      } else {
        standardizedStatus = "nonCompliant";
      }

      await ComplianceRecordModel.create({
        userId,
        formData,
        complianceResponse,
        timestamp: new Date(),
        type: "complianceCheck",
      });

      let draft;
      if (draftId && mongoose.Types.ObjectId.isValid(draftId)) {
        draft = await DraftModel.findOne({ _id: draftId, userId });
        if (!draft) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Draft not found or not authorized",
          });
        }
        draft.formData = formData;
        draft.complianceData = { ...complianceResponse };
        (draft as unknown as Record<string, unknown>).statuses = {
          ...((draft as unknown as Record<string, unknown>).statuses as Record<
            string,
            unknown
          >),
          compliance: standardizedStatus,
        };
        draft.timestamp = new Date();
        draft.markModified("statuses");
        draft.markModified("complianceData");
        await draft.save();
      } else {
        draft = await DraftModel.create({
          userId,
          formData,
          complianceData: { ...complianceResponse },
          statuses: {
            compliance: standardizedStatus,
            routeOptimization: "notDone",
          },
          timestamp: new Date(),
        });
      }

      return {
        complianceResponse,
        recordId: draft._id,
      };
    }),

  // GET /api/compliance-history
  history: protectedProcedure.query(async ({ ctx }) => {
    const userId = requireUserId(ctx);

    const complianceRecords = await ComplianceRecordModel.find({ userId }).sort({
      timestamp: -1,
    });

    return {
      message: "Compliance history retrieved successfully",
      complianceHistory: complianceRecords ?? [],
    };
  }),

  // DELETE /api/compliance-history/:recordId
  deleteRecord: protectedProcedure
    .input(RecordIdInputSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = requireUserId(ctx);
      const { recordId } = input;

      assertObjectId(recordId, "recordId");

      const record = await ComplianceRecordModel.findOneAndDelete({
        _id: recordId,
        userId,
      });

      if (!record) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Route record not found",
        });
      }

      return { message: "Route record deleted successfully" };
    }),

  // GET /api/product-analysis-history
  productAnalysisHistory: protectedProcedure.query(async ({ ctx }) => {
    const userId = requireUserId(ctx);

    const productAnalysisRecords = await ProductAnalysisModel.find({ userId }).sort({
      timestamp: -1,
    });

    return {
      message: "Product analysis history retrieved successfully",
      productAnalysisHistory: productAnalysisRecords ?? [],
    };
  }),

  // DELETE /api/product-analysis-history/:recordId
  deleteProductAnalysis: protectedProcedure
    .input(RecordIdInputSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = requireUserId(ctx);
      const { recordId } = input;

      assertObjectId(recordId, "recordId");

      const record = await ProductAnalysisModel.findOneAndDelete({
        _id: recordId,
        userId,
      });

      if (!record) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Product analysis record not found",
        });
      }

      return { message: "Product analysis record deleted successfully" };
    }),

  // POST /csv
  createDraftFromCsv: protectedProcedure
    .input(CsvDraftInputSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = requireUserId(ctx);
      const { formData } = input;

      if (!formData) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "formData is required",
        });
      }

      const draft = await DraftModel.create({
        userId,
        formData,
        routeData: {},
        statuses: {
          compliance: "notDone",
          routeOptimization: "notDone",
        },
        timestamp: new Date(),
      });

      return {
        message: "Draft created successfully",
        recordId: draft._id,
      };
    }),
});
