import { readFileSync, existsSync } from "fs";

import { ConvexHttpClient } from "convex/browser";

import { api } from "../../../convex/_generated/api.js";
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

export function loadArticles() {
  if (!existsSync(CONFIG.articlesFile)) {
    throw new Error(`SubstanceIndex.json not found at ${CONFIG.articlesFile}`);
  }
  return JSON.parse(readFileSync(CONFIG.articlesFile, "utf-8"));
}

export async function loadHarmPotentialQuotes(slug) {
  try {
    const quote = await getConvexClient().query(api.quotes.getBySlugAndSection, {
      slug,
      section: "harm_potential",
    });
    return quote?.content ?? null;
  } catch (error) {
    console.error(`  Error loading quotes for ${slug}:`, error.message);
    return null;
  }
}

export async function loadPromptFromConvex() {
  const promptKey = sectionKeyToPromptKey("harm_potential");
  const prompt = await getConvexClient().query(api.prompts.getByKey, { key: promptKey });
  if (!prompt) {
    throw new Error(`${promptKey} prompt not found in Convex. Run the migration script first.`);
  }
  return prompt.content;
}
