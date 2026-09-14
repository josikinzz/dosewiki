import { z } from "zod";

import { CANONICAL_LEGAL_STATUSES } from "./legalStatuses";

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

const referenceSourceTypeSchema = z.enum([
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
])

const referenceQualityTierSchema = z.enum(["high", "medium", "low", "fallback"])
const referenceAccessSchema = z.enum(["open", "abstract_only", "paywalled", "unreachable", "unknown"])
const referenceSupportStatusSchema = z.enum(["inspected", "discovery_only", "needs_review", "unknown"])
const referenceMetadataProvenanceEntrySchema = z.object({
  kind: z.enum(["inspected", "fetched", "cached", "imported"]),
  source: z.string().min(1).max(128),
  provider: z.string().min(1).max(128).optional(),
  retrievedAt: z.string().min(1).max(64).optional(),
  artifactDigest: z.string().min(1).max(128).optional(),
  fields: z.array(z.string().min(1).max(64)).max(64).optional(),
})

/** Structured Wikipedia-style reference entry used by claim-level citations. */
export const referenceSchema = z.object({
  id: z.string(),
  type: z.enum(["journal_article", "book", "book_chapter", "webpage", "database_entry", "report", "unknown"]).default("unknown"),
  template: z.enum(["cite_journal", "cite_book", "cite_web", "cite_report", "cite_database", "unknown"]).nullable().optional(),
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
  chapter: z.string().nullable().optional(),
  edition: z.string().nullable().optional(),
  series: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  institution: z.string().nullable().optional(),
  language: z.string().nullable().optional(),
  doi: z.string().nullable().optional(),
  pmid: z.string().nullable().optional(),
  isbn: z.string().nullable().optional(),
  url: z.string().nullable().optional(),
  archiveUrl: z.string().nullable().optional(),
  archiveDate: z.string().nullable().optional(),
  accessedAt: z.string().nullable().optional(),
  sourceType: referenceSourceTypeSchema.default("unknown"),
  quality: referenceQualityTierSchema.default("fallback"),
  discoverySource: z.string().nullable().optional(),
  access: referenceAccessSchema.default("unknown").optional(),
  supportStatus: referenceSupportStatusSchema.default("unknown").optional(),
  apaText: z.string().nullable().optional(),
  metadataProvenance: z.array(referenceMetadataProvenanceEntrySchema).max(32).optional(),
});

/** Country legality entry — canonical statuses live in the Zod-free `legalStatuses.ts`. */
export { CANONICAL_LEGAL_STATUSES } from "./legalStatuses";

export const countryLegalitySchema = z.object({
  status: z.string(),
  notes: z.string(),
  canonicalStatus: z.enum(CANONICAL_LEGAL_STATUSES).optional(),
  instrument: z.string().optional(),
  designation: z.string().optional(),
  citationNeeded: z.boolean().optional(),
});

export type DoseRange = z.infer<typeof doseRangeSchema>;
export type DurationStage = z.infer<typeof durationStageSchema>;
export type Citation = z.infer<typeof citationSchema>;
export type Reference = z.infer<typeof referenceSchema>;




export type ReferenceMetadataProvenanceEntry = z.infer<typeof referenceMetadataProvenanceEntrySchema>;
export type CountryLegality = z.infer<typeof countryLegalitySchema>;
