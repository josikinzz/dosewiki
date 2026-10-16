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
