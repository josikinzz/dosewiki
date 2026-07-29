import { CONFIG } from "./config.mjs";
import { getArticleSlug, stripConvexMetadata } from "./articles.mjs";
import { sectionKeyToPromptKey } from "../../lib/prompt-registry.mjs";
import {
  buildGenericSourceSections,
  truncateSourceContent,
} from "../lib/source-material-resolver.mjs";
import { normalizeArticleSourceDocument } from "../../article-source-documents/contract.mjs";

export async function loadPromptFromSource(sourceClient, api) {
  const promptKey = sectionKeyToPromptKey("summary");
  const prompt = await sourceClient.query(api.prompts.getByKey, { key: promptKey });
  if (!prompt) {
    throw new Error(`${promptKey} prompt not found in source Convex deployment.`);
  }
  return prompt.content;
}

export async function loadArticles(client, api) {
  const articles = await client.query(api.substanceIndex.getAll, {});
  return articles.map(stripConvexMetadata);
}

export async function loadSummaryQuoteSlugs(sourceClient, api) {
  const docs = await sourceClient.query(api.quotes.getBySection, { section: "summary" });
  return new Set(docs.map((doc) => doc.slug));
}

export async function loadArticleSourceSlugs(sourceClient, api) {
  const slugs = new Set();
  let cursor = undefined;
  let isDone = false;

  while (!isDone) {
    const result = await sourceClient.query(api.articleSources.getSubstanceList, {
      apiKey: process.env.CONVEX_ADMIN_TOKEN_ARTICLE_SOURCE_MIGRATION ?? process.env.CONVEX_ADMIN_KEY,
      cursor,
      limit: 100,
    });

    for (const item of result.items) {
      slugs.add(item.slug);
    }

    cursor = result.cursor ?? undefined;
    isDone = result.isDone;
  }

  return slugs;
}

export async function loadSummaryQuote(sourceClient, api, slug) {
  return await sourceClient.query(api.quotes.getBySlugAndSection, {
    slug,
    section: "summary",
  });
}

export async function loadArticleSources(sourceClient, api, slug) {
  const sourceDoc = await sourceClient.query(api.articleSources.getBySlug, {
    slug,
    apiKey: process.env.CONVEX_ADMIN_TOKEN_ARTICLE_SOURCE_MIGRATION ?? process.env.CONVEX_ADMIN_KEY,
  });
  return sourceDoc
    ? normalizeArticleSourceDocument(sourceDoc, { slug, adapter: "convex" })
    : null;
}

export function buildSummaryQuoteUserMessage(article, quoteContent) {
  const psychoactiveClass = article.classification?.psychoactive_class || [];
  const chemicalClass = article.classification?.chemical_class || [];

  return `## Substance

**${article.title}**
- Psychoactive class: ${psychoactiveClass.join(", ") || "Unknown"}
- Chemical class: ${chemicalClass.join(", ") || "Unknown"}

## Source Material

Generate the top-level summary using these extracted summary-focused quotes:

${quoteContent}

## Instructions

Generate ONLY valid YAML for the top-level summary field. Do not include aliases, dosage detail, duration detail, detailed pharmacology, or legal detail.`;
}

export function truncateContent(content, maxChars) {
  return truncateSourceContent(content, maxChars);
}

export function buildGenericSourceUserMessage(article, sourceDoc, config = CONFIG) {
  const psychoactiveClass = article.classification?.psychoactive_class || [];
  const chemicalClass = article.classification?.chemical_class || [];
  const { sections, truncatedSources } = buildGenericSourceSections(sourceDoc, config);

  const truncationNote =
    truncatedSources > 0
      ? `\nNote: ${truncatedSources} source section(s) were truncated to stay within batch limits.\n`
      : "";

  return `## Substance

**${article.title}**
- Psychoactive class: ${psychoactiveClass.join(", ") || "Unknown"}
- Chemical class: ${chemicalClass.join(", ") || "Unknown"}
${truncationNote}
## Source Material

Generate the top-level summary using the following source articles:

${sections.join("\n\n---\n\n")}

## Instructions

Generate ONLY valid YAML for the top-level summary field. Do not include aliases, dosage detail, duration detail, detailed pharmacology, or legal detail.`;
}

export async function resolveSourceMaterial({
  article,
  availability,
  loadSummaryQuoteForSlug,
  loadArticleSourcesForSlug,
  config = CONFIG,
}) {
  const slug = getArticleSlug(article);
  const hasQuote = availability.summaryQuoteSlugs.has(slug);
  const hasSourceDoc = availability.articleSourceSlugs.has(slug);

  if (!hasQuote && !hasSourceDoc) {
    return {
      slug,
      status: "skipped",
      reason: "No summary quote doc or articleSources doc in source Convex",
    };
  }

  if (hasQuote) {
    const quote = await loadSummaryQuoteForSlug(slug);
    if (!quote?.content?.trim()) {
      return {
        slug,
        status: "skipped",
        reason: "Summary quote doc exists but has no content",
      };
    }

    return {
      slug,
      status: "ready",
      materialType: "quotes",
      userMessage: buildSummaryQuoteUserMessage(article, quote.content),
    };
  }

  const sourceDoc = await loadArticleSourcesForSlug(slug);
  if (!sourceDoc) {
    return {
      slug,
      status: "skipped",
      reason: "No articleSources doc found",
    };
  }

  return {
    slug,
    status: "ready",
    materialType: "generic_sources",
    userMessage: buildGenericSourceUserMessage(article, sourceDoc, config),
  };
}

export function createSourceMaterialDescription(materialType) {
  return materialType === "quotes" ? "summary quotes" : "generic source articles";
}
