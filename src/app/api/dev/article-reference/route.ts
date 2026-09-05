/**
 * Admin write endpoint for adding one source to one article.
 *
 * Appending or removing a reference rewrites the published article with no
 * review step, so both verbs are admin-only.
 *
 * The review workbench's citation palette lets a reviewer mint a source without
 * leaving the queue: paste a DOI, PMID, ISBN, URL, or title, and the reference
 * lands on the article ready for a `[cite:id]` marker. `setArticleField` cannot
 * carry this — it writes scalars by construction — so the append has its own
 * mutation, `substanceIndex.appendArticleReference`.
 *
 *   POST   /api/dev/article-reference   { slug, source, title?, ... }  → 1 source
 *   DELETE /api/dev/article-reference   { slug, referenceId }          ← 1 source
 *
 * The client sends what a person typed, never an assembled reference: detection
 * and assembly run here, so the id, type, source type, and identifier fields are
 * all derived server-side from the pasted string. `supportStatus` is then forced
 * again inside Convex. The write is idempotent by reference id, so a retry after
 * a dropped response is safe and returns `created: false`.
 */
import { NextResponse } from "next/server";
import { revalidateSavedPaths } from "../../save-to-convex/revalidateSavedPaths";
import { api } from "../../../../../convex/_generated/api";
import { ARTICLE_REFERENCE_MAX_AUTHORS } from "../../../../../convex/lib/articleReferenceWrites";

import { parseReferenceYear } from "@/features/dev/forms/referenceFormShared";
import {
  buildDirectEditDiff,
  recordDirectEditChangelog,
} from "../directEditChangelog";
import {
  buildQuickAddReference,
  detectQuickAddReference,
} from "@/lib/citations/referenceIntake";
import { JsonBodyError } from "@/lib/http/readJsonBody";
import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
import type { Reference } from "@/schema";

export const runtime = "nodejs";

const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

/** A pasted identifier or title; long enough for a verbose book title. */
const SOURCE_MAX_LENGTH = 2000;
const TITLE_MAX_LENGTH = 500;
const AUTHOR_MAX_LENGTH = 200;
const URL_MAX_LENGTH = 2048;
const YEAR_MAX_LENGTH = 32;

type AddReferenceBody = {
  slug?: unknown;
  source?: unknown;
  title?: unknown;
  authors?: unknown;
  year?: unknown;
  url?: unknown;
};

type ParsedAddReference = {
  slug: string;
  reference: Reference;
};

function requireText(raw: unknown, max: number, label: string): string {
  if (raw === undefined || raw === null) return "";
  if (typeof raw !== "string") {
    throw new JsonBodyError(400, `${label} must be a string.`);
  }
  if (raw.length > max) {
    throw new JsonBodyError(400, `${label} must be ${max} characters or fewer.`);
  }
  return raw.trim();
}

function parseAuthors(raw: unknown): string[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    throw new JsonBodyError(400, "Authors must be a list of names.");
  }
  if (raw.length > ARTICLE_REFERENCE_MAX_AUTHORS) {
    throw new JsonBodyError(
      400,
      `A source may list at most ${ARTICLE_REFERENCE_MAX_AUTHORS} authors.`,
    );
  }
  return raw
    .map((author) => requireText(author, AUTHOR_MAX_LENGTH, "Each author"))
    .filter((author) => author.length > 0);
}

function parseAddReferenceBody(body: AddReferenceBody): ParsedAddReference {
  const slug = typeof body.slug === "string" ? body.slug.trim() : "";
  if (!SLUG_RE.test(slug)) {
    throw new JsonBodyError(400, "A valid substance slug is required.");
  }

  const source = requireText(body.source, SOURCE_MAX_LENGTH, "The source");
  if (!source) {
    throw new JsonBodyError(400, "A DOI, PubMed ID, ISBN, URL, or title is required.");
  }

  const title = requireText(body.title, TITLE_MAX_LENGTH, "The title");

  // Detection is the same pure function the palette previewed with, so the id
  // stored here is the id the reviewer already saw — and it is derived from the
  // pasted string rather than accepted from the client.
  const detection = detectQuickAddReference(source, title);
  if (!detection) {
    throw new JsonBodyError(400, "A DOI, PubMed ID, ISBN, URL, or title is required.");
  }

  const referenceTitle = title || detection.title?.trim() || "";
  if (!referenceTitle) {
    throw new JsonBodyError(400, "A title is required for this source.");
  }

  return {
    slug,
    reference: buildQuickAddReference({
      detection,
      title: referenceTitle,
      authors: parseAuthors(body.authors),
      year: parseReferenceYear(requireText(body.year, YEAR_MAX_LENGTH, "The year")),
      url: requireText(body.url, URL_MAX_LENGTH, "The URL"),
    }),
  };
}

export const POST = protectedRouteOperation<AddReferenceBody, ParsedAddReference>({
  auth: "admin",
  rateLimit: "editorSmallWrite",
  body: {
    maxBytes: 32 * 1024,
    parse: parseAddReferenceBody,
  },
  capabilities: [{ type: "convexWrite" }],
  unexpectedErrorLabel: "Failed to add an article reference via Next route:",
  unexpectedErrorMessage: "Unable to add that source right now.",
  operation: async ({ actorEmail, auth, body, convexWrite }) => {
    if (!convexWrite) {
      throw new Error("Convex write capability is required.");
    }

    const apiKey =
      convexWrite.getAdminIntentToken?.("editorArticleWrite") ?? convexWrite.adminKey;

    const result = await convexWrite.client.mutation(
      api.substanceIndex.appendArticleReference,
      {
        apiKey,
        actorEmail,
        slug: body.slug,
        reference: body.reference,
      },
    );

    // An uncited source is invisible to readers, so nothing public changes until
    // a marker cites it — but the cached projections are what the editor and the
    // review queue read back, and they must not keep serving the older list.
    // An idempotent re-add changed nothing, so it is neither invalidated nor
    // recorded as a contribution.
    if (result.created) {
      await recordDirectEditChangelog({
        convexWrite,
        actorEmail,
        session: auth.session,
        article: { id: result.id ?? 0, title: result.title, slug: result.slug },
        message: `Added a source — ${body.reference.title}`,
        markdown: buildDirectEditDiff(
          result.title,
          "references",
          null,
          body.reference.title,
        ),
      });
      revalidateSavedPaths([`/${body.slug}`], "manual");
    }

    return NextResponse.json({
      ok: true,
      slug: result.slug,
      created: result.created,
      reference: result.reference,
    });
  },
});

type RemoveReferenceBody = {
  slug?: unknown;
  referenceId?: unknown;
};

type ParsedRemoveReference = {
  slug: string;
  referenceId: string;
};

/** Mirrors the Convex-side reference-id validation, so a bad id fails here. */
const REFERENCE_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const REFERENCE_ID_MAX_LENGTH = 128;

function parseRemoveReferenceBody(body: RemoveReferenceBody): ParsedRemoveReference {
  const slug = typeof body.slug === "string" ? body.slug.trim() : "";
  if (!SLUG_RE.test(slug)) {
    throw new JsonBodyError(400, "A valid substance slug is required.");
  }

  const referenceId = requireText(
    body.referenceId,
    REFERENCE_ID_MAX_LENGTH,
    "The reference id",
  );
  if (!REFERENCE_ID_RE.test(referenceId)) {
    throw new JsonBodyError(400, "A valid reference id is required.");
  }

  return { slug, referenceId };
}

export const DELETE = protectedRouteOperation<RemoveReferenceBody, ParsedRemoveReference>({
  auth: "admin",
  rateLimit: "editorSmallWrite",
  body: {
    maxBytes: 4 * 1024,
    parse: parseRemoveReferenceBody,
  },
  capabilities: [{ type: "convexWrite" }],
  unexpectedErrorLabel: "Failed to remove an article reference via Next route:",
  unexpectedErrorMessage: "Unable to remove that source right now.",
  operation: async ({ actorEmail, auth, body, convexWrite }) => {
    if (!convexWrite) {
      throw new Error("Convex write capability is required.");
    }

    const apiKey =
      convexWrite.getAdminIntentToken?.("editorArticleWrite") ?? convexWrite.adminKey;

    const result = await convexWrite.client.mutation(
      api.substanceIndex.removeArticleReference,
      {
        apiKey,
        actorEmail,
        slug: body.slug,
        referenceId: body.referenceId,
      },
    );

    // The inverse of the append's created-only gate above: removal also strips
    // this id's `[cite:id]` markers and route reference ids, so cited prose and
    // footnotes render differently for readers the moment the write lands.
    // Every removal therefore invalidates, not just the ones the cache asked
    // about. An idempotent re-delete changed nothing and stays silent.
    if (result.removed) {
      const referenceLabel = result.referenceTitle ?? body.referenceId;
      await recordDirectEditChangelog({
        convexWrite,
        actorEmail,
        session: auth.session,
        article: { id: result.id ?? 0, title: result.title, slug: result.slug },
        message: `Removed a source — ${referenceLabel}`,
        markdown: buildDirectEditDiff(result.title, "references", referenceLabel, null),
      });
      revalidateSavedPaths([`/${body.slug}`], "manual");
    }

    return NextResponse.json({
      ok: true,
      slug: result.slug,
      removed: result.removed,
      markersStripped: result.markersStripped,
      routeIdsStripped: result.routeIdsStripped,
    });
  },
});
