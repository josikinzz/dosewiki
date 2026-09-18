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
  /** Declared so editor saves preserve Review Flags instead of stripping them. */
  flags: z.array(reviewFlagSchema).optional(),
});


export type EditorialReview = z.infer<typeof editorialReviewSchema>;
export type ReviewFlag = z.infer<typeof reviewFlagSchema>;
export type ReviewFlagSeverity = z.infer<typeof reviewFlagSeveritySchema>;
