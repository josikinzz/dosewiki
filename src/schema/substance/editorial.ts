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
});

export type EditorialReviewStatus = z.infer<typeof editorialReviewStatusSchema>;
export type EditorialReview = z.infer<typeof editorialReviewSchema>;
