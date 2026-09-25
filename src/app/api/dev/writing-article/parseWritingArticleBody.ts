/**
 * Request-body validation for one Writing row, shared by the admin's direct
 * save (`POST /api/dev/writing-article`) and the proposal route, so an
 * editor's proposal is held to exactly what the admin's save is held to.
 */
import { JsonBodyError } from "@/lib/http/readJsonBody";
import { isValidPublicationDate } from "@/utils/archiveDate";

/** Mirrors `SLUG_PATTERN` in `server/effectIndexArticles.ts`. */
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const TITLE_MAX_LENGTH = 200;
const TEASER_MAX_LENGTH = 500;
const URL_MAX_LENGTH = 2_000;
const BODY_MAX_LENGTH = 400_000;
const MAX_TAGS = 24;
const MAX_AUTHORS = 12;

export type WritingArticleBody = {
  slug?: unknown;
  originalSlug?: unknown;
  expectedRevision?: unknown;
  operationId?: unknown;
  bodyFormat?: unknown;
  kind?: unknown;
  status?: unknown;
  title?: unknown;
  teaser?: unknown;
  coverImageUrl?: unknown;
  body?: unknown;
  tags?: unknown;
  authorProfileKeys?: unknown;
  publicationDate?: unknown;
};

/** The row's content fields: what a proposal carries under `payload.writing`. */
export type ParsedWritingDocument = {
  slug: string;
  bodyFormat: "vcode" | "markdown";
  kind: "article" | "blog";
  status: "draft" | "published";
  title: string;
  teaser: string;
  coverImageUrl: string;
  body: string;
  tags: string[];
  authorProfileKeys: string[];
  publicationDate?: string;
};

export type ParsedWritingArticle = ParsedWritingDocument & {
  /**
   * The slug the editor loaded the row with. When it differs from `slug` the
   * mutation renames that row instead of inserting a second one.
   */
  originalSlug?: string;
  expectedRevision: string;
  operationId: string;
};

function requireSlug(raw: unknown, label = "A valid slug is required"): string {
  const slug = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (!SLUG_PATTERN.test(slug)) {
    throw new JsonBodyError(400, `${label}: lowercase letters, digits and single hyphens.`);
  }
  return slug;
}

function optionalText(raw: unknown, label: string, maxLength: number): string {
  if (raw === undefined || raw === null) {
    return "";
  }
  if (typeof raw !== "string") {
    throw new JsonBodyError(400, `${label} must be a string.`);
  }
  const value = raw.trim();
  if (value.length > maxLength) {
    throw new JsonBodyError(400, `${label} must be ${maxLength} characters or fewer.`);
  }
  return value;
}

function stringList(raw: unknown, label: string, maxItems: number): string[] {
  if (raw === undefined || raw === null) {
    return [];
  }
  if (!Array.isArray(raw)) {
    throw new JsonBodyError(400, `${label} must be an array.`);
  }
  if (raw.length > maxItems) {
    throw new JsonBodyError(400, `${label} may hold at most ${maxItems} entries.`);
  }
  return raw.flatMap((entry) => {
    if (typeof entry !== "string") {
      throw new JsonBodyError(400, `Each entry of ${label} must be a string.`);
    }
    const value = entry.trim();
    return value ? [value] : [];
  });
}

/** The content fields every Writing write carries, validated the same way for both routes. */
export function parseWritingDocument(raw: WritingArticleBody): ParsedWritingDocument {
  const slug = requireSlug(raw.slug);
  if (raw.bodyFormat !== "markdown" && raw.bodyFormat !== "vcode") throw new JsonBodyError(400, "The original writing format is required.");

  if (raw.kind !== "article" && raw.kind !== "blog") {
    throw new JsonBodyError(400, "A writing row must be an article or a blog post.");
  }

  if (raw.status !== "draft" && raw.status !== "published") {
    throw new JsonBodyError(400, "A writing row must be a draft or published.");
  }

  const title = optionalText(raw.title, "The title", TITLE_MAX_LENGTH);
  if (!title) {
    throw new JsonBodyError(400, "The title is required.");
  }

  if (typeof raw.body !== "string") {
    throw new JsonBodyError(400, "The body must be a string.");
  }
  if (raw.body.length > BODY_MAX_LENGTH) {
    throw new JsonBodyError(400, `The body must be ${BODY_MAX_LENGTH} characters or fewer.`);
  }

  // The same refusal the mutation makes, made early so the editor gets a plain
  // sentence back instead of a Postgres error string.
  if (raw.status === "published" && raw.body.trim() === "") {
    throw new JsonBodyError(400, "An empty body cannot be published. Save it as a draft instead.");
  }

  const publicationDate = optionalText(raw.publicationDate, "The publication date", 40);
  if (publicationDate && !isValidPublicationDate(publicationDate)) {
    throw new JsonBodyError(400, "The publication date must be a real calendar day, like 2026-03-14.");
  }

  return {
    slug,
    bodyFormat: raw.bodyFormat,
    kind: raw.kind,
    status: raw.status,
    title,
    teaser: optionalText(raw.teaser, "The teaser", TEASER_MAX_LENGTH),
    coverImageUrl: optionalText(raw.coverImageUrl, "The cover image URL", URL_MAX_LENGTH),
    body: raw.body,
    tags: stringList(raw.tags, "The tags", MAX_TAGS),
    authorProfileKeys: stringList(raw.authorProfileKeys, "The bylines", MAX_AUTHORS),
    publicationDate: publicationDate || undefined,
  };
}

export function parseWritingArticleBody(raw: WritingArticleBody): ParsedWritingArticle {
  const document = parseWritingDocument(raw);
  if (typeof raw.expectedRevision !== "string" || !/^[a-f0-9]{64}$/.test(raw.expectedRevision)) throw new JsonBodyError(400, "Reload this writing document before publishing.");
  if (typeof raw.operationId !== "string" || !/^[a-f0-9-]{36}$/i.test(raw.operationId)) throw new JsonBodyError(400, "A valid publication operation is required.");
  const originalSlug = optionalText(raw.originalSlug, "The original slug", 200);

  return {
    ...document,
    expectedRevision: raw.expectedRevision,
    operationId: raw.operationId,
    originalSlug: originalSlug
      ? requireSlug(originalSlug, "The original slug must be a valid slug")
      : undefined,
  };
}

/**
 * The `writing` entry of a proposal payload, or `null` when the payload
 * carries none. A proposal never renames a row: the slug is the row's key,
 * so a rename goes through an admin's direct save.
 */
export function parseWritingPayload(raw: unknown): ParsedWritingDocument | null {
  if (raw === undefined || raw === null) {
    return null;
  }
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new JsonBodyError(400, "writing must be an object.");
  }
  const body = raw as WritingArticleBody;
  const document = parseWritingDocument(body);
  const originalSlug = optionalText(body.originalSlug, "The original slug", 200);
  if (originalSlug && originalSlug !== document.slug) {
    throw new JsonBodyError(400, "A proposal cannot change a saved entry's slug. Ask an admin to rename it.");
  }
  return document;
}
