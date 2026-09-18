import { z } from "zod";

import { classificationSchema, identificationSchema } from "./classification";
import { dosageSchema } from "./dosage";
import { durationSchema } from "./duration";
import { editorialReviewSchema } from "./editorial";
import { EDITORIAL_REVIEW_DEFAULT } from "./editorialReviewVisibilityPolicy";
import { harmPotentialSchema } from "./harm-potential";
import { historyCultureSchema } from "./history-culture";
import { interactionsSchema } from "./interactions";
import { legalitySchema } from "./legality";
import { drugComparisonSchema, pharmacologySchema } from "./pharmacology";
import { sectionGapsSchema } from "./section-gaps";
import { citationSchema, referenceSchema } from "./shared";
import { subjectiveEffectsSchema } from "./subjective-effects";
import { SUBSTANCE_PRIORITY_VALUES } from "./substanceVisibilityPolicy";

/** Root substance article schema */
export const substanceArticleSchema = z.object({
  id: z.number().nullable(),
  title: z.string(),
  priority: z.enum(SUBSTANCE_PRIORITY_VALUES).nullable().default("normal"),
  index_categories: z.array(z.string()),
  identification: identificationSchema,
  classification: classificationSchema,
  summary: z.string(),
  dosage: dosageSchema,
  duration: durationSchema,
  subjective_effects: subjectiveEffectsSchema,
  comparisons: z.array(drugComparisonSchema),
  pharmacology: pharmacologySchema,
  interactions: interactionsSchema,
  reagent_testing: z.record(z.string(), z.string()),
  tolerance: z.object({
    full_tolerance: z.string(),
    half_tolerance: z.string(),
    baseline_tolerance: z.string(),
    cross_tolerance: z.array(z.string()),
  }),
  harm_potential: harmPotentialSchema,
  history_culture: historyCultureSchema.nullable().optional(),
  legality: legalitySchema,
  editorial_review: editorialReviewSchema.default(EDITORIAL_REVIEW_DEFAULT),
  section_gaps: sectionGapsSchema.optional(),
  references: z.array(referenceSchema).default([]),
  source_citations: z.array(citationSchema).nullable().optional(),
  citations: z.array(citationSchema),
});

export const toleranceSchema = substanceArticleSchema.shape.tolerance;

export type Tolerance = z.infer<typeof toleranceSchema>;
export type SubstanceArticle = z.infer<typeof substanceArticleSchema>;
