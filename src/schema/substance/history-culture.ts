import { z } from "zod";

/** Optional date range for history sections (e.g., "1938" or "1963-1971") */
export const historyCultureDateRangeSchema = z.object({
  start: z.string(),
  end: z.string().optional(),
});

/** Nested subsection within a history & culture section */
export const historyCultureSubsectionSchema = z.object({
  heading: z.string(),
  content: z.string(),
  date_range: historyCultureDateRangeSchema.optional(),
});

/** Single section within history & culture */
export const historyCultureSectionSchema = z.object({
  heading: z.string(),
  content: z.string(),
  date_range: historyCultureDateRangeSchema.optional(),
  subsections: z.array(historyCultureSubsectionSchema).optional().default([]),
});

/** History and culture section */
export const historyCultureSchema = z.object({
  content: z.string(),
  sections: z.array(historyCultureSectionSchema),
});

export type HistoryCultureDateRange = z.infer<typeof historyCultureDateRangeSchema>;
export type HistoryCultureSubsection = z.infer<typeof historyCultureSubsectionSchema>;
export type HistoryCultureSection = z.infer<typeof historyCultureSectionSchema>;
export type HistoryCulture = z.infer<typeof historyCultureSchema>;
