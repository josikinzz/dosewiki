import { z } from "zod";
import { SUBSTANCE_SECTION_IDS } from "./sectionCatalog";

const reviewFlagSeveritySchema = z.enum(["major", "minor", "note"])

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

const reviewRecommendationSchema = z.object({
  revision: z.string(),
  recommended_by: z.string(),
  recommended_at: z.string(),
  note: z.string(),
});

export const editorialReviewStatusSchema = z.enum([
  "needed",
  "in_progress",
  "completed",
]);

export const editorialReviewSchema = z.object({
  status: editorialReviewStatusSchema.default("needed"),
  notes: z.string().default(""),
  reviewed_by: z.string().optional(),
  reviewed_at: z.string().optional(),
  reviewed_revision: z.string().optional(),
  recommendation: reviewRecommendationSchema.optional(),
  recommended_by: z.string().optional(),
  recommended_at: z.string().optional(),
  recommendation_note: z.string().optional(),
  flags: z.array(reviewFlagSchema).optional(),
});

export const REVIEW_INITIAL_REVISION = "initial";

export type ReviewState = "needed" | "in_progress" | "completed" | "stale";

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
