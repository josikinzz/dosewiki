/**
 * Write endpoint for one Writing/Blog row (the /dev Writing and Blog tabs).
 * The GET reads are editor floor; the POST publishes to the live site with no
 * review step and is admin-only.
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
 * 2. **Cache publication.** Every save publishes the `writing-articles`
 *    identity through the shared seam, which expires
 *    `PUBLIC_DATA_CACHE_TAGS.articles` here and delivers the same identity
 *    to the public deployments, so a publish shows up on `/articles`, `/blog`
 *    and the route plan in seconds rather than at the end of the 15-minute
 *    public-data window. The tag covers both families: dose.wiki blog posts
 *    are `effectIndexArticles` rows and ride the article tag, not the
 *    archive's `blog` tag. An article save also publishes its keyed `library`
 *    identity, which expires the locale mirrors of the article and the index,
 *    and enqueues the `library/<slug>` translation job the refresh cron works.
 */
import { NextResponse } from "next/server";
import { api } from "@server/postgres/runtime/api";
import { LIVE_LOCALE_CODES } from "@server/next/localeHostPolicy";
import type { PublicationTarget } from "@server/next/publicationWire";
import { publishPublicCache } from "@server/next/publishPublicCache";
import { enqueueTranslationJobs } from "@server/translation/segmentStore";
import { JsonBodyError } from "@/lib/http/readJsonBody";
import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
import { contentHash } from "../../../../../lib/proposals/contentHash";

export const runtime = "nodejs";

/** Mirrors `SLUG_PATTERN` in `server/effectIndexArticles.ts`. */
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

type ParsedWritingArticle = {
  slug: string;
  /**
   * The slug the editor loaded the row with. When it differs from `slug` the
   * mutation renames that row instead of inserting a second one.
   */
  originalSlug?: string;
  expectedRevision: string;
  operationId: string;
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
  if (typeof raw.expectedRevision !== "string" || !/^[a-f0-9]{64}$/.test(raw.expectedRevision)) throw new JsonBodyError(400, "Reload this writing document before publishing.");
  if (typeof raw.operationId !== "string" || !/^[a-f0-9-]{36}$/i.test(raw.operationId)) throw new JsonBodyError(400, "A valid publication operation is required.");
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
  const originalSlug = optionalText(raw.originalSlug, "The original slug", 200);

  return {
    slug,
    expectedRevision: raw.expectedRevision,
    operationId: raw.operationId,
    bodyFormat: raw.bodyFormat,
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
 * Both are editor-gated Postgres queries, which the browser cannot call directly:
 * the dev shell's Postgres client carries no identity, so every editor-only read
 * in this repo is delegated through an `/api/dev` route exactly like this one.
 */
export const GET = protectedRouteOperation<undefined, undefined>({
  auth: "editor",
  rateLimit: "editorSmallWrite",
  capabilities: [{ type: "dataWrite" }],
  unexpectedErrorLabel: "Failed to read writing articles via Next route:",
  unexpectedErrorMessage: "Unable to load the writing articles right now.",
  operation: async ({ actorEmail, dataWrite, request }) => {
    if (!dataWrite) {
      throw new Error("Postgres write capability is required.");
    }

    const apiKey =
      dataWrite.getAdminIntentToken?.("editorArticleWrite") ?? dataWrite.adminKey;
    const slug = new URL(request.url).searchParams.get("slug")?.trim();

    if (slug) {
      const article = await dataWrite.client.query(api.effectIndexArticles.getForEditor, {
        apiKey,
        actorEmail,
        slug,
      });

      return NextResponse.json({ ok: true, article });
    }

    const articles = await dataWrite.client.query(api.effectIndexArticles.listForEditor, {
      apiKey,
      actorEmail,
    });

    return NextResponse.json({ ok: true, articles, emptyRevision: contentHash(null) });
  },
});

export const POST = protectedRouteOperation<WritingArticleBody, ParsedWritingArticle>({
  auth: "admin",
  rateLimit: "editorSmallWrite",
  body: {
    maxBytes: 1024 * 1024,
    parse: parseWritingArticleBody,
  },
  capabilities: [{ type: "dataWrite" }],
  unexpectedErrorLabel: "Failed to save a writing article via Next route:",
  unexpectedErrorMessage: "Unable to save that article right now.",
  operation: async ({ actorEmail, body, dataWrite }) => {
    if (!dataWrite) {
      throw new Error("Postgres write capability is required.");
    }

    const apiKey =
      dataWrite.getAdminIntentToken?.("editorArticleWrite") ?? dataWrite.adminKey;

    const result = await dataWrite.client.mutation(api.effectIndexArticles.upsertArticle, {
      apiKey,
      actorEmail,
      slug: body.slug,
      originalSlug: body.originalSlug,
      expectedRevision: body.expectedRevision,
      operationId: body.operationId,
      title: body.title,
      kind: body.kind,
      status: body.status,
      // Kept in step with `status` on purpose; see the file header.
      publication_status: body.status === "published" ? "published" : "draft",
      bodyFormat: body.bodyFormat,
      body_raw: body.body,
      teaser: body.teaser,
      shortDescription: body.teaser,
      coverImageUrl: body.coverImageUrl,
      tags: body.tags,
      authorProfileKeys: body.authorProfileKeys,
      publicationDate: body.publicationDate,
    });

    const targets: PublicationTarget[] = [{ kind: "writing-articles" }];
    if (body.kind === "article") {
      targets.push({ kind: "library", slug: result.slug });
      // The locale mirror follows by cron, not inline; a failed enqueue is
      // logged and the next save of the article retries it.
      try {
        await enqueueTranslationJobs(LIVE_LOCALE_CODES, [`library/${result.slug}`]);
      } catch (error) {
        console.warn("[writing-article] translation enqueue failed", {
          slug: result.slug,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    await publishPublicCache({ targets, source: "manual" });

    return NextResponse.json({ ok: true, slug: result.slug, created: result.created, revision: result.revision });
  },
});
