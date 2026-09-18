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

export async function loadHistoryCultureQuotes(slug) {
  try {
    const quote = await getPostgresClient().query(api.quotes.getBySlugAndSection, {
      slug,
      section: "history_culture",
    });
    return quote?.content ?? null;
  } catch (error) {
    console.error(`  Error loading quotes for ${slug}:`, error.message);
    return null;
  }
}

export async function loadPromptFromPostgres() {
  const promptKey = sectionKeyToPromptKey("history_culture");
  const prompt = await getPostgresClient().query(api.prompts.getByKey, { key: promptKey });
  if (!prompt) {
    throw new Error(`${promptKey} prompt not found in Postgres. Run the migration script first.`);
  }
  return prompt.content;
}
