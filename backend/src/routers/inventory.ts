import { genai, FLASH_MODEL } from "../lib/genai.js";
import { TRPCError } from "@trpc/server";
import axios from "axios";
import { z } from "zod";

import { assertObjectId, requireUserId } from "../lib/auth.js";
import { DraftModel } from "../models/Draft.js";
import { NewsHistoryModel } from "../models/NewsHistory.js";
import { protectedProcedure, publicProcedure, router } from "../trpc.js";

// ---------------------------------------------------------------------------
// In-process summary cache — avoids re-calling Gemini for the same article
// within a server process lifetime. Key = article URL (stable identifier).
// ---------------------------------------------------------------------------
const summaryCache = new Map<
  string,
  { bullets: string[]; suggestions: string[] }
>();

// ---------------------------------------------------------------------------
// Local input schemas
// ---------------------------------------------------------------------------

const CreateDraftInputSchema = z.object({
  originCountry: z.string().min(1).max(100),
  destinationCountry: z.string().min(1).max(100),
  hsCode: z.string().min(1).max(20),
  productDescription: z.string().min(1).max(1000),
  weight: z.number().positive().max(1_000_000),
  perishable: z.boolean().optional(),
  hazardous: z.boolean().optional(),
});

const UpdateDraftInputSchema = z.object({
  id: z.string().min(1),
  updateData: z.record(z.string(), z.unknown()),
});

const GetDraftsInputSchema = z.object({
  tab: z
    .enum([
      "yet-to-be-checked",
      "compliant",
      "non-compliant",
      "ready-for-shipment",
    ])
    .optional(),
});

const GetDraftsByUserInputSchema = z.object({
  userId: z.string().min(1),
  complianceStatus: z.string().optional(),
  routeOptimizationStatus: z.string().optional(),
});

const GetDraftByIdInputSchema = z.object({
  id: z.string().min(1),
});

const DeleteDraftInputSchema = z.object({
  id: z.string().min(1),
});

const GetNewsInputSchema = z.object({
  search: z.string().max(500).optional(),
  page: z.number().int().min(1).max(4).default(1),
  searchMode: z.enum(["direct", "summarized"]).default("direct"),
});

const SummarizeArticleInputSchema = z.object({
  content: z.string().min(1).max(20000),
  url: z.string().min(1).max(2000).url(),
});

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const inventoryRouter = router({
  // POST /api/drafts
  createDraft: protectedProcedure
    .input(CreateDraftInputSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = requireUserId(ctx);

      const draft = await DraftModel.create({
        userId,
        formData: {
          ShipmentDetails: {
            "Origin Country": input.originCountry,
            "Destination Country": input.destinationCountry,
            "HS Code": input.hsCode,
            "Product Description": input.productDescription,
            "Gross Weight": input.weight,
          },
          TradeAndRegulatoryDetails: {
            Perishable: input.perishable,
            "Hazardous Material": input.hazardous,
          },
        },
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

  // PUT /api/drafts/:id
  updateDraft: protectedProcedure
    .input(UpdateDraftInputSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = requireUserId(ctx);
      assertObjectId(input.id, "draftId");

      const draft = await DraftModel.findOne({ _id: input.id, userId });
      if (!draft) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Draft not found or not authorized",
        });
      }

      // Drop fields the client should never be able to overwrite (defence-in-
      // depth against IDOR/userId-overwrite via the loose `updateData` Record).
      const sanitizedUpdate: Record<string, unknown> = { ...input.updateData };
      delete sanitizedUpdate.userId;
      delete sanitizedUpdate._id;
      delete sanitizedUpdate.id;

      Object.assign(draft, sanitizedUpdate);
      // The schema uses Mixed for nested fields — Mongoose can't see deep
      // assignments without markModified, so changes would silently not persist.
      for (const key of Object.keys(sanitizedUpdate)) {
        draft.markModified(key);
      }
      await draft.save();

      return {
        message: "Draft updated successfully",
        recordId: draft._id,
      };
    }),

  // GET /api/drafts?tab=...
  getDrafts: protectedProcedure
    .input(GetDraftsInputSchema)
    .query(async ({ ctx, input }) => {
      const userId = requireUserId(ctx);

      const query: Record<string, unknown> = { userId };

      if (input.tab) {
        switch (input.tab) {
          case "yet-to-be-checked":
            query.$or = [
              {
                "statuses.compliance": "notDone",
                "statuses.routeOptimization": "notDone",
              },
              {
                "statuses.compliance": "notDone",
                "statuses.routeOptimization": "done",
              },
            ];
            break;
          case "compliant":
            query["statuses.compliance"] = "compliant";
            query["statuses.routeOptimization"] = "notDone";
            break;
          case "non-compliant":
            query["statuses.compliance"] = "nonCompliant";
            query["statuses.routeOptimization"] = "notDone";
            break;
          case "ready-for-shipment":
            query["statuses.compliance"] = "compliant";
            query["statuses.routeOptimization"] = "done";
            break;
        }
      }

      const drafts = await DraftModel.find(query).sort({ timestamp: -1 });

      return {
        message: "Drafts retrieved successfully",
        drafts,
      };
    }),

  // GET /api/drafts/user/:userId
  getDraftsByUser: protectedProcedure
    .input(GetDraftsByUserInputSchema)
    .query(async ({ ctx, input }) => {
      const authedUserId = requireUserId(ctx);
      assertObjectId(input.userId, "userId");

      // Defence-in-depth: refuse to expose another user's drafts even if the
      // caller knows their ObjectId. Only the authenticated user can read
      // their own drafts via this endpoint.
      if (String(authedUserId) !== input.userId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Cannot query drafts for a different user",
        });
      }

      const query: Record<string, unknown> = { userId: input.userId };
      if (input.complianceStatus === "done")
        query["statuses.compliance"] = "compliant";
      if (input.routeOptimizationStatus === "done")
        query["statuses.routeOptimization"] = "done";

      const drafts = await DraftModel.find(query).sort({ timestamp: -1 });
      return { drafts };
    }),

  // GET /api/drafts/:id
  getDraftById: protectedProcedure
    .input(GetDraftByIdInputSchema)
    .query(async ({ ctx, input }) => {
      const userId = requireUserId(ctx);
      assertObjectId(input.id, "draftId");

      const draft = await DraftModel.findOne({ _id: input.id, userId });
      if (!draft) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Draft not found or not authorized",
        });
      }

      return {
        message: "Draft retrieved successfully",
        draft,
      };
    }),

  // DELETE /api/drafts/:id
  deleteDraft: protectedProcedure
    .input(DeleteDraftInputSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = requireUserId(ctx);
      assertObjectId(input.id, "draftId");

      const deletedDraft = await DraftModel.findOneAndDelete({
        _id: input.id,
        userId,
      });

      if (!deletedDraft) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Draft not found or not authorized",
        });
      }

      return { message: "Draft deleted successfully" };
    }),

  // GET /news
  getNews: publicProcedure
    .input(GetNewsInputSchema)
    .query(async ({ input }) => {
      const { search, page, searchMode } = input;
      const pageNum = page;

      const today = new Date();
      const targetDate = new Date(
        Date.UTC(
          today.getUTCFullYear(),
          today.getUTCMonth(),
          today.getUTCDate() - pageNum,
        ),
      );
      const formattedDate = targetDate.toISOString().split("T")[0];
      const fromDate = new Date(
        Date.UTC(
          today.getUTCFullYear(),
          today.getUTCMonth(),
          today.getUTCDate() - 4,
        ),
      )
        .toISOString()
        .split("T")[0];
      const toDate = new Date(
        Date.UTC(
          today.getUTCFullYear(),
          today.getUTCMonth(),
          today.getUTCDate() - 1,
        ),
      )
        .toISOString()
        .split("T")[0];

      let finalQuery =
        '"pandemic" OR "epidemic" OR "outbreak" OR "disease spread" OR "public health crisis" OR "geopolitical event" OR "political instability" OR "trade war" OR "sanctions" OR "natural disaster" OR "extreme weather" OR "environmental hazard"';
      let articles: Array<{
        title: string;
        link: string;
        summary: string;
        date: string;
        source: string;
      }> = [];

      if (search) {
        if (searchMode === "summarized") {
          const prompt = `
Summarize the following user query into 1 to 2 high-impact keywords or proper nouns for news search.
Focus on specific people, places, events, organizations, or major topics.
Remove filler words, dates, conversational phrases, and general context.
The goal is to extract core terms that will return the broadest relevant results from a news API.

Example: "What happened with the US-China trade war tariffs in 2024?" → ("us china tariffs")

Query: "${search}"
Return only the keywords.
`;
          try {
            const response = await genai().models.generateContent({
              model: FLASH_MODEL,
              contents: prompt,
            });
            finalQuery = response.text ?? "";
          } catch (err) {
            throw new TRPCError({
              code: "BAD_GATEWAY",
              message: `Gemini summarization failed: ${(err as Error)?.message ?? "unknown"}`,
            });
          }
        } else {
          finalQuery = search;
        }
      } else {
        const cachedNews = await NewsHistoryModel.findOne({
          date: formattedDate,
          query: "default",
        });
        if (cachedNews) {
          return {
            message: "News fetched from cache",
            articles: cachedNews.articles,
            totalResults: cachedNews.articles.length,
            query: finalQuery,
            fromDate,
            toDate,
          };
        }
      }

      const newsApiKey = process.env.NEWS_API_KEY;
      if (!newsApiKey) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "NEWS_API_KEY is not configured",
        });
      }

      const apiParams = {
        q: finalQuery,
        searchIn: "title",
        sortBy: "popularity",
        pageSize: 10,
        language: "en",
        apiKey: newsApiKey,
        from: formattedDate,
        to: formattedDate,
      };

      let response;
      try {
        response = await axios.get("https://newsapi.org/v2/everything", {
          params: apiParams,
        });
      } catch (err) {
        throw new TRPCError({
          code: "BAD_GATEWAY",
          message: `News API failed: ${(err as Error)?.message ?? "unknown"}`,
        });
      }

      // Defensive: NewsAPI may return null/undefined for `articles` on no-result
      // days or upstream failures. Coerce to an empty list to prevent
      // `Cannot read properties of undefined` from blowing up the request.
      const rawArticles = ((response.data as { articles?: unknown }).articles ??
        []) as Array<{
        title?: string;
        url?: string;
        description?: string;
        publishedAt?: string;
        source?: { name?: string } | null;
      }>;

      articles = rawArticles
        // NewsAPI sometimes returns sentinel "[Removed]" rows — strip them so
        // we don't render broken cards in the UI.
        .filter(
          (a) =>
            a &&
            typeof a === "object" &&
            a.title !== "[Removed]" &&
            a.url !== "https://removed.com"
        )
        .map((article) => ({
          title: article.title || "No title available",
          link: article.url || "#",
          summary: article.description || "No summary available",
          date: article.publishedAt || new Date().toISOString(),
          source: article.source?.name || "Unknown",
        }));

      if (!search && articles.length > 0) {
        await NewsHistoryModel.findOneAndUpdate(
          { date: formattedDate, query: "default" },
          {
            date: formattedDate,
            query: "default",
            articles,
            timestamp: new Date(),
          },
          { upsert: true },
        );
      }

      return {
        message: articles.length
          ? "News fetched successfully"
          : `No news found for query: "${
              search || finalQuery
            }" on ${formattedDate}`,
        articles,
        totalResults: articles.length,
        query: search || finalQuery,
        fromDate,
        toDate,
      };
    }),

  // POST /summarize
  summarizeArticle: publicProcedure
    .input(SummarizeArticleInputSchema)
    .mutation(async ({ input }) => {
      const { content, url } = input;

      // Return cached result immediately if we've seen this URL before
      const cached = summaryCache.get(url);
      if (cached) {
        return {
          message: "Article summarized successfully (cached)",
          summary: cached.bullets.join("\n"),
          suggestions: cached.suggestions.join("\n"),
          bullets: cached.bullets,
          suggestionBullets: cached.suggestions,
          url,
        };
      }

      const prompt = `You are a logistics-intelligence assistant. Analyze the news article below and respond with ONLY a JSON object — no markdown fences, no explanation.

Article:
"""
${content}
"""

Return this exact JSON shape:
{
  "summary": ["bullet 1", "bullet 2", "bullet 3"],
  "suggestions": ["bullet 1", "bullet 2", "bullet 3"]
}

Rules:
- "summary": 3 to 5 bullet points, each a single concise sentence covering the key facts.
- "suggestions": 3 to 5 bullet points for logistics providers. Each bullet names the affected region (if any) and one concrete action. If the article has NO supply-chain impact, use exactly one bullet: "No shipping impact expected — proceed with operations as planned."
- Every bullet must be ≤ 20 words.
- Do NOT use markdown, asterisks, or numbering inside the strings.`;

      let bullets: string[] = [];
      let suggestionBullets: string[] = [];

      try {
        const response = await genai().models.generateContent({
          model: FLASH_MODEL,
          contents: prompt,
        });
        const raw = (response.text ?? "").trim();

        // Strip any accidental markdown fences before parsing
        const jsonText = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");

        let parsed: { summary?: unknown; suggestions?: unknown };
        try {
          parsed = JSON.parse(jsonText) as { summary?: unknown; suggestions?: unknown };
        } catch {
          // Gemini returned prose — fall back gracefully
          parsed = {};
        }

        const toStringArray = (v: unknown): string[] => {
          if (Array.isArray(v)) return (v as unknown[]).map(String).filter(Boolean);
          if (typeof v === "string") {
            // Try to split prose on newlines / sentences as best-effort
            return v
              .split(/\n|(?<=\.)\s+/)
              .map((s) => s.trim())
              .filter(Boolean);
          }
          return [];
        };

        bullets = toStringArray(parsed.summary).slice(0, 5);
        suggestionBullets = toStringArray(parsed.suggestions).slice(0, 5);

        if (bullets.length === 0) bullets = ["Summary not available"];
        if (suggestionBullets.length === 0) suggestionBullets = ["No suggestions available"];
      } catch (err) {
        throw new TRPCError({
          code: "BAD_GATEWAY",
          message: `Gemini summarization failed: ${(err as Error)?.message ?? "unknown"}`,
        });
      }

      // Cache for the lifetime of this server process
      summaryCache.set(url, { bullets, suggestions: suggestionBullets });

      return {
        message: "Article summarized successfully",
        // Legacy prose fields — join bullets so existing callers still work
        summary: bullets.join("\n"),
        suggestions: suggestionBullets.join("\n"),
        // Structured bullet arrays for the updated frontend
        bullets,
        suggestionBullets,
        url,
      };
    }),
});
