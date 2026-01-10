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
  botanical_name: z.string().default(""),
});

/** Classification section */
export const classificationSchema = z.object({
  psychoactive_class: z.array(z.string()),
  chemical_class: z.array(z.string()),
});

// ============================================================================
// Subjective Effects Schemas
// ============================================================================

/** Sensory effects subsection */
export const sensoryEffectsSchema = z.object({
  visual: z.array(z.string()),
  auditory: z.array(z.string()),
  tactile: z.array(z.string()),
  olfactory: z.array(z.string()),
  gustatory: z.array(z.string()),
  multisensory: z.array(z.string()),
});

/** Notes for each subjective effects category */
export const subjectiveEffectsNotesSchema = z.object({
  overview: z.string(),
  sensory: z.string(),
  cognitive: z.string(),
  physical: z.string(),
});

/** Subjective effects section */
export const subjectiveEffectsSchema = z.object({
  notes: subjectiveEffectsNotesSchema,
  sensory: sensoryEffectsSchema,
  cognitive: z.array(z.string()),
  physical: z.array(z.string()),
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
  half_life: z.string(),
  bioavailability_notes: z.string(),
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
  index_categories: z.array(z.string()),

  identification: identificationSchema,
  summary: z.string(),
  classification: classificationSchema,
  dosage: dosageSchema,
  duration: durationSchema,
  subjective_effects: subjectiveEffectsSchema,
  comparisons: z.array(drugComparisonSchema),
  pharmacology: pharmacologySchema,
  interactions: interactionsSchema,
  reagent_testing: z.record(z.string(), z.string()),
  harm_potential: harmPotentialSchema,
  tolerance: toleranceSchema,
  legality: legalitySchema,
  source_citations: z.array(citationSchema).optional(),
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

export type SensoryEffects = z.infer<typeof sensoryEffectsSchema>;
export type SubjectiveEffectsNotes = z.infer<typeof subjectiveEffectsNotesSchema>;
export type SubjectiveEffects = z.infer<typeof subjectiveEffectsSchema>;

export type DrugComparison = z.infer<typeof drugComparisonSchema>;
export type Pharmacology = z.infer<typeof pharmacologySchema>;

export type Interactions = z.infer<typeof interactionsSchema>;

export type Toxicity = z.infer<typeof toxicitySchema>;
export type Risks = z.infer<typeof risksSchema>;
export type HarmPotential = z.infer<typeof harmPotentialSchema>;

export type Tolerance = z.infer<typeof toleranceSchema>;

export type CountryLegality = z.infer<typeof countryLegalitySchema>;
export type Legality = z.infer<typeof legalitySchema>;

export type Citation = z.infer<typeof citationSchema>;

export type SubstanceArticle = z.infer<typeof substanceArticleSchema>;
