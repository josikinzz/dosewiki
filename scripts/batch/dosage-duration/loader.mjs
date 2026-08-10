import { readFileSync, existsSync } from "fs";

import { ConvexHttpClient } from "convex/browser";

import { api } from "../../../convex/_generated/api.js";
import { getAllSubstanceDocuments } from "../../lib/convex-pagination.mjs";
import { sectionKeyToPromptKey } from "../../lib/prompt-registry.mjs";
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

export async function loadArticles() {
  if (convexClient) {
    const articles = await getAllSubstanceDocuments(convexClient, api.substanceIndex.getFullDocumentPage);
    return articles.map(({ _id, _creationTime, ...article }) => article);
  }

  if (!existsSync(CONFIG.articlesFile)) {
    throw new Error(`SubstanceIndex.json not found at ${CONFIG.articlesFile}`);
  }
  return JSON.parse(readFileSync(CONFIG.articlesFile, "utf-8"));
}

export function loadDosageDurationQuotes(slug) {
  const quotesPath = `${CONFIG.quotesDir}/${slug}-dosage-duration.md`;
  if (!existsSync(quotesPath)) {
    return null;
  }
  return readFileSync(quotesPath, "utf-8");
}

export function hasQuotesForSlug(slug) {
  return existsSync(`${CONFIG.quotesDir}/${slug}-dosage-duration.md`);
}

export async function loadPromptFromConvex() {
  const promptKey = sectionKeyToPromptKey("dosage_duration");
  try {
    const prompt = await getConvexClient().query(api.prompts.getByKey, { key: promptKey });
    if (prompt) {
      console.log("  (loaded from Convex)");
      return prompt.content;
    }
  } catch (error) {
    console.log(`  Convex query failed: ${error.message}`);
  }

  if (!existsSync(CONFIG.promptFallbackFile)) {
    throw new Error(`${promptKey} prompt not found in Convex or local file system.`);
  }

  console.log("  (loaded from local file - fallback)");
  return readFileSync(CONFIG.promptFallbackFile, "utf-8");
}
