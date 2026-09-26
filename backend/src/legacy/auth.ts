/**
 * Legacy Express routes for auth domain that cannot cleanly become tRPC:
 *  - POST /api/user/upload-photo — multer file upload to Google Cloud Storage
 *
 * These are mounted by the consolidation phase in backend/src/index.ts.
 */

// External
import express from "express";

// Internal
import { upload, storage as gcsStorage, MAX_FILE_SIZE_BYTES, ALLOWED_MIME_TYPES } from "../config/multer.js";
import { UserModel } from "../models/User.js";
import verifyToken from "../middleware/auth.js";

// ---------------------------------------------------------------------------
// Rate-limiting hook: mount express-rate-limit on /api/user/upload-photo
// to prevent abuse.
// Example (wire in backend/src/index.ts or here):
//   import rateLimit from "express-rate-limit";
//   const uploadLimiter = rateLimit({ windowMs: 60_000, max: 10 });
//   router.post("/api/user/upload-photo", uploadLimiter, verifyToken, ...);
// ---------------------------------------------------------------------------

const router = express.Router();

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Signed URL validity: 1 year expressed in milliseconds. */
const SIGNED_URL_EXPIRY_MS = 365 * 24 * 60 * 60 * 1_000;

// ---------------------------------------------------------------------------
// Upload Profile Photo (multer + Google Cloud Storage)
// ---------------------------------------------------------------------------
router.post(
  "/api/user/upload-photo",
  verifyToken as express.RequestHandler,
  upload.single("photo"),
  async (req: express.Request, res: express.Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No photo uploaded" });
      }

      // Extra MIME-type guard (belt-and-suspenders: multer fileFilter already blocks this).
      if (!ALLOWED_MIME_TYPES.has(req.file.mimetype)) {
        return res.status(415).json({
          error: `Unsupported file type: ${req.file.mimetype}`,
        });
      }

      // Extra size guard (belt-and-suspenders: multer limits.fileSize already enforces this).
      if (req.file.size > MAX_FILE_SIZE_BYTES) {
        return res.status(413).json({
          error: `File too large. Maximum allowed size is ${MAX_FILE_SIZE_BYTES / (1024 * 1024)} MB`,
        });
      }

      const user = (req as unknown as { user?: { id?: unknown } }).user;
      const rawId = user?.id;
      if (!rawId || typeof rawId !== "string") {
        return res.status(401).json({ error: "Unauthorized" });
      }
      // Sanitize: only allow hex characters in the id segment of the GCS
      // path so a tampered JWT can't inject path separators.
      if (!/^[a-fA-F0-9]{24}$/.test(rawId)) {
        return res.status(400).json({ error: "Invalid user id format" });
      }
      const userId = rawId;
      const imageFile = req.file;
      const bucketName = process.env.GOOGLE_CLOUD_BUCKET_NAME;

      if (!bucketName) {
        return res.status(500).json({ error: "Storage not configured" });
      }

      // Sanitize the original filename to remove path separators.
      const safeOriginalName = imageFile.originalname.replace(/[/\\]/g, "_");
      const fileName = `${userId}_${Date.now()}_${safeOriginalName}`;
      const bucket = gcsStorage.bucket(bucketName);
      const blob = bucket.file(`profile_photos/${fileName}`);

      // Upload image to Google Cloud Storage.
      try {
        await new Promise<void>((resolve, reject) => {
          const stream = blob
            .createWriteStream({
              metadata: { contentType: imageFile.mimetype },
            })
            .on("error", reject)
            .on("finish", resolve);
          stream.end(imageFile.buffer);
        });
      } catch (uploadError) {
        console.error("GCS upload error:", uploadError);
        return res.status(502).json({ error: "Failed to upload file to storage" });
      }

      // Generate a signed URL (expires in 1 year).
      let signedUrl: string;
      try {
        const [url] = await blob.getSignedUrl({
          action: "read",
          expires: Date.now() + SIGNED_URL_EXPIRY_MS,
        });
        signedUrl = url;
      } catch (signError) {
        console.error("GCS signed URL error:", signError);
        return res.status(502).json({ error: "Failed to generate file URL" });
      }

      const updatedUser = await UserModel.findByIdAndUpdate(
        userId,
        { profilePhoto: signedUrl },
        { new: true }
      );

      if (!updatedUser) {
        return res.status(404).json({ error: "User not found" });
      }

      return res
        .status(200)
        .json({ message: "Profile photo uploaded successfully", signedUrl });
    } catch (error) {
      console.error("Error uploading profile photo:", error);
      return res.status(500).json({ error: "Failed to upload profile photo" });
    }
  }
);

export default router;
