/**
 * Editor read endpoint for review staleness in `/review`.
 *
 * A review sign-off records the published revision it covered
 * (`editorial_review.reviewed_revision`). This endpoint supplies the other half
 * of the comparison, and the content behind it:
 *
 *   GET /api/dev/review-revisions                         → { ok, revisions: { [slug]: revision } }
 *   GET /api/dev/review-revisions?slug=lsd&since=<rev>    → { ok, slug, revision, publishedRevision, signed, current }
 *
 * The list names each article's current published revision; an article with no
 * recorded revision is absent and reads as `initial`. The per-slug form returns
 * the article at the signed revision and as published now, so the workbench
 * can show only what changed since the sign-off. Both are read-only.
 */
import { NextResponse } from "next/server";
import { api } from "@server/postgres/runtime/api";
import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";

export const runtime = "nodejs";

const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;
const REVISION_RE = /^[A-Za-z0-9]{1,128}$/;

export const GET = protectedRouteOperation({
  auth: "editor",
  rateLimit: "diagnosticRead",
  capabilities: [{ type: "dataWrite" }],
  unexpectedErrorLabel: "Failed to load review revisions via Next route:",
  unexpectedErrorMessage: "Unable to load review revisions right now.",
  operation: async ({ dataWrite, actorEmail, request }) => {
    if (!dataWrite) {
      throw new Error("Postgres write capability is required.");
    }
    const apiKey =
      dataWrite.getAdminIntentToken?.("editorArticleWrite") ?? dataWrite.adminKey;

    const params = new URL(request.url).searchParams;
    const slug = params.get("slug");
    const since = params.get("since");

    if (slug === null && since === null) {
      const revisions = await dataWrite.client.query(api.substanceIndex.getPublishedRevisions, {
        apiKey,
        actorEmail,
      });
      return NextResponse.json({ ok: true, revisions });
    }

    if (!slug || !SLUG_RE.test(slug) || !since || !REVISION_RE.test(since)) {
      return NextResponse.json(
        { ok: false, error: "A valid slug and signed revision are required." },
        { status: 400 },
      );
    }

    const changes = await dataWrite.client.query(api.substanceIndex.getReviewChanges, {
      apiKey,
      actorEmail,
      slug,
      revision: since,
    });
    if (!changes.signed) {
      return NextResponse.json(
        { ok: false, error: "The signed revision is no longer in this article's history." },
        { status: 404 },
      );
    }
    return NextResponse.json({ ok: true, ...changes });
  },
});
