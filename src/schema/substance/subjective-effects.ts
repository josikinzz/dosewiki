import { z } from "zod";

const effectEntrySchema = z.object({
  name: z.string(),
  description: z.string(),
})

const effectSubcategorySchema = z.object({
  note: z.string(),
  effects: z.array(effectEntrySchema),
})

const effectCategorySchema = z.record(z.string(), effectSubcategorySchema)

const senseCategorySchema = z.object({
  note: z.string(),
  subcategories: effectCategorySchema,
})

const sensoryEffectsSchema = z.object({
  visual: senseCategorySchema,
  auditory: senseCategorySchema,
  tactile: senseCategorySchema,
  olfactory: senseCategorySchema,
  gustatory: senseCategorySchema,
  multisensory: senseCategorySchema,
})

const subjectiveEffectsNotesSchema = z.object({
  overview: z.string(),
  sensory: z.string(),
  cognitive: z.string(),
  physical: z.string(),
})

const subjectiveEffectsAttributionSchema = z.object({
  author: z.string(),
  text: z.string(),
  url: z.string(),
})

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
