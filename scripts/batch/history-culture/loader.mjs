import { readFileSync, existsSync } from "fs";

import { createDataClient } from "../../lib/data-client.ts";

import { api } from "../../../convex/_generated/api.js";
import { getAllSubstanceDocuments } from "../../lib/convex-pagination.mjs";
import { sectionKeyToPromptKey } from "../../lib/prompt-registry.mjs";
import { CONFIG } from "./cli.mjs";

let convexClient = null;

export function initConvexClient(convexUrl) {
  convexClient = createDataClient({ target: convexUrl }).client;
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

export async function loadHistoryCultureQuotes(slug) {
  try {
    const quote = await getConvexClient().query(api.quotes.getBySlugAndSection, {
      slug,
      section: "history_culture",
    });
    return quote?.content ?? null;
  } catch (error) {
    console.error(`  Error loading quotes for ${slug}:`, error.message);
    return null;
  }
}

export async function loadPromptFromConvex() {
  const promptKey = sectionKeyToPromptKey("history_culture");
  const prompt = await getConvexClient().query(api.prompts.getByKey, { key: promptKey });
  if (!prompt) {
    throw new Error(`${promptKey} prompt not found in Convex. Run the migration script first.`);
  }
  return prompt.content;
}
