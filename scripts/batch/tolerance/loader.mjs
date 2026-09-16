import { readFileSync, existsSync } from "fs";

import { createDataClient } from "../../lib/data-client.ts";

import { api } from "../../../lib/postgres/runtime/api.ts"
import { getAllSubstanceDocuments } from "../../lib/data-pagination.mjs";
import { sectionKeyToPromptKey } from "../../lib/prompt-registry.mjs";
import { stripDataMetadata } from "../summary/articles.mjs";
import { CONFIG } from "./cli.mjs";

let postgresClient = null;

export function initPostgresClient(postgresUrl) {
  postgresClient = createDataClient({ target: postgresUrl }).client;
  return postgresClient;
}

function getPostgresClient() {
  if (!postgresClient) {
    throw new Error("Postgres client has not been initialized");
  }
  return postgresClient;
}

export async function loadArticlesFromPostgres(client = getPostgresClient()) {
  const articles = await getAllSubstanceDocuments(client, api.substanceIndex.getFullDocumentPage);
  return articles.map(stripDataMetadata);
}

export async function loadToleranceQuoteSlugs() {
  const metadata = await getPostgresClient().query(api.quotes.getAllMetadata, {});
  return new Set(
    metadata
      .filter((quote) => quote.section === "tolerance")
      .map((quote) => quote.slug),
  );
}

export async function loadToleranceQuotes(slug) {
  try {
    const quote = await getPostgresClient().query(api.quotes.getBySlugAndSection, {
      slug,
      section: "tolerance",
    });
    return quote?.content ?? null;
  } catch (error) {
    console.error(`  Error loading quotes for ${slug}:`, error.message);
    return null;
  }
}

export async function loadPromptFromPostgres() {
  const promptKey = sectionKeyToPromptKey("tolerance");
  const prompt = await getPostgresClient().query(api.prompts.getByKey, { key: promptKey });
  if (prompt) {
    return prompt.content;
  }

  if (!existsSync(CONFIG.promptFallbackFile)) {
    throw new Error(`${promptKey} prompt not found in Postgres or local fallback.`);
  }
  return readFileSync(CONFIG.promptFallbackFile, "utf-8");
}
