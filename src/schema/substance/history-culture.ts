import { z } from "zod";

const historyCultureDateRangeSchema = z.object({
  start: z.string(),
  end: z.string().optional(),
})

const historyCultureSubsectionSchema = z.object({
  heading: z.string(),
  content: z.string(),
  date_range: historyCultureDateRangeSchema.optional(),
})

const historyCultureSectionSchema = z.object({
  heading: z.string(),
  content: z.string(),
  date_range: historyCultureDateRangeSchema.optional(),
  subsections: z.array(historyCultureSubsectionSchema).optional().default([]),
})

export const historyCultureSchema = z.object({
  content: z.string(),
  sections: z.array(historyCultureSectionSchema),
});

export type HistoryCultureSubsection = z.infer<typeof historyCultureSubsectionSchema>;
export type HistoryCultureSection = z.infer<typeof historyCultureSectionSchema>;
