/**
 * Editor write endpoint for the manual review tick (`/dev` → Review).
 *
 * Flips only the editor-only `editorial_review` state for one article via
 * `substanceIndex.setEditorialReview`, which preserves review notes and stamps
 * who completed the review. Editors move a review between `needed` and
 * `in_progress` and manage flags; marking it `completed` is admin-only, since
 * that is what the public `expert_reviewed` derivation reads. The full save
 * flow (diff, commit message, changelog) stays reserved for content edits.
 *
 *   POST /api/dev/editorial-review   { slug, status }  → set review status
 */
import { NextResponse } from "next/server";
import { makeFunctionReference } from "@server/postgres/runtime/api";
import { revalidatePath } from "next/cache";
import { api } from "@server/postgres/runtime/api";
import { revalidateSavedPaths } from "../../save-article/revalidateSavedPaths";
import { JsonBodyError } from "@/lib/http/readJsonBody";
import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
import { canApprove } from "@/lib/auth/roles";

export const runtime = "nodejs";

const addHumanReviewFlagMutation = makeFunctionReference<"mutation">("substanceIndex:addHumanReviewFlag");
const deleteReviewFlagMutation = makeFunctionReference<"mutation">("substanceIndex:deleteReviewFlag");

const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;
const REVIEW_STATUSES = ["needed", "in_progress", "completed"] as const;
type ReviewStatus = (typeof REVIEW_STATUSES)[number];

type SetReviewBody = {
  action?: unknown;
  slug?: unknown;
  status?: unknown;
  flag?: unknown;
  identity?: unknown;
};

type FlagInput = { label: string; severity: "major" | "minor" | "note"; note: string; section?: string };
type FlagIdentity = { created_at: string; label: string; source: "agent" | "human" };
type ParsedSetReview =
  | { action: "status"; slug: string; status: ReviewStatus }
  | { action: "add-flag"; slug: string; flag: FlagInput }
  | { action: "delete-flag"; slug: string; identity: FlagIdentity };

const FLAG_SEVERITIES = new Set(["major", "minor", "note"]);
const FLAG_SOURCES = new Set(["agent", "human"]);
const SECTION_IDS = new Set(["overview", "classification", "summary", "dosage-duration", "subjective-effects", "reagent-testing", "pharmacology", "interactions", "tolerance", "harm-potential", "history-culture", "legality", "sources", "citations", "editorial-review"]);

function parseFlag(value: unknown): FlagInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new JsonBodyError(400, "A valid Review Flag is required.");
  const record = value as Record<string, unknown>;
  const label = typeof record.label === "string" ? record.label.trim() : "";
  const words = label.split(/\s+/).filter(Boolean);
  if (words.length < 1 || words.length > 3) throw new JsonBodyError(400, "Flag label must contain 1–3 words.");
  if (!FLAG_SEVERITIES.has(record.severity as string)) throw new JsonBodyError(400, "Flag severity must be major, minor, or note.");
  if (typeof record.note !== "string") throw new JsonBodyError(400, "Flag note must be a string.");
  if (record.section !== undefined && !SECTION_IDS.has(record.section as string)) throw new JsonBodyError(400, "Flag section must be canonical.");
  return { label, severity: record.severity as FlagInput["severity"], note: record.note, ...(record.section ? { section: record.section as string } : {}) };
}

function parseSetReviewBody(body: SetReviewBody): ParsedSetReview {
  const slug = typeof body.slug === "string" ? body.slug.trim() : "";
  if (!SLUG_RE.test(slug)) {
    throw new JsonBodyError(400, "A valid substance slug is required.");
  }
  const action = typeof body.action === "string" ? body.action : "status";
  if (action === "add-flag") return { action, slug, flag: parseFlag(body.flag) };
  if (action === "delete-flag") {
    const value = body.identity;
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new JsonBodyError(400, "A valid Review Flag identity is required.");
    const identity = value as Record<string, unknown>;
    if (typeof identity.created_at !== "string" || typeof identity.label !== "string" || !FLAG_SOURCES.has(identity.source as string)) throw new JsonBodyError(400, "A valid Review Flag identity is required.");
    return { action, slug, identity: identity as FlagIdentity };
  }
  if (action !== "status") throw new JsonBodyError(400, "A valid editorial review action is required.");
  const status = typeof body.status === "string" ? body.status : "";
  if (!REVIEW_STATUSES.includes(status as ReviewStatus)) {
    throw new JsonBodyError(400, "A valid review status is required.");
  }
  return { action, slug, status: status as ReviewStatus };
}

export const POST = protectedRouteOperation<SetReviewBody, ParsedSetReview>({
  auth: "editor",
  rateLimit: "editorSmallWrite",
  body: {
    maxBytes: 4 * 1024,
    parse: parseSetReviewBody,
  },
  capabilities: [{ type: "dataWrite" }],
  unexpectedErrorLabel: "Failed to set editorial review via Next route:",
  unexpectedErrorMessage: "Unable to update the review status right now.",
  operation: async ({ auth, actorEmail, body, dataWrite }) => {
    if (!dataWrite) {
      throw new Error("Postgres write capability is required.");
    }
    if (body.action === "status" && body.status === "completed" && !canApprove(auth.role)) {
      return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    }

    const apiKey =
      dataWrite.getAdminIntentToken?.("editorArticleWrite") ?? dataWrite.adminKey;

    const result = body.action === "add-flag"
      ? await dataWrite.client.mutation(addHumanReviewFlagMutation, { apiKey, actorEmail, slug: body.slug, flag: body.flag })
      : body.action === "delete-flag"
        ? await dataWrite.client.mutation(deleteReviewFlagMutation, { apiKey, actorEmail, slug: body.slug, identity: body.identity })
        : await dataWrite.client.mutation(api.substanceIndex.setEditorialReview, { apiKey, actorEmail, slug: body.slug, status: body.status });

    // The tick changes the public-safe `expert_reviewed` derivation, so the
    // coverage audit and the article's own cached projections must refresh.
    if (body.action === "status") {
      revalidatePath("/about/coverage");
      await revalidateSavedPaths([`/${body.slug}`], "manual");
    }

    return NextResponse.json({
      ok: true,
      slug: result.slug,
      ...(body.action === "status" ? { editorial_review: result.editorial_review } : { flags: result.flags }),
    });
  },
});
