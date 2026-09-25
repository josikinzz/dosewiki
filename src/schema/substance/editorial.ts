import { z } from "zod";
import { SUBSTANCE_SECTION_IDS } from "./sectionCatalog";

const reviewFlagSeveritySchema = z.enum(["major", "minor", "note"])

/** Preferred reusable labels; Review Flag labels remain open to 1–3 word values. */
export const CANONICAL_REVIEW_FLAG_LABELS = [
  "skinny",
  "missing citations",
  "incomplete table",
  "missing section",
  "misplaced content",
  "stale data",
  "summary drift",
  "formatting",
  "consider hiding",
] as const;

const reviewFlagSchema = z.object({
  label: z.string().refine(
    (label) => {
      const words = label.trim().split(/\s+/).filter(Boolean);
      return words.length >= 1 && words.length <= 3;
    },
    "Flag label must contain 1–3 words.",
  ),
  severity: reviewFlagSeveritySchema,
  note: z.string(),
  section: z.enum(SUBSTANCE_SECTION_IDS).optional(),
  source: z.enum(["agent", "human"]),
  run_id: z.string().optional(),
  created_at: z.string().datetime(),
  created_by: z.string().optional(),
})

/** An editor's pending "Recommended reviewed", bound to the revision they read. */
const reviewRecommendationSchema = z.object({
  revision: z.string(),
  recommended_by: z.string(),
  recommended_at: z.string(),
  note: z.string(),
});

/** Manual editorial review states used in Dev Tools */
export const editorialReviewStatusSchema = z.enum([
  "needed",
  "in_progress",
  "completed",
]);


/** Internal-only editorial review metadata */
export const editorialReviewSchema = z.object({
  status: editorialReviewStatusSchema.default("needed"),
  notes: z.string().default(""),
  /**
   * Who completed the review and when, stamped by the review-mode tick
   * (`substanceIndex.setEditorialReview`). Optional so hand-set statuses and
   * historical data stay valid; declared here so full editor saves round-trip
   * the stamp instead of stripping it as an unknown key.
   */
  reviewed_by: z.string().optional(),
  reviewed_at: z.string().optional(),
  /**
   * The published revision the sign-off covered: the `resultHash` of the
   * article's latest `articleRevisions` row when it was signed, or
   * `REVIEW_INITIAL_REVISION` when no revision had been recorded yet. A later
   * publish records a new revision, so the review derives `stale`.
   */
  reviewed_revision: z.string().optional(),
  /**
   * An editor's recommendation that this article is reviewed, awaiting an
   * admin. It never changes `status`: completion stays admin-only, and an
   * admin approval writes `completed` with the recommended `revision`. When
   * the published revision moves on, the recommendation reads as stale.
   */
  recommendation: reviewRecommendationSchema.optional(),
  /** Declared so editor saves preserve Review Flags instead of stripping them. */
  flags: z.array(reviewFlagSchema).optional(),
});

/**
 * The revision name a sign-off records when the article has no recorded
 * revision yet: the content it covered is the `before` of the first revision.
 */
export const REVIEW_INITIAL_REVISION = "initial";

/**
 * The review status a reviewer sees. `stale` is never stored: it is a
 * `completed` sign-off whose `reviewed_revision` is no longer the published one.
 */
export type ReviewState = "needed" | "in_progress" | "completed" | "stale";

/**
 * Derive the review status from the stored record and the article's current
 * published revision. A sign-off stamped before revisions were recorded
 * carries no `reviewed_revision`, so it cannot be compared and stays completed.
 */
export function deriveReviewState(
  review: { status?: unknown; reviewed_revision?: unknown } | null | undefined,
  publishedRevision: string,
): ReviewState {
  const status = review?.status;
  if (status === "in_progress") return "in_progress";
  if (status !== "completed") return "needed";
  const signed = review?.reviewed_revision;
  return typeof signed === "string" && signed !== publishedRevision ? "stale" : "completed";
}


/**
 * Whether a recommendation still covers what is published. One made before
 * the latest publish is stale and cannot be approved without re-review.
 */
export function isRecommendationStale(
  recommendation: { revision?: unknown } | null | undefined,
  publishedRevision: string,
): boolean {
  return recommendation?.revision !== publishedRevision;
}

export type EditorialReview = z.infer<typeof editorialReviewSchema>;
export type ReviewRecommendation = z.infer<typeof reviewRecommendationSchema>;
export type ReviewFlag = z.infer<typeof reviewFlagSchema>;
export type ReviewFlagSeverity = z.infer<typeof reviewFlagSeveritySchema>;
