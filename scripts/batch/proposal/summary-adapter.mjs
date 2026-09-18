import { normalizeArticleSourceDocument } from "../../article-source-documents/contract.mjs";
import { sectionKeyToPromptKey } from "../../lib/prompt-registry.mjs";
import { buildGenericSourceSections } from "../lib/source-material-resolver.mjs";
import { CONFIG } from "../summary/config.mjs";
import { createOpenRouterCaller } from "../summary/openrouter.mjs";
import { parseGeneratedSummary } from "../summary/parsing.mjs";
import {
  buildGenericSourceUserMessage,
  buildSummaryQuoteUserMessage,
  truncateContent,
} from "../summary/source-material.mjs";
import { sha256Text } from "./core.mjs";

const SUMMARY_ADAPTER_VERSION = "summary-proposal-adapter-v1"

function sourceArticleContext(article) {
  return {
    title: article.title,
    classification: {
      psychoactive_class: article.classification?.psychoactive_class ?? [],
      chemical_class: article.classification?.chemical_class ?? [],
    },
  };
}

function buildGenericExcerptProvenance(sourceDoc, config) {
  const excerpts = [];
  let totalChars = 0;

  for (const source of sourceDoc.sources) {
    const rawContent = sourceDoc.contents[source.id];
    if (typeof rawContent !== "string" || !rawContent.trim()) continue;

    const remaining = config.maxGenericSourceChars - totalChars;
    if (remaining <= 0) break;
    const maxChars = Math.min(config.maxCharsPerSource, remaining);
    const included = truncateContent(rawContent, maxChars);
    excerpts.push({
      source,
      rawContent,
      rawContentHash: sha256Text(rawContent),
      includedContent: included.content,
      includedContentHash: sha256Text(included.content),
      truncated: included.truncated,
      maxChars,
    });
    totalChars += included.content.length;
  }

  return excerpts;
}

export async function loadSummaryProposalInputs({
  sourceClient,
  api,
  slug,
  sourceArticle,
  config = CONFIG,
}) {
  const promptKey = sectionKeyToPromptKey("summary");
  const promptRecord = await sourceClient.query(api.prompts.getByKey, { key: promptKey });
  if (!promptRecord || typeof promptRecord.content !== "string") {
    throw new Error(`${promptKey} prompt not found in source Postgres deployment.`);
  }

  const quoteRecord = await sourceClient.query(api.quotes.getBySlugAndSection, {
    slug,
    section: "summary",
  });

  if (quoteRecord) {
    if (typeof quoteRecord.content !== "string" || !quoteRecord.content.trim()) {
      throw new Error("Summary quote doc exists but has no content.");
    }
    return {
      promptKey,
      promptRecord,
      systemMessage: promptRecord.content,
      userMessage: buildSummaryQuoteUserMessage(sourceArticle, quoteRecord.content),
      sourceArticleContext: sourceArticleContext(sourceArticle),
      sourceMaterial: {
        kind: "quotes",
        record: quoteRecord,
        excerpts: [{
          sourceId: "summary-quote",
          includedContent: quoteRecord.content,
          includedContentHash: sha256Text(quoteRecord.content),
          truncated: false,
        }],
      },
    };
  }

  const rawSourceDocument = await sourceClient.query(api.articleSources.getBySlug, {
    slug,
    apiKey: process.env.DATA_ADMIN_TOKEN_ARTICLE_SOURCE_MIGRATION ?? process.env.DATA_ADMIN_KEY,
  });
  if (!rawSourceDocument) {
    throw new Error("No summary quote doc or articleSources doc in source Postgres deployment.");
  }
  const sourceDocument = normalizeArticleSourceDocument(rawSourceDocument, {
    slug,
    adapter: "postgres",
  });
  const excerpts = buildGenericExcerptProvenance(sourceDocument, config);
  if (excerpts.length === 0) {
    throw new Error("No usable generic source content found in Postgres articleSources.");
  }

  // This call deliberately preserves the current summary pipeline's exact message construction.
  buildGenericSourceSections(sourceDocument, config);

  return {
    promptKey,
    promptRecord,
    systemMessage: promptRecord.content,
    userMessage: buildGenericSourceUserMessage(sourceArticle, sourceDocument, config),
    sourceArticleContext: sourceArticleContext(sourceArticle),
    sourceMaterial: {
      kind: "generic_sources",
      record: sourceDocument,
      excerpts,
    },
  };
}

export const summaryProposalAdapter = Object.freeze({
  section: "summary",
  publicationProfile: "summary",
  publicationFields: ["summary"],
  adapterVersion: SUMMARY_ADAPTER_VERSION,
  config: CONFIG,
  loadInputs: loadSummaryProposalInputs,
  parseGeneratedValue: parseGeneratedSummary,
  createOpenRouterCaller,
});
