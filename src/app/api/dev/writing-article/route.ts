/**
 * Editor write endpoint for one Writing/Blog row (the /dev Writing and Blog tabs).
 *
 *   POST /api/dev/writing-article  { slug, originalSlug?, kind, status, title?, teaser?, … }
 *
 * Same shape as `/api/dev/copy-block`: the browser holds no admin intent token,
 * so the write is delegated here, which checks the editor session and then calls
 * `effectIndexArticles.upsertArticle` with the server's own token plus the
 * actor's email for the audit trail.
 *
 * Two things this route owns that the mutation deliberately does not:
 *
 * 1. **`publication_status`.** The public normalizer
 *    (`normalizePublicEffectIndexArticle`) drops any row whose
 *    `publication_status` is not a string, so a row saved with `status` alone
 *    would be invisible everywhere. The save path derives the legacy field from
 *    `status` and sends both, which is what makes a published row actually
 *    appear.
 * 2. **Cache revalidation.** `PUBLIC_CONVEX_CACHE_TAGS.articles` is expired on
 *    every save, so a publish shows up on `/articles`, `/blog` and the route
 *    plan in seconds rather than at the end of the 15-minute public-data window.
 *    The tag covers both families: dose.wiki blog posts are `effectIndexArticles`
 *    rows and ride the article tag, not the archive's `blog` tag.
 */
import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { api } from "../../../../../convex/_generated/api";
import { PUBLIC_CONVEX_CACHE_TAGS } from "@server/convex/publicData";
import { JsonBodyError } from "@/lib/http/readJsonBody";
import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";

export const runtime = "nodejs";

/** Mirrors `SLUG_PATTERN` in `convex/effectIndexArticles.ts`. */
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const TITLE_MAX_LENGTH = 200;
const TEASER_MAX_LENGTH = 500;
const URL_MAX_LENGTH = 2_000;
const BODY_MAX_LENGTH = 400_000;
const MAX_TAGS = 24;
const MAX_AUTHORS = 12;

type WritingArticleBody = {
  slug?: unknown;
  originalSlug?: unknown;
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

type ParsedWritingArticle = {
  slug: string;
  /**
   * The slug the editor loaded the row with. When it differs from `slug` the
   * mutation renames that row instead of inserting a second one.
   */
  originalSlug?: string;
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

function parseWritingArticleBody(raw: WritingArticleBody): ParsedWritingArticle {
  const slug = requireSlug(raw.slug);

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
  // sentence back instead of a Convex error string.
  if (raw.status === "published" && raw.body.trim() === "") {
    throw new JsonBodyError(400, "An empty body cannot be published. Save it as a draft instead.");
  }

  const publicationDate = optionalText(raw.publicationDate, "The publication date", 40);
  const originalSlug = optionalText(raw.originalSlug, "The original slug", 200);

  return {
    slug,
    originalSlug: originalSlug
      ? requireSlug(originalSlug, "The original slug must be a valid slug")
      : undefined,
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

/**
 * The editor's read side.
 *
 *   GET /api/dev/writing-article            → the slim listing, drafts included
 *   GET /api/dev/writing-article?slug=…     → one whole row, draft body included
 *
 * Both are editor-gated Convex queries, which the browser cannot call directly:
 * the dev shell's Convex client carries no identity, so every editor-only read
 * in this repo is delegated through an `/api/dev` route exactly like this one.
 */
export const GET = protectedRouteOperation<undefined, undefined>({
  auth: "editor",
  rateLimit: "editorSmallWrite",
  capabilities: [{ type: "convexWrite" }],
  unexpectedErrorLabel: "Failed to read writing articles via Next route:",
  unexpectedErrorMessage: "Unable to load the writing articles right now.",
  operation: async ({ actorEmail, convexWrite, request }) => {
    if (!convexWrite) {
      throw new Error("Convex write capability is required.");
    }

    const apiKey =
      convexWrite.getAdminIntentToken?.("editorArticleWrite") ?? convexWrite.adminKey;
    const slug = new URL(request.url).searchParams.get("slug")?.trim();

    if (slug) {
      const article = await convexWrite.client.query(api.effectIndexArticles.getForEditor, {
        apiKey,
        actorEmail,
        slug,
      });

      return NextResponse.json({ ok: true, article });
    }

    const articles = await convexWrite.client.query(api.effectIndexArticles.listForEditor, {
      apiKey,
      actorEmail,
    });

    return NextResponse.json({ ok: true, articles });
  },
});

export const POST = protectedRouteOperation<WritingArticleBody, ParsedWritingArticle>({
  auth: "editor",
  rateLimit: "editorSmallWrite",
  body: {
    maxBytes: 1024 * 1024,
    parse: parseWritingArticleBody,
  },
  capabilities: [{ type: "convexWrite" }],
  unexpectedErrorLabel: "Failed to save a writing article via Next route:",
  unexpectedErrorMessage: "Unable to save that article right now.",
  operation: async ({ actorEmail, body, convexWrite }) => {
    if (!convexWrite) {
      throw new Error("Convex write capability is required.");
    }

    const apiKey =
      convexWrite.getAdminIntentToken?.("editorArticleWrite") ?? convexWrite.adminKey;

    const result = await convexWrite.client.mutation(api.effectIndexArticles.upsertArticle, {
      apiKey,
      actorEmail,
      slug: body.slug,
      originalSlug: body.originalSlug,
      title: body.title,
      kind: body.kind,
      status: body.status,
      // Kept in step with `status` on purpose; see the file header.
      publication_status: body.status === "published" ? "published" : "draft",
      bodyFormat: "markdown",
      body_raw: body.body,
      teaser: body.teaser,
      coverImageUrl: body.coverImageUrl,
      tags: body.tags,
      authorProfileKeys: body.authorProfileKeys,
      publicationDate: body.publicationDate,
    });

    revalidateTag(PUBLIC_CONVEX_CACHE_TAGS.articles, { expire: 0 });

    return NextResponse.json({ ok: true, slug: result.slug, created: result.created });
  },
});
