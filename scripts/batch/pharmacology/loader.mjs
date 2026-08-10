import { ConvexHttpClient } from "convex/browser";

import { api } from "../../../convex/_generated/api.js";
import { getAllSubstanceDocuments } from "../../lib/convex-pagination.mjs";
import { sectionKeyToPromptKey } from "../../lib/prompt-registry.mjs";
import { stripConvexMetadata } from "./lib.mjs";

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

export async function loadArticlesFromConvex() {
  const articles = await getAllSubstanceDocuments(getConvexClient(), api.substanceIndex.getFullDocumentPage);
  return articles.map(stripConvexMetadata);
}

export async function loadPharmacologyQuoteSlugs() {
  const metadata = await getConvexClient().query(api.quotes.getAllMetadata, {});
  return new Set(
    metadata
      .filter((quote) => quote.section === "pharmacology")
      .map((quote) => quote.slug),
  );
}

export async function loadPharmacologyQuotes(slug) {
  try {
    const quote = await getConvexClient().query(api.quotes.getBySlugAndSection, {
      slug,
      section: "pharmacology",
    });
    return quote?.content ?? null;
  } catch (error) {
    console.error(`  Error loading quotes for ${slug}:`, error.message);
    return null;
  }
}

export async function loadPromptFromConvex() {
  const promptKey = sectionKeyToPromptKey("pharmacology");
  const prompt = await getConvexClient().query(api.prompts.getByKey, { key: promptKey });

  if (!prompt) {
    throw new Error(`${promptKey} prompt not found in Convex. Run the migration script first.`);
  }

  return prompt.content;
}
