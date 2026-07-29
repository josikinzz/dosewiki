/**
 * Editor write endpoint for the manual review tick (`/dev` → Review).
 *
 * Flips only the editor-only `editorial_review` state for one article via
 * `substanceIndex.setEditorialReview`, which preserves review notes and stamps
 * who completed the review. The full save flow (diff, commit message,
 * changelog) stays reserved for content edits.
 *
 *   POST /api/dev/editorial-review   { slug, status }  → set review status
 */
import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { api } from "../../../../../convex/_generated/api";
import { PUBLIC_CONVEX_CACHE_TAGS } from "@server/convex/publicData";
import { JsonBodyError } from "@/lib/http/readJsonBody";
import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";

export const runtime = "nodejs";

const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;
const REVIEW_STATUSES = ["needed", "in_progress", "completed"] as const;
type ReviewStatus = (typeof REVIEW_STATUSES)[number];

type SetReviewBody = {
  slug?: unknown;
  status?: unknown;
};

type ParsedSetReview = {
  slug: string;
  status: ReviewStatus;
};

function parseSetReviewBody(body: SetReviewBody): ParsedSetReview {
  const slug = typeof body.slug === "string" ? body.slug.trim() : "";
  if (!SLUG_RE.test(slug)) {
    throw new JsonBodyError(400, "A valid substance slug is required.");
  }
  const status = typeof body.status === "string" ? body.status : "";
  if (!REVIEW_STATUSES.includes(status as ReviewStatus)) {
    throw new JsonBodyError(400, "A valid review status is required.");
  }
  return { slug, status: status as ReviewStatus };
}

export const POST = protectedRouteOperation<SetReviewBody, ParsedSetReview>({
  auth: "editor",
  rateLimit: "editorSmallWrite",
  body: {
    maxBytes: 4 * 1024,
    parse: parseSetReviewBody,
  },
  capabilities: [{ type: "convexWrite" }],
  unexpectedErrorLabel: "Failed to set editorial review via Next route:",
  unexpectedErrorMessage: "Unable to update the review status right now.",
  operation: async ({ actorEmail, body, convexWrite }) => {
    if (!convexWrite) {
      throw new Error("Convex write capability is required.");
    }

    const apiKey =
      convexWrite.getAdminIntentToken?.("editorArticleWrite") ?? convexWrite.adminKey;

    const result = await convexWrite.client.mutation(
      api.substanceIndex.setEditorialReview,
      {
        apiKey,
        actorEmail,
        slug: body.slug,
        status: body.status,
      },
    );

    // The tick changes the public-safe `expert_reviewed` derivation, so the
    // coverage audit and the article's own cached projections must refresh.
    revalidatePath("/about/coverage");
    revalidatePath(`/${body.slug}`);
    revalidateTag(PUBLIC_CONVEX_CACHE_TAGS.substances, { expire: 0 });

    return NextResponse.json({
      ok: true,
      slug: result.slug,
      editorial_review: result.editorial_review,
    });
  },
});
