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
import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
import { contentHash } from "../../../../../lib/proposals/contentHash";
import { parseWritingArticleBody, type ParsedWritingArticle, type WritingArticleBody } from "./parseWritingArticleBody";

export const runtime = "nodejs";

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
