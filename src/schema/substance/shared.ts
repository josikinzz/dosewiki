import { z } from "zod";

/** Dose range with min/max/unit */
export const doseRangeSchema = z.object({
  min: z.number().nullable(),
  max: z.number().nullable(),
  unit: z.string(),
});

/** Duration stage (onset, come_up, etc.) */
export const durationStageSchema = z.object({
  min: z.number().nullable(),
  max: z.number().nullable(),
  unit: z.string(),
});

export const referenceIdArraySchema = z.array(z.string()).default([]);

/** Citation entry */
export const citationSchema = z.object({
  name: z.string(),
  url: z.string(),
});

export const referenceSourceTypeSchema = z.enum([
  "primary_literature",
  "review_literature",
  "book",
  "government_or_regulatory",
  "medical_database",
  "drug_database",
  "community_wiki",
  "experience_archive",
  "harm_reduction_org",
  "news_media",
  "vendor_or_commercial",
  "unknown",
]);

export const referenceQualityTierSchema = z.enum(["high", "medium", "low", "fallback"]);

/** Structured APA-oriented reference entry used by claim-level citations. */
export const referenceSchema = z.object({
  id: z.string(),
  type: z.enum(["journal_article", "book", "book_chapter", "webpage", "database_entry", "report", "unknown"]).default("unknown"),
  title: z.string(),
  authors: z.array(z.string()).default([]),
  year: z.union([z.number(), z.string()]).nullable().optional(),
  date: z.string().nullable().optional(),
  containerTitle: z.string().nullable().optional(),
  siteName: z.string().nullable().optional(),
  publisher: z.string().nullable().optional(),
  volume: z.string().nullable().optional(),
  issue: z.string().nullable().optional(),
  pages: z.string().nullable().optional(),
  articleNumber: z.string().nullable().optional(),
  doi: z.string().nullable().optional(),
  pmid: z.string().nullable().optional(),
  isbn: z.string().nullable().optional(),
  url: z.string().nullable().optional(),
  accessedAt: z.string().nullable().optional(),
  sourceType: referenceSourceTypeSchema.default("unknown"),
  quality: referenceQualityTierSchema.default("fallback"),
  apaText: z.string().nullable().optional(),
});

/** Country legality entry */
export const countryLegalitySchema = z.object({
  status: z.string(),
  notes: z.string(),
});

export type DoseRange = z.infer<typeof doseRangeSchema>;
export type DurationStage = z.infer<typeof durationStageSchema>;
export type Citation = z.infer<typeof citationSchema>;
export type Reference = z.infer<typeof referenceSchema>;
export type ReferenceSourceType = z.infer<typeof referenceSourceTypeSchema>;
export type ReferenceQualityTier = z.infer<typeof referenceQualityTierSchema>;
export type CountryLegality = z.infer<typeof countryLegalitySchema>;
