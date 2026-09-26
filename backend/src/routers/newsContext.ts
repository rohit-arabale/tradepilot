/**
 * news.contextualWarning — fetches news relevant to a shipment context,
 * runs Gemini to decide whether it should alter the user's decision, and
 * returns structured warnings with source links.
 *
 * The whole point (per taste.txt): make the workflow visible. The response
 * shape preserves which articles were considered so the UI can render
 * "I saw this and that's why my advice changed."
 */

import axios from "axios";
import { z } from "zod";
import { TRPCError } from "@trpc/server";

import { genai, FLASH_MODEL } from "../lib/genai.js";
import { publicProcedure, router } from "../trpc.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_ARTICLES = 6;
const NEWS_TIMEOUT_MS = 6_000;
const GEMINI_TIMEOUT_MS = 12_000;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 min — cheap demo cache

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const ShipmentContextSchema = z.object({
  origin: z.string().max(120).optional(),
  destination: z.string().max(120).optional(),
  productDescription: z.string().max(500).optional(),
  hsCode: z.string().max(20).optional(),
  transportMode: z.string().max(60).optional(),
  surface: z.enum(["compliance", "route", "risk", "inspect"]).default("compliance"),
});

type ShipmentContext = z.infer<typeof ShipmentContextSchema>;

// ---------------------------------------------------------------------------
// In-process cache — keyed by surface + context hash. Demo-grade.
// ---------------------------------------------------------------------------

type CacheEntry = { at: number; value: ContextualWarningResult };
const warningCache = new Map<string, CacheEntry>();

function cacheKey(ctx: ShipmentContext): string {
  return [
    ctx.surface,
    ctx.origin ?? "",
    ctx.destination ?? "",
    ctx.productDescription ?? "",
    ctx.hsCode ?? "",
    ctx.transportMode ?? "",
  ]
    .join("|")
    .toLowerCase();
}

// ---------------------------------------------------------------------------
// Query builder — turns shipment context into a focused NewsAPI query.
// ---------------------------------------------------------------------------

function buildNewsQuery(ctx: ShipmentContext): string {
  // Strategy: build a single broad OR-query that mixes route entities with
  // generic supply-chain signals. AND-joins are too strict — NewsAPI often
  // returns zero hits — and our LLM filter downstream picks the relevant
  // articles anyway. Better to fan wide and let Gemini judge.
  const terms: string[] = [];

  // Strip "Country, City" qualifiers — NewsAPI matches better on the bare
  // city/region name.
  const clean = (s: string) => s.split(",")[0]!.trim();
  if (ctx.origin) terms.push(`"${clean(ctx.origin)}"`);
  if (ctx.destination) terms.push(`"${clean(ctx.destination)}"`);

  // Generic supply-chain disruption signals — angles a logistics operator
  // actually cares about. Two-word phrases get quoted so NewsAPI keeps them
  // as a phrase, not separate tokens.
  terms.push(
    `"shipping disruption"`,
    `"port congestion"`,
    `"supply chain"`,
    `"trade tariff"`,
    `"sanctions"`,
    `"freight"`,
    `"customs"`,
  );

  return terms.join(" OR ");
}

// ---------------------------------------------------------------------------
// NewsAPI types and fetch
// ---------------------------------------------------------------------------

interface RawArticle {
  title?: string;
  description?: string;
  url?: string;
  publishedAt?: string;
  source?: { name?: string } | null;
}

interface FetchedArticle {
  title: string;
  description: string;
  url: string;
  publishedAt: string;
  source: string;
}

async function fetchNews(query: string): Promise<FetchedArticle[]> {
  const apiKey = process.env.NEWS_API_KEY;
  if (!apiKey || apiKey === "smoke-test-news-key") {
    // Operator-friendly: surface clearly rather than throwing — the demo
    // should still render a "news unavailable" state without a hard error.
    return [];
  }

  try {
    const r = await axios.get("https://newsapi.org/v2/everything", {
      params: {
        q: query,
        searchIn: "title,description",
        sortBy: "publishedAt",
        pageSize: MAX_ARTICLES,
        language: "en",
        apiKey,
      },
      timeout: NEWS_TIMEOUT_MS,
    });

    const raw = ((r.data as { articles?: unknown }).articles ?? []) as RawArticle[];

    return raw
      .filter(
        (a) =>
          a &&
          typeof a === "object" &&
          a.title &&
          a.title !== "[Removed]" &&
          a.url !== "https://removed.com",
      )
      .slice(0, MAX_ARTICLES)
      .map((a) => ({
        title: a.title ?? "Untitled",
        description: a.description ?? "",
        url: a.url ?? "#",
        publishedAt: a.publishedAt ?? new Date().toISOString(),
        source: a.source?.name ?? "Unknown",
      }));
  } catch {
    // Demo-safe: a transient NewsAPI failure shouldn't blow up the
    // compliance/route flow that called us. Return empty + let the UI
    // render the no-news fallback.
    return [];
  }
}

// ---------------------------------------------------------------------------
// Gemini analysis
// ---------------------------------------------------------------------------

interface AnalyzedWarning {
  headline: string;
  source: string;
  url: string;
  severity: "info" | "warn" | "block";
  reasoning: string;
  suggestedAction: string;
}

interface ContextualWarningResult {
  query: string;
  articlesConsidered: number;
  warnings: AnalyzedWarning[];
  overallSeverity: "info" | "warn" | "block" | "none";
  decisionAltered: boolean;
  summary: string;
}

function emptyResult(query: string, summary: string): ContextualWarningResult {
  return {
    query,
    articlesConsidered: 0,
    warnings: [],
    overallSeverity: "none",
    decisionAltered: false,
    summary,
  };
}

async function analyzeWithGemini(
  ctx: ShipmentContext,
  articles: FetchedArticle[],
): Promise<ContextualWarningResult> {
  const surface = ctx.surface;

  const articlesText = articles
    .map(
      (a, i) =>
        `[${i + 1}] (${a.source}) ${a.title}\n    ${a.description}\n    URL: ${a.url}`,
    )
    .join("\n\n");

  const contextText = [
    ctx.origin ? `Origin: ${ctx.origin}` : null,
    ctx.destination ? `Destination: ${ctx.destination}` : null,
    ctx.productDescription ? `Product: ${ctx.productDescription}` : null,
    ctx.hsCode ? `HS Code: ${ctx.hsCode}` : null,
    ctx.transportMode ? `Transport: ${ctx.transportMode}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const surfaceFocus =
    surface === "route"
      ? "route safety, port congestion, rerouting, transit time"
      : surface === "risk"
      ? "fraud, tampering, theft, regulatory enforcement"
      : surface === "inspect"
      ? "tampering, counterfeit, container theft at named ports"
      : "trade compliance, tariffs, sanctions, customs holds, licensing";

  const prompt = `You are a supply-chain intelligence assistant. The user is about to make a ${surface} decision for a shipment. Below is the shipment context and recent news. Decide whether ANY article materially alters the decision.

SHIPMENT CONTEXT
${contextText || "(no specific shipment context provided)"}

RELEVANT NEWS (recent)
${articlesText || "(no articles found)"}

DECISION FOCUS: ${surfaceFocus}

Return ONLY JSON in this exact shape — no markdown, no explanation:
{
  "warnings": [
    {
      "articleIndex": <1-based index of the article above>,
      "severity": "info" | "warn" | "block",
      "reasoning": "<one sentence: WHY this article matters for THIS shipment>",
      "suggestedAction": "<one sentence: concrete action the user should take>"
    }
  ],
  "decisionAltered": <true if any warning is "warn" or "block">,
  "overallSeverity": "info" | "warn" | "block" | "none",
  "summary": "<one short sentence: what changed in the user's plan, or 'No material news impact.'>"
}

Rules:
- Include ONLY articles that genuinely affect this shipment. If none do, return an empty warnings array, overallSeverity "none", decisionAltered false.
- severity "block" means do not proceed. "warn" means proceed with mitigation. "info" means awareness only.
- Maximum 4 warnings, ordered by severity.
- Every string ≤ 25 words. No markdown.`;

  try {
    const response = await Promise.race([
      genai().models.generateContent({ model: FLASH_MODEL, contents: prompt }),
      new Promise<never>((_, rej) =>
        setTimeout(() => rej(new Error("Gemini timeout")), GEMINI_TIMEOUT_MS),
      ),
    ]);

    const raw = ((response as { text?: string }).text ?? "").trim();
    const jsonText = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");

    let parsed: {
      warnings?: Array<{
        articleIndex?: number;
        severity?: string;
        reasoning?: string;
        suggestedAction?: string;
      }>;
      decisionAltered?: boolean;
      overallSeverity?: string;
      summary?: string;
    };
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      return emptyResult(
        buildNewsQuery(ctx),
        "AI response could not be parsed — proceeding without news warnings.",
      );
    }

    const warnings: AnalyzedWarning[] = (parsed.warnings ?? [])
      .slice(0, 4)
      .map((w) => {
        const idx = (w.articleIndex ?? 0) - 1;
        const article = articles[idx];
        if (!article) return null;
        const sev: AnalyzedWarning["severity"] =
          w.severity === "block" || w.severity === "warn" || w.severity === "info"
            ? w.severity
            : "info";
        return {
          headline: article.title,
          source: article.source,
          url: article.url,
          severity: sev,
          reasoning: w.reasoning ?? "Relevant to this shipment.",
          suggestedAction: w.suggestedAction ?? "Review before proceeding.",
        };
      })
      .filter((w): w is AnalyzedWarning => w !== null);

    const overallSeverity: ContextualWarningResult["overallSeverity"] =
      warnings.some((w) => w.severity === "block")
        ? "block"
        : warnings.some((w) => w.severity === "warn")
        ? "warn"
        : warnings.length > 0
        ? "info"
        : "none";

    return {
      query: buildNewsQuery(ctx),
      articlesConsidered: articles.length,
      warnings,
      overallSeverity,
      decisionAltered:
        parsed.decisionAltered === true ||
        overallSeverity === "warn" ||
        overallSeverity === "block",
      summary: parsed.summary ?? "No material news impact.",
    };
  } catch (err) {
    // Demo-safe: never let Gemini failure crash the parent flow.
    return emptyResult(
      buildNewsQuery(ctx),
      `News analysis unavailable (${(err as Error).message}).`,
    );
  }
}

// ---------------------------------------------------------------------------
// Market Insights — types and helpers
// ---------------------------------------------------------------------------

const MarketInsightsInputSchema = z.object({
  subject: z.string().max(300),
  kind: z.enum(["product", "route", "compliance"]),
});

type MarketInsightsInput = z.infer<typeof MarketInsightsInputSchema>;

interface MarketInsightsResult {
  supplyChain: string;
  priceTrends: string;
  logistics: string;
  transportCosts: string;
  bulkTrends: string;
  marketRisks: string;
  articles: Array<{ title: string; source: string; url: string }>;
}

function buildMarketInsightsQuery(input: MarketInsightsInput): string {
  const { subject, kind } = input;
  if (kind === "product") {
    return `"${subject}" supply chain OR market OR pricing OR "trade volume"`;
  }
  if (kind === "route") {
    return `"${subject}" shipping OR "trade lane" OR logistics OR freight OR "port congestion"`;
  }
  // compliance
  return `"${subject}" "trade policy" OR tariffs OR regulation OR sanctions OR customs`;
}

function emptyMarketInsights(): MarketInsightsResult {
  return {
    supplyChain: "No data available.",
    priceTrends: "No data available.",
    logistics: "No data available.",
    transportCosts: "No data available.",
    bulkTrends: "No data available.",
    marketRisks: "No data available.",
    articles: [],
  };
}

async function analyzeMarketInsightsWithGemini(
  input: MarketInsightsInput,
  articles: FetchedArticle[],
): Promise<MarketInsightsResult> {
  const articlesText =
    articles.length > 0
      ? articles
          .map(
            (a, i) =>
              `[${i + 1}] (${a.source}) ${a.title}\n    ${a.description}\n    URL: ${a.url}`,
          )
          .join("\n\n")
      : "(no articles — use general world knowledge)";

  const kindFocus =
    input.kind === "product"
      ? "product supply chain, manufacturing, and pricing dynamics"
      : input.kind === "route"
      ? "shipping lane operations, freight costs, and logistics capacity"
      : "trade policy, regulatory compliance, and tariff environment";

  const prompt = `You are a market intelligence analyst specializing in ${kindFocus}. Analyze the subject and any available news to produce concise market insights.

SUBJECT: ${input.subject}
KIND: ${input.kind}

RECENT NEWS:
${articlesText}

Return ONLY JSON in this exact shape — no markdown, no explanation:
{
  "supplyChain": "<one short sentence about supply chain status or dynamics>",
  "priceTrends": "<one short sentence about current price trends or pressures>",
  "logistics": "<one short sentence about logistics conditions or capacity>",
  "transportCosts": "<one short sentence about transport cost trends>",
  "bulkTrends": "<one short sentence about bulk transaction or volume trends>",
  "marketRisks": "<one short sentence about key market risks or uncertainties>",
  "topArticleIndexes": [<1-based indexes of 2-3 most relevant articles, or [] if none>]
}

Rules:
- Every string value ≤ 30 words. No markdown, no bullet points, no line breaks.
- Base insights on the news where possible; fill gaps from general world knowledge.
- Be specific and actionable, not generic.`;

  try {
    const response = await Promise.race([
      genai().models.generateContent({ model: FLASH_MODEL, contents: prompt }),
      new Promise<never>((_, rej) =>
        setTimeout(() => rej(new Error("Gemini timeout")), GEMINI_TIMEOUT_MS),
      ),
    ]);

    const raw = ((response as { text?: string }).text ?? "").trim();
    const jsonText = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");

    let parsed: {
      supplyChain?: string;
      priceTrends?: string;
      logistics?: string;
      transportCosts?: string;
      bulkTrends?: string;
      marketRisks?: string;
      topArticleIndexes?: number[];
    };
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      return emptyMarketInsights();
    }

    const topIndexes = (parsed.topArticleIndexes ?? []).slice(0, 3);
    const selectedArticles = topIndexes
      .map((idx) => articles[idx - 1])
      .filter((a): a is FetchedArticle => !!a)
      .map((a) => ({ title: a.title, source: a.source, url: a.url }));

    return {
      supplyChain: parsed.supplyChain ?? "No data available.",
      priceTrends: parsed.priceTrends ?? "No data available.",
      logistics: parsed.logistics ?? "No data available.",
      transportCosts: parsed.transportCosts ?? "No data available.",
      bulkTrends: parsed.bulkTrends ?? "No data available.",
      marketRisks: parsed.marketRisks ?? "No data available.",
      articles: selectedArticles,
    };
  } catch {
    return emptyMarketInsights();
  }
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const newsContextRouter = router({
  /**
   * Public on purpose: surfaces (compliance, routes, risk, inspect) call it
   * during their AI flows. The data is read-only news + LLM analysis with
   * no user-state side effects.
   */
  contextualWarning: publicProcedure
    .input(ShipmentContextSchema)
    .mutation(async ({ input }) => {
      const key = cacheKey(input);
      const cached = warningCache.get(key);
      if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
        return cached.value;
      }

      const query = buildNewsQuery(input);
      const articles = await fetchNews(query);

      if (articles.length === 0) {
        const result = emptyResult(
          query,
          "No recent news found for this shipment route. Decision unaffected.",
        );
        warningCache.set(key, { at: Date.now(), value: result });
        return result;
      }

      const result = await analyzeWithGemini(input, articles);
      warningCache.set(key, { at: Date.now(), value: result });
      return result;
    }),

  /**
   * On-demand market intelligence for any subject (product, trade route,
   * or compliance topic). User-triggered — not auto-fetched.
   */
  marketInsights: publicProcedure
    .input(MarketInsightsInputSchema)
    .mutation(async ({ input }) => {
      const query = buildMarketInsightsQuery(input);
      const articles = await fetchNews(query);
      return analyzeMarketInsightsWithGemini(input, articles);
    }),

  /**
   * internationalRisk — news-grounded geopolitical / logistics risk scoring.
   * Returns risk assessment per region/country based on current news signals.
   */
  internationalRisk: publicProcedure
    .input(
      z.object({
        regions: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ input }) => {
      // Broad supply-chain + geopolitics signal query
      const query =
        "shipping OR port OR trade OR sanctions OR strike OR tariff OR " +
        '"border closure" OR logistics OR freight OR "trade war" OR customs';

      const articles = await fetchNews(query);

      // If no articles, still attempt Gemini analysis with empty articles
      // to get fallback regional risk scores
      const articlesText =
        articles.length > 0
          ? articles
              .map(
                (a, i) =>
                  `[${i + 1}] (${a.source}) ${a.title}\n    ${a.description}`,
              )
              .join("\n\n")
          : "(no articles — use general world knowledge of current geopolitics)";

      const regionsList = input.regions?.join(", ") || "";
      const regionHint = regionsList ? `Focus on: ${regionsList}.` : "";

      const prompt = `You are a geopolitical supply-chain risk analyst. Based on current news and world events, score 8-12 key regions/countries for logistics risk on a 0-100 scale.

RECENT NEWS:
${articlesText}

${regionHint}

Return ONLY JSON in this exact shape — no markdown, no explanation:
{
  "regions": [
    {
      "region": "<country or region name>",
      "riskScore": <integer 0-100>,
      "rationale": "<one sentence: why this risk score, citing a specific news signal or geopolitical factor>",
      "topHeadline": "<short headline from articles if applicable, or empty string>"
    }
  ]
}

Rules:
- Score 8-12 regions. Include major trade hubs and any mentioned in news.
- Risk scale: 0-34 low, 35-65 medium, 66-100 high.
- Rationale must cite specific news or known geopolitical events.
- Every rationale and headline ≤ 20 words, no markdown.
- topHeadline is empty string if no articles or none apply to that region.`;

      try {
        const response = await Promise.race([
          genai().models.generateContent({ model: FLASH_MODEL, contents: prompt }),
          new Promise<never>((_, rej) =>
            setTimeout(() => rej(new Error("Gemini timeout")), GEMINI_TIMEOUT_MS),
          ),
        ]);

        const raw = ((response as { text?: string }).text ?? "").trim();
        const jsonText = raw
          .replace(/^```(?:json)?\s*/i, "")
          .replace(/\s*```$/i, "");

        let parsed: {
          regions?: Array<{
            region?: string;
            riskScore?: number;
            rationale?: string;
            topHeadline?: string;
          }>;
        };
        try {
          parsed = JSON.parse(jsonText);
        } catch {
          // Fallback: return empty regions with timestamp
          return {
            regions: [],
            updatedAt: new Date().toISOString(),
          };
        }

        const regions = (parsed.regions ?? [])
          .filter(
            (r): r is {
              region: string;
              riskScore: number;
              rationale: string;
              topHeadline: string;
            } =>
              typeof r.region === "string" &&
              typeof r.riskScore === "number" &&
              typeof r.rationale === "string" &&
              typeof r.topHeadline === "string"
          )
          .map((r) => ({
            region: r.region.slice(0, 100),
            riskScore: Math.min(100, Math.max(0, Math.round(r.riskScore))),
            rationale: r.rationale.slice(0, 300),
            topHeadline: r.topHeadline.slice(0, 200),
          }));

        return {
          regions,
          updatedAt: new Date().toISOString(),
        };
      } catch (err) {
        // Graceful fallback on timeout or network error
        return {
          regions: [],
          updatedAt: new Date().toISOString(),
        };
      }
    }),
});
