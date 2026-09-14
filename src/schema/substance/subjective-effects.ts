import { z } from "zod";

/** Single effect entry with name and optional description */
const effectEntrySchema = z.object({
  name: z.string(),
  description: z.string(),
})

/** Subcategory with optional note and array of effect entries */
const effectSubcategorySchema = z.object({
  note: z.string(),
  effects: z.array(effectEntrySchema),
})

/** Flexible effect category: subcategory name → subcategory with note and effects */
const effectCategorySchema = z.record(z.string(), effectSubcategorySchema)

/** Sense category with optional note and flexible subcategories */
const senseCategorySchema = z.object({
  note: z.string(),
  subcategories: effectCategorySchema,
})

/** Sensory effects subsection */
const sensoryEffectsSchema = z.object({
  visual: senseCategorySchema,
  auditory: senseCategorySchema,
  tactile: senseCategorySchema,
  olfactory: senseCategorySchema,
  gustatory: senseCategorySchema,
  multisensory: senseCategorySchema,
})

/** Notes for each subjective effects category */
const subjectiveEffectsNotesSchema = z.object({
  overview: z.string(),
  sensory: z.string(),
  cognitive: z.string(),
  physical: z.string(),
})

/** Attribution for subjective effects content */
const subjectiveEffectsAttributionSchema = z.object({
  author: z.string(),
  text: z.string(),
  url: z.string(),
})

/** Subjective effects section */
export const subjectiveEffectsSchema = z.object({
  notes: subjectiveEffectsNotesSchema,
  sensory: sensoryEffectsSchema,
  cognitive: effectCategorySchema,
  physical: effectCategorySchema,
  progressive_stages: effectCategorySchema.nullable().optional(),
  attribution: subjectiveEffectsAttributionSchema.nullable().optional(),
  is_stub: z.boolean().optional(),
  source_overview: z.string().optional(),
});

export type EffectEntry = z.infer<typeof effectEntrySchema>;
export type EffectSubcategory = z.infer<typeof effectSubcategorySchema>;
export type EffectCategory = z.infer<typeof effectCategorySchema>;
export type SenseCategory = z.infer<typeof senseCategorySchema>;

export type SubjectiveEffectsNotes = z.infer<typeof subjectiveEffectsNotesSchema>;

export type SubjectiveEffects = z.infer<typeof subjectiveEffectsSchema>;
