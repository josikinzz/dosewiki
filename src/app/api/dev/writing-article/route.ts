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
      intent: body.intent,
      title: body.title,
      kind: body.kind,
      status: body.status,
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

    if (body.intent === "publish") {
      const targets: PublicationTarget[] = [{ kind: "writing-articles" }];
      if (body.kind === "article") {
        targets.push({ kind: "library", slug: result.slug });
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
    }

    return NextResponse.json({ ok: true, slug: result.slug, created: result.created, revision: result.revision, operationId: body.operationId, intent: body.intent });
  },
});
