/**
 * Admin endpoint for editors' review recommendations (Change Review's
 * Review recommendations lane).
 *
 *   GET  /api/dev/review-recommendations                          → { ok, recommendations }
 *   POST /api/dev/review-recommendations { items: [{ slug, revision }] }
 *                                                                → { ok, approved, stale, missing }
 *
 * Editors record recommendations through `/api/dev/editorial-review`
 * (`action: "recommend"`); they never write `completed`. Approving is the
 * admin sign-off, so both methods are admin-only here and again in Postgres
 * (AGENTS rule 8). Each item names the recommendation revision the admin saw:
 * approval writes `completed` at exactly that revision, and a recommendation
 * that is stale or has changed since is reported back instead of approved.
 */
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { makeFunctionReference } from "@server/postgres/runtime/api";
import { JsonBodyError } from "@/lib/http/readJsonBody";
import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
import { revalidateSavedPaths } from "../../save-article/revalidateSavedPaths";

export const runtime = "nodejs";

const listRecommendationsQuery = makeFunctionReference<"query">("substanceIndex:listReviewRecommendations");
const approveRecommendationsMutation = makeFunctionReference<"mutation">("substanceIndex:approveReviewRecommendations");

const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;
const REVISION_RE = /^[A-Za-z0-9]{1,128}$/;
/** Matches `REVIEW_RECOMMENDATION_BATCH_MAX` in the review handlers. */
const BATCH_MAX = 100;

type ApproveBody = { items?: unknown };
type ParsedApprove = { items: Array<{ slug: string; revision: string }> };

function parseApproveBody(body: ApproveBody): ParsedApprove {
  if (!Array.isArray(body.items) || body.items.length === 0 || body.items.length > BATCH_MAX) {
    throw new JsonBodyError(400, `Choose between 1 and ${BATCH_MAX} recommendations to approve.`);
  }
  const items = body.items.map((value) => {
    const item = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
    const slug = typeof item.slug === "string" ? item.slug.trim() : "";
    const revision = typeof item.revision === "string" ? item.revision : "";
    if (!SLUG_RE.test(slug) || !REVISION_RE.test(revision)) {
      throw new JsonBodyError(400, "Each recommendation needs a valid slug and revision.");
    }
    return { slug, revision };
  });
  return { items };
}

type ApprovalOutcome = { approved: string[]; stale: string[]; missing: string[] };

export const GET = protectedRouteOperation({
  auth: "admin",
  rateLimit: "diagnosticRead",
  capabilities: [{ type: "dataWrite" }],
  unexpectedErrorLabel: "Failed to load review recommendations via Next route:",
  unexpectedErrorMessage: "Unable to load review recommendations right now.",
  operation: async ({ dataWrite, actorEmail }) => {
    if (!dataWrite) {
      throw new Error("Postgres write capability is required.");
    }
    const recommendations = await dataWrite.client.query(listRecommendationsQuery, {
      apiKey: dataWrite.getAdminIntentToken?.("editorArticleWrite") ?? dataWrite.adminKey,
      actorEmail,
    });
    return NextResponse.json({ ok: true, recommendations });
  },
});

export const POST = protectedRouteOperation<ApproveBody, ParsedApprove>({
  auth: "admin",
  rateLimit: "editorSmallWrite",
  body: { maxBytes: 32 * 1024, parse: parseApproveBody },
  capabilities: [{ type: "dataWrite" }],
  unexpectedErrorLabel: "Failed to approve review recommendations via Next route:",
  unexpectedErrorMessage: "Unable to approve those recommendations right now.",
  operation: async ({ dataWrite, actorEmail, body }) => {
    if (!dataWrite) {
      throw new Error("Postgres write capability is required.");
    }
    const outcome = (await dataWrite.client.mutation(approveRecommendationsMutation, {
      apiKey: dataWrite.getAdminIntentToken?.("editorArticleWrite") ?? dataWrite.adminKey,
      actorEmail,
      items: body.items,
    })) as ApprovalOutcome;

    // Approval changes the public-safe `expert_reviewed` derivation, as the tick does.
    if (outcome.approved.length > 0) {
      revalidatePath("/about/coverage");
      await revalidateSavedPaths(outcome.approved.map((slug) => `/${slug}`), "manual");
    }

    return NextResponse.json({ ok: true, ...outcome });
  },
});
