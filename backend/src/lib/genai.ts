import { GoogleGenAI } from "@google/genai";
import path from "path";

let cached: GoogleGenAI | null = null;

export const FLASH_MODEL = "gemini-2.5-flash";
export const PRO_MODEL = "gemini-2.5-pro";

/**
 * Singleton GoogleGenAI client configured for Vertex AI.
 *
 * Credentials resolution (first match wins):
 *  1. GOOGLE_APPLICATION_CREDENTIALS_JSON — full SA JSON as a string (prod / Duck DNS host)
 *  2. GOOGLE_APPLICATION_CREDENTIALS       — path to SA key file (local dev)
 *  3. Application Default Credentials      — gcloud user, metadata server, etc.
 */
export function genai(): GoogleGenAI {
  if (cached) return cached;

  const project = process.env.GOOGLE_CLOUD_PROJECT;
  const location = process.env.VERTEX_AI_LOCATION ?? "us-central1";
  if (!project) {
    throw new Error("GOOGLE_CLOUD_PROJECT is not set — Vertex AI cannot initialize");
  }

  const inlineJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  const filePath = process.env.GOOGLE_APPLICATION_CREDENTIALS;

  let googleAuthOptions: { credentials?: object; keyFile?: string } | undefined;

  if (inlineJson) {
    try {
      googleAuthOptions = { credentials: JSON.parse(inlineJson) };
    } catch (err) {
      throw new Error(
        `GOOGLE_APPLICATION_CREDENTIALS_JSON is not valid JSON: ${(err as Error).message}`
      );
    }
  } else if (filePath) {
    googleAuthOptions = {
      keyFile: path.isAbsolute(filePath)
        ? filePath
        : path.resolve(process.cwd(), filePath),
    };
  }

  cached = new GoogleGenAI({
    vertexai: true,
    project,
    location,
    googleAuthOptions,
  });
  return cached;
}
