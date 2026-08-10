import { readFileSync, existsSync } from "fs";

import { ConvexHttpClient } from "convex/browser";

import { api } from "../../../convex/_generated/api.js";
import { getAllSubstanceDocuments } from "../../lib/convex-pagination.mjs";
import { sectionKeyToPromptKey } from "../../lib/prompt-registry.mjs";
import { stripConvexMetadata } from "../summary/articles.mjs";
import { CONFIG } from "./cli.mjs";

let convexClient = null;

export function initConvexClient(convexUrl) {
  convexClient = new ConvexHttpClient(convexUrl);
  return convexClient;
}

export function getConvexClient() {
  if (!convexClient) {
    throw new Error("Convex client has not been initialized");
  }
  return convexClient;
}

export async function loadArticlesFromConvex(client = getConvexClient()) {
  const articles = await getAllSubstanceDocuments(client, api.substanceIndex.getFullDocumentPage);
  return articles.map(stripConvexMetadata);
}

export async function loadToleranceQuoteSlugs() {
  const metadata = await getConvexClient().query(api.quotes.getAllMetadata, {});
  return new Set(
    metadata
      .filter((quote) => quote.section === "tolerance")
      .map((quote) => quote.slug),
  );
}

export async function loadToleranceQuotes(slug) {
  try {
    const quote = await getConvexClient().query(api.quotes.getBySlugAndSection, {
      slug,
      section: "tolerance",
    });
    return quote?.content ?? null;
  } catch (error) {
    console.error(`  Error loading quotes for ${slug}:`, error.message);
    return null;
  }
}

export async function loadPromptFromConvex() {
  const promptKey = sectionKeyToPromptKey("tolerance");
  const prompt = await getConvexClient().query(api.prompts.getByKey, { key: promptKey });
  if (prompt) {
    return prompt.content;
  }

  if (!existsSync(CONFIG.promptFallbackFile)) {
    throw new Error(`${promptKey} prompt not found in Convex or local fallback.`);
  }
  return readFileSync(CONFIG.promptFallbackFile, "utf-8");
}
