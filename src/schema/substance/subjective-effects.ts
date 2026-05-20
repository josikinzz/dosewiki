import { z } from "zod";

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

/** Sensory effects subsection */
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

export type EffectEntry = z.infer<typeof effectEntrySchema>;
export type EffectSubcategory = z.infer<typeof effectSubcategorySchema>;
export type EffectCategory = z.infer<typeof effectCategorySchema>;
export type SenseCategory = z.infer<typeof senseCategorySchema>;
export type SensoryEffects = z.infer<typeof sensoryEffectsSchema>;
export type SubjectiveEffectsNotes = z.infer<typeof subjectiveEffectsNotesSchema>;
export type SubjectiveEffectsAttribution = z.infer<typeof subjectiveEffectsAttributionSchema>;
export type SubjectiveEffects = z.infer<typeof subjectiveEffectsSchema>;
