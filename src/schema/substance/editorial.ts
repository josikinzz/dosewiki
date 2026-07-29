import { z } from "zod";

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
});

export type EditorialReviewStatus = z.infer<typeof editorialReviewStatusSchema>;
export type EditorialReview = z.infer<typeof editorialReviewSchema>;
