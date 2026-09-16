import { existsSync, readFileSync, statSync } from "fs";
import { basename } from "path";

export const ARTICLE_SOURCE_DOCUMENT_MAX_BYTES = 16 * 1024 * 1024;

function byteSize(value) {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

function parseTemplateObject(contentsSection) {
  const contents = {};
  const keyValueRegex = /["']([^"']+)["']\s*:\s*`/g;
  const keys = [];
  let match;

  while ((match = keyValueRegex.exec(contentsSection)) !== null) {
    keys.push({
      key: match[1],
      startIndex: match.index + match[0].length,
    });
  }

  for (const entry of keys) {
    let endIndex = entry.startIndex;
    let interpolationDepth = 0;

    while (endIndex < contentsSection.length) {
      const char = contentsSection[endIndex];
      if (char === "\\" && contentsSection[endIndex + 1] === "`") {
        endIndex += 2;
        continue;
      }
      if (char === "`" && interpolationDepth === 0) break;
      if (char === "$" && contentsSection[endIndex + 1] === "{") {
        interpolationDepth++;
        endIndex += 2;
        continue;
      }
      if (char === "}" && interpolationDepth > 0) {
        interpolationDepth--;
      }
      endIndex++;
    }

    contents[entry.key] = contentsSection
      .slice(entry.startIndex, endIndex)
      .replace(/\\`/g, "`")
      .replace(/\\\$/g, "$");
  }

  return contents;
}

export function parseLocalArticleSourceModule(sourceText, slug = "unknown") {
  const nameMatch = sourceText.match(/export const substanceName(?:\s*:\s*string)?\s*=\s*["']([^"']+)["']/);
  const substanceName = nameMatch ? nameMatch[1] : slug;

  const sourcesMatch = sourceText.match(/export const sources(?:\s*:\s*[^=]+)?\s*=\s*(\[[\s\S]*?\]);/);
  if (!sourcesMatch) {
    return { slug, substanceName, sources: [], contents: {} };
  }

  let sources;
  try {
    sources = JSON.parse(sourcesMatch[1]);
  } catch (error) {
    throw new Error(`Failed to parse sources for ${slug}: ${error.message}`);
  }

  const contentsStart = sourceText.indexOf("export const contents");
  const contents = contentsStart === -1 ? {} : parseTemplateObject(sourceText.slice(contentsStart));
  return { slug, substanceName, sources, contents };
}

export function loadLocalArticleSourceDocument(filePath, slug = basename(filePath, ".ts")) {
  if (!existsSync(filePath)) return null;
  const parsed = parseLocalArticleSourceModule(readFileSync(filePath, "utf-8"), slug);
  return normalizeArticleSourceDocument(parsed, { adapter: "local-file" });
}

export function normalizeArticleSourceDocument(input, options = {}) {
  const slug = input?.slug ?? options.slug;
  const normalized = {
    slug,
    substanceName: input?.substanceName ?? slug,
    sources: Array.isArray(input?.sources) ? input.sources.map(normalizeSourceMetadata) : [],
    contents: normalizeContents(input?.contents),
  };

  validateArticleSourceDocument(normalized, options);
  return normalized;
}

function normalizeSourceMetadata(source) {
  return {
    id: String(source.id),
    fileName: source.fileName ?? "",
    displayName: source.displayName ?? source.id,
    size: Number(source.size ?? 0),
    tokens: Number(source.tokens ?? 0),
  };
}

function normalizeContents(contents) {
  if (!contents || typeof contents !== "object" || Array.isArray(contents)) return {};

  return Object.fromEntries(
    Object.entries(contents).map(([key, value]) => [key, typeof value === "string" ? value : String(value ?? "")]),
  );
}

export function validateArticleSourceDocument(doc, options = {}) {
  const errors = [];
  if (!doc || typeof doc !== "object") errors.push("document must be an object");
  if (!doc?.slug) errors.push("slug is required");
  if (!doc?.substanceName) errors.push("substanceName is required");
  if (!Array.isArray(doc?.sources)) errors.push("sources must be an array");

  const sourceIds = new Set();
  for (const source of doc?.sources ?? []) {
    if (!source.id) {
      errors.push("source id is required");
      continue;
    }
    if (sourceIds.has(source.id)) errors.push(`duplicate source id: ${source.id}`);
    sourceIds.add(source.id);
  }

  const contentKeys = new Set(Object.keys(doc?.contents ?? {}));
  for (const sourceId of sourceIds) {
    if (!contentKeys.has(sourceId)) errors.push(`missing content for source id: ${sourceId}`);
  }
  for (const key of contentKeys) {
    if (!sourceIds.has(key)) errors.push(`extra content for source id: ${key}`);
  }

  if (errors.length > 0 && options.allowInvalid !== true) {
    const adapter = options.adapter ? `${options.adapter} ` : "";
    throw new Error(`Invalid ${adapter}article source document${doc?.slug ? ` (${doc.slug})` : ""}: ${errors.join("; ")}`);
  }

  return { valid: errors.length === 0, errors };
}

export function getArticleSourceDocumentSizeBytes(doc) {
  return byteSize({
    slug: doc.slug,
    substanceName: doc.substanceName,
    sources: doc.sources,
    contents: doc.contents,
  });
}

export function getLocalArticleSourceFileSize(filePath) {
  return existsSync(filePath) ? statSync(filePath).size : 0;
}

export function isArticleSourceDocumentTooLarge(doc, maxBytes = ARTICLE_SOURCE_DOCUMENT_MAX_BYTES) {
  return getArticleSourceDocumentSizeBytes(doc) > maxBytes;
}

export function toDataArticleSourcePayload(doc) {
  return {
    slug: doc.slug,
    substanceName: doc.substanceName,
    sources: doc.sources,
    contents: doc.contents,
  };
}
