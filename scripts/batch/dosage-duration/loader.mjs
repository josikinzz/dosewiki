import { readFileSync, existsSync } from "fs";

import { createDataClient } from "../../lib/data-client.ts";

import { api } from "../../../lib/postgres/runtime/api.ts"
import { getAllSubstanceDocuments } from "../../lib/data-pagination.mjs";
import { sectionKeyToPromptKey } from "../../lib/prompt-registry.mjs";
import { CONFIG } from "./cli.mjs";

let postgresClient = null;

export function initPostgresClient(postgresUrl) {
  postgresClient = createDataClient({ target: postgresUrl }).client;
  return postgresClient;
}

function getPostgresClient() { if (!postgresClient) {
  throw new Error("Postgres client has not been initialized");
}
return postgresClient; }

export async function loadArticles() {
  if (postgresClient) {
    const articles = await getAllSubstanceDocuments(postgresClient, api.substanceIndex.getFullDocumentPage);
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

export async function loadPromptFromPostgres() {
  const promptKey = sectionKeyToPromptKey("dosage_duration");
  try {
    const prompt = await getPostgresClient().query(api.prompts.getByKey, { key: promptKey });
    if (prompt) {
      console.log("  (loaded from Postgres)");
      return prompt.content;
    }
  } catch (error) {
    console.log(`  Postgres query failed: ${error.message}`);
  }

  if (!existsSync(CONFIG.promptFallbackFile)) {
    throw new Error(`${promptKey} prompt not found in Postgres or local file system.`);
  }

  console.log("  (loaded from local file - fallback)");
  return readFileSync(CONFIG.promptFallbackFile, "utf-8");
}
