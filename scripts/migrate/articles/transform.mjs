import { parseRawVCodeContent } from "../../../src/features/effects/vcode/normalize.ts";
import {
  rewriteAssetPath,
  rewriteAssetUrls,
  rewriteInternalLinks,
  rewriteInternalLinkTarget,
} from "../effects/rewrites.mjs";
import { curatedPublicationStatus } from "./curation.mjs";

function normalizePublicationDate(value) {
  if (typeof value === "string" && value.trim()) return value;
  if (typeof value?.$date === "string" && value.$date.trim()) return value.$date;
  return undefined;
}

function normalizeAuthor(value) {
  if (typeof value === "string" && value.trim()) return value;
  if (typeof value?.$oid === "string" && value.$oid.trim()) return value.$oid;
  return null;
}

function normalizeVCodeNode(value, assetMap, path) {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${path}: expected a VCode node or string`);
  }
  if (typeof value.name !== "string" || !value.name.trim()) {
    throw new Error(`${path}: VCode node is missing a name`);
  }

  const properties = Object.fromEntries(
    Object.entries(
      value.properties && typeof value.properties === "object"
        ? value.properties
        : {},
    ).map(([key, propertyValue]) => [key, String(propertyValue ?? "")]),
  );

  if (value.name === "int-link" && properties.to) {
    properties.to = rewriteInternalLinkTarget(properties.to);
  }
  if (properties.src) {
    properties.src = rewriteAssetPath(properties.src, assetMap);
  }

  const rawChildren = value.children == null ? [] : value.children;
  if (!Array.isArray(rawChildren)) {
    throw new Error(`${path}/${value.name}: children must be an array or null`);
  }

  return {
    name: value.name,
    properties,
    children: rawChildren.map((child, index) =>
      normalizeVCodeNode(child, assetMap, `${path}/${value.name}[${index}]`),
    ),
  };
}

/**
 * Misspelled source tags, corrected on the way in.
 *
 * Tags are a grouping key for the articles index, so a typo silently splits one
 * subject into two. The Effect Index dump carries `psychoanautics` on the lucid
 * dreaming article while every sibling article uses `psychonautics`; correcting
 * it here rather than in the dump keeps the archive verbatim and makes the fix
 * survive a re-import.
 */
const TAG_CORRECTIONS = new Map([["psychoanautics", "psychonautics"]]);

function normalizeTags(tags) {
  if (!Array.isArray(tags)) {
    return [];
  }

  const seen = new Set();
  return tags
    .filter((tag) => typeof tag === "string")
    .map((tag) => TAG_CORRECTIONS.get(tag.trim()) ?? tag)
    // A correction can collide with a tag the article already carries.
    .filter((tag) => (seen.has(tag) ? false : seen.add(tag)));
}

function normalizeVCodeAst(parsed, raw, assetMap) {
  if (parsed == null) {
    return parseRawVCodeContent(raw);
  }
  if (typeof parsed === "string") {
    const decoded = JSON.parse(parsed);
    return normalizeVCodeAst(decoded, raw, assetMap);
  }
  if (Array.isArray(parsed)) {
    return parsed.map((node, index) =>
      normalizeVCodeNode(node, assetMap, `body.parsed[${index}]`),
    );
  }
  return normalizeVCodeNode(parsed, assetMap, "body.parsed");
}

function astDepth(value) {
  if (Array.isArray(value)) {
    return 1 + value.reduce((max, item) => Math.max(max, astDepth(item)), 0);
  }
  if (value && typeof value === "object") {
    return 1 + Object.values(value).reduce((max, item) => Math.max(max, astDepth(item)), 0);
  }
  return 0;
}

export function transformArticle(rawArticle, assetMap = new Map()) {
  const issues = [];
  const notes = [];

  if (typeof rawArticle?.slug !== "string" || !rawArticle.slug) {
    throw new Error("Article is missing its source slug");
  }
  if (typeof rawArticle.title !== "string" || !rawArticle.title) {
    throw new Error(`${rawArticle.slug}: article is missing its title`);
  }
  // Publication status comes from the curation list, never from the dump — see
  // scripts/migrate/articles/curation.mjs. This also rejects uncurated slugs.
  const publicationStatus = curatedPublicationStatus(rawArticle.slug);
  if (typeof rawArticle.body?.raw !== "string") {
    throw new Error(`${rawArticle.slug}: article body.raw must be a string`);
  }

  const bodyRaw = rewriteInternalLinks(
    rewriteAssetUrls(rawArticle.body.raw, assetMap),
  );
  let bodyAst;
  try {
    bodyAst = normalizeVCodeAst(rawArticle.body.parsed, bodyRaw, assetMap);
  } catch (error) {
    issues.push(
      `body VCode transform failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  const article = {
    slug: rawArticle.slug,
    title: rawArticle.title,
    tags: normalizeTags(rawArticle.tags),
    publication_status: publicationStatus,
    featured: rawArticle.featured === true,
    body_raw: bodyRaw,
  };

  if (bodyAst) {
    // Postgres rejects documents nested deeper than 16 levels. The public reader
    // re-parses body_raw whenever body_ast is absent, so over-deep ASTs are
    // simply not stored.
    const depth = astDepth(bodyAst);
    if (depth > 16) {
      notes.push(`body_ast omitted: nesting depth ${depth} exceeds the document nesting limit (rendered from body_raw instead)`);
    } else {
      article.body_ast = bodyAst;
    }
  }
  if (typeof rawArticle.short_description === "string") {
    article.shortDescription = rawArticle.short_description;
  }

  const publicationDate = normalizePublicationDate(rawArticle.publication_date);
  if (publicationDate) article.publicationDate = publicationDate;

  const authors = Array.isArray(rawArticle.authors)
    ? rawArticle.authors.map(normalizeAuthor).filter(Boolean)
    : [];
  if (authors.length > 0) article.authors = authors;

  const citations = Array.isArray(rawArticle.citations)
    ? rawArticle.citations.flatMap((citation) =>
        citation &&
        typeof citation.url === "string" &&
        typeof citation.text === "string"
          ? [{ url: citation.url, text: citation.text }]
          : [],
      )
    : [];
  if (citations.length > 0) article.citations = citations;

  return { article, issues, notes };
}
