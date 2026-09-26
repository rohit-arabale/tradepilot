// External
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import multer from "multer";
import { Storage } from "@google-cloud/storage";
import vision from "@google-cloud/vision";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------------------------------------------------------------------
// Upload constraints
// ---------------------------------------------------------------------------

/** Maximum accepted upload size: 10 MB. */
export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

/**
 * MIME types accepted by the image upload endpoints.
 * Vision API supports JPEG, PNG, GIF, BMP, WebP, RAW, ICO, PDF, TIFF.
 * We restrict to common web formats only.
 */
export const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

// ---------------------------------------------------------------------------
// Google Cloud initialisation
// ---------------------------------------------------------------------------

let storage: Storage;
let visionClient: vision.ImageAnnotatorClient;

if (process.env.NODE_ENV === "production") {
  let credentials: Record<string, unknown>;
  // Accept either the new explicit name or the legacy ENV name for backward compatibility.
  const credentialsJson =
    process.env.GOOGLE_CLOUD_CREDENTIALS_JSON ?? process.env.ENV ?? "";
  try {
    credentials = JSON.parse(credentialsJson) as Record<string, unknown>;
  } catch (error) {
    console.error(
      "Failed to parse credentials from GOOGLE_CLOUD_CREDENTIALS_JSON:",
      error
    );
    throw new Error(
      "Unable to load Google Cloud credentials from environment variable"
    );
  }

  storage = new Storage({ credentials });
  visionClient = new vision.ImageAnnotatorClient({ credentials });
} else {
  // Local development: load from JSON file if it exists, otherwise use mock credentials.
  const localPath = path.resolve(
    __dirname,
    "../../Config/tradepilot-upload.json"
  );

  let credentials: Record<string, unknown>;
  if (fs.existsSync(localPath)) {
    credentials = JSON.parse(
      fs.readFileSync(localPath, "utf8")
    ) as Record<string, unknown>;
    storage = new Storage({ credentials });
    visionClient = new vision.ImageAnnotatorClient({ credentials });
  } else {
    console.warn(
      "Google Cloud credentials file not found. Image upload features will be disabled."
    );
    console.warn(
      "   To enable, create: backend/Config/tradepilot-upload.json"
    );
    // Initialise with empty credentials for development (features will fail gracefully).
    storage = new Storage({ projectId: "dev-project" });
    visionClient = new vision.ImageAnnotatorClient();
  }
}

// ---------------------------------------------------------------------------
// Multer instance
// ---------------------------------------------------------------------------

/**
 * multer upload middleware with:
 *  - memoryStorage (no disk writes, safe for transient upload buffers)
 *  - fileSize limit of MAX_FILE_SIZE_BYTES
 *  - MIME-type allowlist enforced via fileFilter
 *
 * Rate-limiting hook: mount express-rate-limit before the upload route in
 * legacy/auth.ts and legacy/compliance.ts to prevent upload-spam.
 * Example:
 *   import rateLimit from "express-rate-limit";
 *   const uploadLimiter = rateLimit({ windowMs: 60_000, max: 10 });
 *   router.post("/api/user/upload-photo", uploadLimiter, verifyToken, upload.single("photo"), ...);
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES,
  },
  fileFilter(
    _req: Express.Request,
    file: Express.Multer.File,
    cb: multer.FileFilterCallback
  ) {
    if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new Error(
          `Unsupported file type: ${file.mimetype}. Allowed: ${[...ALLOWED_MIME_TYPES].join(", ")}`
        )
      );
    }
  },
});

export { upload, storage, visionClient };
export default upload;
