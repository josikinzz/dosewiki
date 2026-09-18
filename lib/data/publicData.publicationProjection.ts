import type { PublicEffectIndexArticle } from "./publicData.shared";
import { normalizeVCodeContent } from "../../src/features/effects/vcode/normalize";
function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function normalizePublicEffectIndexArticle(record: unknown): PublicEffectIndexArticle | null {
  // Second line of defence behind the Postgres-side draft filter in
  // `effectIndexArticles.getAll`/`getBySlug`: every public list and detail read
  // funnels through this normalizer, so a draft cannot reach a route loader
  // even if it were served by a stale deployment of those queries.
  if (isRecord(record) && record.status === "draft") {
    return null;
  }

  if (
    !isRecord(record) ||
    typeof record.slug !== "string" ||
    typeof record.title !== "string" ||
    typeof record.publication_status !== "string" ||
    !Array.isArray(record.tags) ||
    !record.tags.every((tag) => typeof tag === "string") ||
    typeof record.body_raw !== "string"
  ) {
    return null;
  }

  // A markdown-bodied row has no VCode at all, and parsing its `body_raw` as
  // VCode would hand the renderer a bogus AST it would then prefer over the
  // Markdown source. Only the VCode path derives an AST.
  const bodyFormat =
    record.bodyFormat === "markdown" || record.bodyFormat === "vcode"
      ? record.bodyFormat
      : undefined;
  const bodyAst =
    bodyFormat === "markdown"
      ? undefined
      : normalizeVCodeContent(record.body_ast, record.body_raw);
  const article: PublicEffectIndexArticle = {
    slug: record.slug,
    title: record.title,
    tags: record.tags,
    publication_status: record.publication_status,
    body_raw: record.body_raw,
  };

  if (typeof record.featured === "boolean") article.featured = record.featured;
  if (typeof record.shortDescription === "string") article.shortDescription = record.shortDescription;
  if (typeof record.publicationDate === "string") article.publicationDate = record.publicationDate;
  if (bodyAst) article.body_ast = bodyAst;
  if (bodyFormat) article.bodyFormat = bodyFormat;
  if (record.kind === "article" || record.kind === "blog") article.kind = record.kind;
  if (typeof record.teaser === "string") article.teaser = record.teaser;
  if (typeof record.coverImageUrl === "string") article.coverImageUrl = record.coverImageUrl;
  if (Array.isArray(record.authors) && record.authors.every((author) => typeof author === "string")) {
    article.authors = record.authors;
  }
  if (
    Array.isArray(record.authorProfileKeys) &&
    record.authorProfileKeys.every((key) => typeof key === "string")
  ) {
    article.authorProfileKeys = record.authorProfileKeys;
  }
  if (Array.isArray(record.citations)) {
    article.citations = record.citations.flatMap((citation) =>
      isRecord(citation) && typeof citation.url === "string" && typeof citation.text === "string"
        ? [{ url: citation.url, text: citation.text }]
        : [],
    );
  }

  return article;
}
