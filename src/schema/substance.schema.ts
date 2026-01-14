/**
 * Zod schema definitions for the SubstanceArticle type.
 * This is the SINGLE SOURCE OF TRUTH for the article schema.
 *
 * All types are inferred from the Zod schemas using z.infer<>.
 * When the schema changes, TypeScript types update automatically.
 */

import { z } from "zod";

// ============================================================================
// Shared Schemas (used in multiple places)
// ============================================================================

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

/** Citation entry */
export const citationSchema = z.object({
  name: z.string(),
  url: z.string(),
});

/** Country legality entry */
export const countryLegalitySchema = z.object({
  status: z.string(),
  notes: z.string(),
});

// ============================================================================
// Dosage Schemas
// ============================================================================

/** All dose tiers for a route */
export const doseRangesSchema = z.object({
  threshold: doseRangeSchema,
  light: doseRangeSchema,
  moderate: doseRangeSchema,
  strong: doseRangeSchema,
  heavy: doseRangeSchema,
});

/** Single dosage route */
export const dosageRouteSchema = z.object({
  route: z.string(),
  bioavailability: z.string(),
  bioavailability_notes: z.string().default(""),
  dose_ranges: doseRangesSchema,
  notes: z.string(),
});

/** DXM-specific plateau dose */
export const plateauDoseSchema = z.object({
  min: z.number().nullable(),
  max: z.number().nullable(),
  unit: z.string(),
  effects: z.string(),
});

/** DXM-specific plateau dosing */
export const plateauDosingSchema = z.object({
  first_plateau: plateauDoseSchema,
  second_plateau: plateauDoseSchema,
  third_plateau: plateauDoseSchema,
  fourth_plateau: plateauDoseSchema,
  fifth_plateau: plateauDoseSchema.nullable(), // Plateau Sigma - optional, achieved via redosing
  notes: z.string().nullable(), // Historical context or additional information
});

/** Dosage section */
export const dosageSchema = z.object({
  routes: z.array(dosageRouteSchema),
  plateau_dosing: plateauDosingSchema.nullable(),
});

// ============================================================================
// Duration Schemas
// ============================================================================

/** All duration stages */
export const durationStagesSchema = z.object({
  onset: durationStageSchema,
  come_up: durationStageSchema,
  peak: durationStageSchema,
  offset: durationStageSchema,
  after_effects: durationStageSchema,
  total_duration: durationStageSchema,
});

/** Single duration route */
export const durationRouteSchema = z.object({
  route: z.string(),
  half_life: z.string().default(""),
  half_life_notes: z.string().default(""),
  stages: durationStagesSchema,
});

/** Duration section */
export const durationSchema = z.object({
  routes: z.array(durationRouteSchema),
});

// ============================================================================
// Identification & Classification Schemas
// ============================================================================

/** Identification section */
export const identificationSchema = z.object({
  common_name: z.string(),
  substitutive_name: z.string(),
  iupac_name: z.string(),
  alternative_names: z.array(z.string()),
  smiles: z.string(),
  inchi_key: z.string(),
  cas_number: z.string(),
  molecular_formula: z.string(),
  molecular_weight: z.string(),
  skeletal_structure_image: z.string(),
  botanical_name: z.string().nullable().default(""),
});

/** Classification section */
export const classificationSchema = z.object({
  psychoactive_class: z.array(z.string()),
  chemical_class: z.array(z.string()),
});

// ============================================================================
// Subjective Effects Schemas
// ============================================================================

/** Single effect entry with name and optional description */
export const effectEntrySchema = z.object({
  name: z.string(),
  description: z.string(),
});

/** Subcategory with optional note and array of effect entries */
export const effectSubcategorySchema = z.object({
  note: z.string(),
  effects: z.array(effectEntrySchema),
});

/** Flexible effect category: subcategory name → subcategory with note and effects */
export const effectCategorySchema = z.record(z.string(), effectSubcategorySchema);

/** Sense category with optional note and flexible subcategories */
export const senseCategorySchema = z.object({
  note: z.string(),
  subcategories: effectCategorySchema,
});

/** Sensory effects subsection - each sense has a note and flexible subcategories */
export const sensoryEffectsSchema = z.object({
  visual: senseCategorySchema,
  auditory: senseCategorySchema,
  tactile: senseCategorySchema,
  olfactory: senseCategorySchema,
  gustatory: senseCategorySchema,
  multisensory: senseCategorySchema,
});

/** Notes for each subjective effects category */
export const subjectiveEffectsNotesSchema = z.object({
  overview: z.string(),
  sensory: z.string(),
  cognitive: z.string(),
  physical: z.string(),
});

/** Attribution for subjective effects content */
export const subjectiveEffectsAttributionSchema = z.object({
  author: z.string(),
  text: z.string(),
  url: z.string(),
});

/** Subjective effects section */
export const subjectiveEffectsSchema = z.object({
  notes: subjectiveEffectsNotesSchema,
  sensory: sensoryEffectsSchema,
  cognitive: effectCategorySchema,
  physical: effectCategorySchema,
  progressive_stages: effectCategorySchema.nullable().optional(),
  attribution: subjectiveEffectsAttributionSchema.nullable().optional(),
});

// ============================================================================
// Pharmacology & Comparisons Schemas
// ============================================================================

/** Drug comparison entry */
export const drugComparisonSchema = z.object({
  drug: z.string(),
  comparison: z.string(),
});

/** Pharmacology section */
export const pharmacologySchema = z.object({
  mechanism_of_action: z.array(z.string()),
  receptor_binding: z.record(z.string(), z.string()),
  metabolism: z.string(),
  metabolites: z.array(z.string()),
});

// ============================================================================
// Interactions Schemas
// ============================================================================

/** Interactions section */
export const interactionsSchema = z.object({
  dangerous: z.array(z.string()),
  unsafe: z.array(z.string()),
  caution: z.array(z.string()),
});

// ============================================================================
// Harm Potential Schemas
// ============================================================================

/** Toxicity subsection */
export const toxicitySchema = z.object({
  ld50: z.string(),
  organ_toxicity: z.string(),
  carcinogenicity: z.string(),
  other: z.string(),
});

/** Risks subsection */
export const risksSchema = z.object({
  psychosis: z.string(),
  self_harm: z.string(),
  seizure: z.string(),
  other: z.array(z.string()),
});

/** Harm potential section */
export const harmPotentialSchema = z.object({
  addiction_liability: z.string(),
  dependence_liability: z.string(),
  toxicity: toxicitySchema,
  risks: risksSchema,
});

// ============================================================================
// Tolerance Schemas
// ============================================================================

/** Tolerance section */
export const toleranceSchema = z.object({
  full_tolerance: z.string(),
  half_tolerance: z.string(),
  baseline_tolerance: z.string(),
  cross_tolerance: z.array(z.string()),
});

// ============================================================================
// History & Culture Schemas
// ============================================================================

/** Single subsection within history & culture (freeform heading chosen by author) */
export const historyCultureSectionSchema = z.object({
  heading: z.string(),
  content: z.string(),
});

/** History and culture section - freeform content with optional subsections */
export const historyCultureSchema = z.object({
  content: z.string(), // Freeform paragraphs - use alone for simpler substances
  sections: z.array(historyCultureSectionSchema), // Optional subsections when content warrants structure
});

// ============================================================================
// Legality Schemas
// ============================================================================

/** Legality section */
export const legalitySchema = z.object({
  international: z.array(z.string()),
  countries: z.record(z.string(), countryLegalitySchema),
});

// ============================================================================
// Root Schema
// ============================================================================

/** Root substance article schema */
export const substanceArticleSchema = z.object({
  id: z.number().nullable(),
  title: z.string(),
  priority: z.enum(["high", "normal", "low"]).nullable().default("normal"),
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
  tolerance: toleranceSchema,
  harm_potential: harmPotentialSchema,
  history_culture: historyCultureSchema.nullable().optional(),
  legality: legalitySchema,
  source_citations: z.array(citationSchema).nullable().optional(),
  citations: z.array(citationSchema),
});

// ============================================================================
// Inferred Types (exported for use across codebase)
// ============================================================================

export type DoseRange = z.infer<typeof doseRangeSchema>;
export type DoseRanges = z.infer<typeof doseRangesSchema>;
export type DosageRoute = z.infer<typeof dosageRouteSchema>;
export type PlateauDose = z.infer<typeof plateauDoseSchema>;
export type PlateauDosing = z.infer<typeof plateauDosingSchema>;
export type Dosage = z.infer<typeof dosageSchema>;

export type DurationStage = z.infer<typeof durationStageSchema>;
export type DurationStages = z.infer<typeof durationStagesSchema>;
export type DurationRoute = z.infer<typeof durationRouteSchema>;
export type Duration = z.infer<typeof durationSchema>;

export type Identification = z.infer<typeof identificationSchema>;
export type Classification = z.infer<typeof classificationSchema>;

export type EffectEntry = z.infer<typeof effectEntrySchema>;
export type EffectSubcategory = z.infer<typeof effectSubcategorySchema>;
export type EffectCategory = z.infer<typeof effectCategorySchema>;
export type SenseCategory = z.infer<typeof senseCategorySchema>;
export type SensoryEffects = z.infer<typeof sensoryEffectsSchema>;
export type SubjectiveEffectsNotes = z.infer<typeof subjectiveEffectsNotesSchema>;
export type SubjectiveEffectsAttribution = z.infer<typeof subjectiveEffectsAttributionSchema>;
export type SubjectiveEffects = z.infer<typeof subjectiveEffectsSchema>;

export type DrugComparison = z.infer<typeof drugComparisonSchema>;
export type Pharmacology = z.infer<typeof pharmacologySchema>;

export type Interactions = z.infer<typeof interactionsSchema>;

export type Toxicity = z.infer<typeof toxicitySchema>;
export type Risks = z.infer<typeof risksSchema>;
export type HarmPotential = z.infer<typeof harmPotentialSchema>;

export type Tolerance = z.infer<typeof toleranceSchema>;

export type HistoryCultureSection = z.infer<typeof historyCultureSectionSchema>;
export type HistoryCulture = z.infer<typeof historyCultureSchema>;

export type CountryLegality = z.infer<typeof countryLegalitySchema>;
export type Legality = z.infer<typeof legalitySchema>;

export type Citation = z.infer<typeof citationSchema>;

export type SubstanceArticle = z.infer<typeof substanceArticleSchema>;
