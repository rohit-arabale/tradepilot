/**
 * Legacy Express routes for compliance domain endpoints that cannot cleanly
 * become tRPC procedures because they rely on multer file-upload middleware.
 *
 * Specifically:
 *   POST /api/analyze-product  — multipart/form-data image upload via multer
 *
 * These will be mounted in backend/src/index.ts during the consolidation phase.
 */

// External
import express from "express";
import mongoose from "mongoose";
import { genai, PRO_MODEL } from "../lib/genai.js";

// Internal
import { upload, storage, visionClient, MAX_FILE_SIZE_BYTES, ALLOWED_MIME_TYPES } from "../config/multer.js";
import ProductAnalysisModel from "../models/ProductAnalysis.js";
import DraftModel from "../models/Draft.js";
import { verifyToken } from "../middleware/auth.js";

// ---------------------------------------------------------------------------
// Rate-limiting hook: mount express-rate-limit on /api/analyze-product to
// prevent Gemini / Vision API abuse.
// Example (wire in backend/src/index.ts or here):
//   import rateLimit from "express-rate-limit";
//   const analyzeLimiter = rateLimit({ windowMs: 60_000, max: 5 });
//   legacyComplianceRouter.post("/api/analyze-product", analyzeLimiter, verifyToken, ...);
// ---------------------------------------------------------------------------

import type { Request, Response } from "express";

interface AuthenticatedRequest extends Request {
  user?: { id: string; [key: string]: unknown };
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Signed URL validity: 7 days expressed in milliseconds. */
const SIGNED_URL_EXPIRY_7D_MS = 7 * 24 * 60 * 60 * 1_000;


const legacyComplianceRouter = express.Router();

// ---------------------------------------------------------------------------
// POST /api/analyze-product
// Stays as Express + multer because tRPC does not support multipart file uploads.
// ---------------------------------------------------------------------------
legacyComplianceRouter.post(
  "/api/analyze-product",
  verifyToken as express.RequestHandler,
  upload.single("image"),
  (async (req: AuthenticatedRequest, res: Response) => {
    try {
      // --- Guard: file presence ---
      if (!req.file) {
        res.status(400).json({ error: "No image uploaded" });
        return;
      }

      // --- Guard: MIME type (belt-and-suspenders on top of multer fileFilter) ---
      if (!ALLOWED_MIME_TYPES.has(req.file.mimetype)) {
        res.status(415).json({
          error: `Unsupported file type: ${req.file.mimetype}`,
        });
        return;
      }

      // --- Guard: file size (belt-and-suspenders on top of multer limits) ---
      if (req.file.size > MAX_FILE_SIZE_BYTES) {
        res.status(413).json({
          error: `File too large. Maximum allowed size is ${MAX_FILE_SIZE_BYTES / (1024 * 1024)} MB`,
        });
        return;
      }

      // --- Guard: authenticated user ---
      if (!req.user?.id) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const userId = req.user.id;
      const imageFile = req.file;
      const bucketName = process.env.GOOGLE_CLOUD_BUCKET_NAME;

      if (!bucketName) {
        res.status(500).json({ error: "Storage not configured" });
        return;
      }

      // --- Guard: valid ObjectId before any DB work ---
      if (!mongoose.Types.ObjectId.isValid(userId)) {
        res.status(400).json({ error: "Invalid user identifier" });
        return;
      }
      const validatedUserId = new mongoose.Types.ObjectId(userId);

      // Sanitize original filename: strip path separators, leading dots, and
      // any sequence of dots (defeats `..` traversal attempts) before using
      // it as a GCS object key. Cap length so a long client filename can't
      // be used to bloat storage paths.
      const safeOriginalName = imageFile.originalname
        .replace(/[/\\]/g, "_")
        .replace(/\.{2,}/g, "_")
        .replace(/^\.+/, "")
        .slice(0, 200) || "upload";
      const fileName = `${Date.now()}_${safeOriginalName}`;
      const bucket = storage.bucket(bucketName);
      const blob = bucket.file(fileName);

      // --- Upload image to Google Cloud Storage ---
      try {
        await new Promise<void>((resolve, reject) => {
          const stream = blob
            .createWriteStream({ metadata: { contentType: imageFile.mimetype } })
            .on("error", reject)
            .on("finish", resolve);
          stream.end(imageFile.buffer);
        });
      } catch (uploadError) {
        console.error("GCS upload error:", uploadError);
        res.status(502).json({ error: "Failed to upload image to storage" });
        return;
      }

      // --- Generate a signed URL for the image (expires in 7 days) ---
      let signedUrl: string;
      try {
        const [url] = await blob.getSignedUrl({
          action: "read",
          expires: Date.now() + SIGNED_URL_EXPIRY_7D_MS,
        });
        signedUrl = url;
      } catch (signError) {
        console.error("GCS signed URL error:", signError);
        res.status(502).json({ error: "Failed to generate image URL" });
        return;
      }

      // --- Analyze with Vision API ---
      let labels: Array<{ description?: string; score?: number }>;
      try {
        const [visionResult] = await visionClient.labelDetection({
          image: { source: { imageUri: `gs://${bucketName}/${fileName}` } },
        });
        labels = (visionResult.labelAnnotations ?? []) as Array<{
          description?: string;
          score?: number;
        }>;
      } catch (visionError) {
        console.error("Vision API error:", visionError);
        res.status(502).json({ error: "Failed to analyze image with Vision API" });
        return;
      }

      const visionResponse = {
        success: true,
        labels: labels.map((label) => ({
          description: label.description,
          score: label.score,
        })),
      };

      // --- Prepare prompt for Gemini AI ---
      const prompt = `
Analyze the following Google Vision API response and provide:

1. The HS Code for the product.
2. A detailed product description.
3. Whether the product is perishable (true/false).
4. Whether the product is hazardous (true/false).
5. A concise list of the essential documents required to export this product outside the country (only document names).
6. Additional tips and recommendations for successfully exporting this product outside the country, referencing world customs rules where applicable.

Return the result as a JSON object in this format:

{
  "HS Code": "string",
  "Product Description": "string",
  "Perishable": boolean,
  "Hazardous": boolean,
  "Required Export Document List": ["string", "string", ...],
  "Recommendations": {
    "message": "string",
    "additionalTip": "string"
  }
}

When determining the required export documents and providing recommendations, please reference world customs rules and regulations to ensure accuracy and compliance.

Vision API Response:
${JSON.stringify(visionResponse, null, 2)}
`;

      // --- Generate response with Gemini AI ---
      let geminiResponse: Record<string, unknown>;
      try {
        const response = await genai().models.generateContent({
          model: PRO_MODEL,
          contents: prompt,
        });
        const rawResponse = response.text ?? "";
        const jsonStart = rawResponse.indexOf("{");
        const jsonEnd = rawResponse.lastIndexOf("}") + 1;
        if (jsonStart === -1 || jsonEnd <= jsonStart) {
          throw new Error("Gemini response did not contain valid JSON");
        }
        const cleanResponseText = rawResponse.slice(jsonStart, jsonEnd).trim();
        geminiResponse = JSON.parse(cleanResponseText) as Record<string, unknown>;
      } catch (geminiError) {
        console.error("Gemini AI error:", geminiError);
        res.status(502).json({ error: "Failed to analyze product with AI service" });
        return;
      }

      // --- Save product analysis to MongoDB ---
      let productAnalysis: { _id: unknown };
      try {
        productAnalysis = await ProductAnalysisModel.create({
          userId: validatedUserId,
          imageDetails: {
            bucketName,
            fileName,
            mimeType: imageFile.mimetype,
            signedUrl,
          },
          visionResponse,
          geminiResponse,
          timestamp: new Date(),
        });
      } catch (dbError) {
        console.error("DB error saving product analysis:", dbError);
        res.status(500).json({ error: "Failed to save analysis record" });
        return;
      }

      // --- Create new draft with product analysis data ---
      let draft: { _id: unknown };
      try {
        draft = await DraftModel.create({
          userId: validatedUserId,
          formData: {
            ShipmentDetails: {
              "HS Code": geminiResponse["HS Code"],
              "Product Description": geminiResponse["Product Description"],
            },
            TradeAndRegulatoryDetails: {
              Perishable: geminiResponse["Perishable"],
              "Hazardous Material": geminiResponse["Hazardous"],
            },
          },
          statuses: {
            compliance: "notDone",
            routeOptimization: "notDone",
          },
          timestamp: new Date(),
        });
      } catch (draftError) {
        console.error("DB error creating draft:", draftError);
        res.status(500).json({ error: "Failed to create draft record" });
        return;
      }

      res.json({
        data: geminiResponse,
        imageUrl: signedUrl,
        recordId: productAnalysis._id,
        draftId: draft._id,
      });
    } catch (error) {
      console.error("Error in product analysis:", error);
      res.status(500).json({
        success: false,
        error: "Failed to analyze product",
      });
    }
  }) as express.RequestHandler
);

export default legacyComplianceRouter;
