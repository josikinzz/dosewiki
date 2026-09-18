import { createDataClient } from "../../lib/data-client.ts";

import { api } from "../../../lib/postgres/runtime/api.ts"
import { getAllSubstanceDocuments } from "../../lib/data-pagination.mjs";
import { sectionKeyToPromptKey } from "../../lib/prompt-registry.mjs";
import { stripDataMetadata } from "./lib.mjs";

let postgresClient = null;

export function initPostgresClient(postgresUrl) {
  postgresClient = createDataClient({ target: postgresUrl }).client;
  return postgresClient;
}

export function getPostgresClient() {
  if (!postgresClient) {
    throw new Error("Postgres client has not been initialized");
  }
  return postgresClient;
}

export async function loadArticlesFromPostgres(client = getPostgresClient()) {
  const articles = await getAllSubstanceDocuments(client, api.substanceIndex.getFullDocumentPage);
  return articles.map(stripDataMetadata);
}

export async function loadPharmacologyQuoteSlugs() {
  const metadata = await getPostgresClient().query(api.quotes.getAllMetadata, {});
  return new Set(
    metadata
      .filter((quote) => quote.section === "pharmacology")
      .map((quote) => quote.slug),
  );
}

export async function loadPharmacologyQuotes(slug) {
  try {
    const quote = await getPostgresClient().query(api.quotes.getBySlugAndSection, {
      slug,
      section: "pharmacology",
    });
    return quote?.content ?? null;
  } catch (error) {
    console.error(`  Error loading quotes for ${slug}:`, error.message);
    return null;
  }
}

export async function loadPromptFromPostgres() {
  const promptKey = sectionKeyToPromptKey("pharmacology");
  const prompt = await getPostgresClient().query(api.prompts.getByKey, { key: promptKey });

  if (!prompt) {
    throw new Error(`${promptKey} prompt not found in Postgres. Run the migration script first.`);
  }

  return prompt.content;
}
