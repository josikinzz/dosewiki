import { normalizeArticleSourceDocument } from "../../article-source-documents/contract.mjs";

export function truncateSourceContent(content, maxChars, truncationMessage = "[Source content truncated for batch generation]") {
  if (content.length <= maxChars) return { content, truncated: false };
  return {
    content: `${content.slice(0, maxChars)}\n\n${truncationMessage}`,
    truncated: true,
  };
}

export async function resolveQuoteSourceMaterial({
  slug,
  loadQuotes,
  buildUserMessage,
  missingReason,
  emptyReason = missingReason,
  materialType = "quotes",
  readyStatus = "ready",
}) {
  const quotes = await loadQuotes(slug);
  if (typeof quotes !== "string" || !quotes.trim()) {
    return { slug, status: "skipped", reason: quotes ? emptyReason : missingReason };
  }

  return {
    slug,
    status: readyStatus,
    materialType,
    userMessage: buildUserMessage(quotes),
  };
}

export function createDryRunResultFromSourceMaterial(sourceMaterial, title) {
  if (sourceMaterial.status === "ready") {
    return {
      slug: sourceMaterial.slug,
      title,
      status: "dry-run",
      reason: null,
      sourceMaterial: sourceMaterial.materialType,
      tokens: 0,
    };
  }

  return {
    slug: sourceMaterial.slug,
    title,
    status: "would-skip",
    reason: sourceMaterial.reason,
    sourceMaterial: sourceMaterial.materialType ?? null,
    tokens: 0,
  };
}

export function resolveLocalSourceFileMaterial({
  slug,
  loadSourceFile,
  buildUserMessage,
  missingReason = "No source file",
  emptySourcesReason = "No sources in file",
  materialType = "local_source_file",
}) {
  const sourceData = loadSourceFile(slug);
  if (!sourceData) {
    return { slug, status: "skipped", reason: missingReason };
  }
  if (!Array.isArray(sourceData.sources) || sourceData.sources.length === 0) {
    return { slug, status: "skipped", reason: emptySourcesReason };
  }

  return {
    slug,
    status: "ready",
    materialType,
    sourceData,
    userMessage: buildUserMessage(sourceData),
  };
}

export function buildGenericSourceSections(sourceDoc, config) {
  const normalizedDoc = normalizeArticleSourceDocument(sourceDoc, {
    slug: sourceDoc.slug ?? "article-source",
    adapter: "summary",
  });
  const sections = [];
  let totalChars = 0;
  let truncatedSources = 0;

  for (const source of normalizedDoc.sources) {
    const rawContent = normalizedDoc.contents[source.id];
    if (typeof rawContent !== "string" || !rawContent.trim()) {
      continue;
    }

    const remaining = config.maxGenericSourceChars - totalChars;
    if (remaining <= 0) break;

    const maxChars = Math.min(config.maxCharsPerSource, remaining);
    const { content, truncated } = truncateSourceContent(rawContent, maxChars);
    if (truncated) truncatedSources++;

    sections.push(
      `## Source: ${source.displayName}\nSource ID: ${source.id}\n\n\`\`\`markdown\n${content}\n\`\`\``,
    );
    totalChars += content.length;
  }

  if (sections.length === 0) {
    throw new Error("No usable generic source content found in Postgres articleSources.");
  }

  return { sections, truncatedSources };
}
