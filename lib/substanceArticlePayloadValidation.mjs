import { z } from "zod";

const PRIORITY_VALUES = ["high", "normal", "low"];
const REFERENCE_TYPES = ["journal_article", "book", "book_chapter", "webpage", "database_entry", "report", "unknown"];
const REFERENCE_SOURCE_TYPES = [
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
];
const REFERENCE_QUALITY_TIERS = ["high", "medium", "low", "fallback"];

const citationSchema = z.object({
  name: z.string(),
  url: z.string(),
});

const referenceSchema = z.object({
  id: z.string().min(1),
  type: z.enum(REFERENCE_TYPES).default("unknown"),
  title: z.string().min(1),
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
  sourceType: z.enum(REFERENCE_SOURCE_TYPES).default("unknown"),
  quality: z.enum(REFERENCE_QUALITY_TIERS).default("fallback"),
  apaText: z.string().nullable().optional(),
});

const routeReferenceIdsSchema = z.array(z.string().min(1));

const dosageRouteSchema = z.object({
  reference_ids: routeReferenceIdsSchema.optional(),
}).passthrough();

const durationRouteSchema = z.object({
  reference_ids: routeReferenceIdsSchema.optional(),
}).passthrough();

const genericObjectSchema = z.record(z.string(), z.unknown());

const substanceArticlePayloadSchema = z.object({
  id: z.number().nullable(),
  title: z.string().trim().min(1),
  priority: z.enum(PRIORITY_VALUES).nullable().optional(),
  index_categories: z.array(z.string()),
  identification: genericObjectSchema,
  classification: genericObjectSchema,
  summary: z.string(),
  dosage: z.object({
    routes: z.array(dosageRouteSchema).optional(),
  }).passthrough(),
  duration: z.object({
    routes: z.array(durationRouteSchema).optional(),
  }).passthrough(),
  subjective_effects: genericObjectSchema,
  comparisons: z.array(z.unknown()),
  pharmacology: genericObjectSchema,
  interactions: genericObjectSchema,
  reagent_testing: genericObjectSchema,
  tolerance: z.object({
    cross_tolerance: z.array(z.string()).optional(),
  }).passthrough(),
  harm_potential: genericObjectSchema,
  history_culture: genericObjectSchema.nullable().optional(),
  legality: genericObjectSchema,
  editorial_review: z.unknown().optional(),
  references: z.array(referenceSchema).optional().default([]),
  source_citations: z.array(citationSchema).nullable().optional(),
  citations: z.array(citationSchema),
}).passthrough().superRefine((article, ctx) => {
  const knownReferenceIds = new Set();

  for (const [index, reference] of (article.references ?? []).entries()) {
    if (knownReferenceIds.has(reference.id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["references", index, "id"],
        message: `Duplicate reference id "${reference.id}" is not allowed.`,
      });
      continue;
    }
    knownReferenceIds.add(reference.id);
  }

  const validateRouteReferenceIds = (routes, sectionKey) => {
    for (const [routeIndex, route] of (routes ?? []).entries()) {
      for (const [referenceIndex, referenceId] of (route.reference_ids ?? []).entries()) {
        if (!knownReferenceIds.has(referenceId)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [sectionKey, "routes", routeIndex, "reference_ids", referenceIndex],
            message: `Unknown reference id "${referenceId}". Every route reference id must resolve to article.references.`,
          });
        }
      }
    }
  };

  validateRouteReferenceIds(article.dosage?.routes, "dosage");
  validateRouteReferenceIds(article.duration?.routes, "duration");
});


function formatIssuePath(path) {
  if (!Array.isArray(path) || path.length === 0) {
    return "<root>";
  }

  return path.reduce((formatted, segment) => {
    if (typeof segment === "number") {
      return `${formatted}[${segment}]`;
    }
    return formatted ? `${formatted}.${segment}` : String(segment);
  }, "");
}

function zodIssuesToValidationIssues(error) {
  return error.issues.map((issue) => ({
    path: formatIssuePath(issue.path),
    message: issue.message,
    code: issue.code,
  }));
}

export function validateSubstanceArticlePayload(article) {
  const result = substanceArticlePayloadSchema.safeParse(article);

  if (!result.success) {
    return {
      ok: false,
      issues: zodIssuesToValidationIssues(result.error),
    };
  }

  return {
    ok: true,
    article,
    issues: [],
  };
}
