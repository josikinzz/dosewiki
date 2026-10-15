import { z } from "zod";

export const riskLevelSchema = z.enum([
  "extremely_low",
  "low",
  "moderate",
  "high",
  "extremely_high",
]);

export const carcinogenicityLevelSchema = z.enum([
  "confirmed",
  "probable",
  "possible",
  "no_evidence",
  "unknown",
]);

export const evidenceLevelSchema = z.enum([
  "none",
  "negative",
  "limited",
  "positive",
]);

export const antibioticFunctionLevelSchema = z.enum([
  "confirmed",
  "probable",
  "possible",
  "no_evidence",
  "unknown",
]);

const riskFieldSchema = z
  .object({
    level: riskLevelSchema.nullable(),
    description: z.string(),
  })
  .passthrough()

const addictionSchema = z
  .object({
    psychological: riskFieldSchema.optional(),
    physical_dependence: riskFieldSchema.optional(),
  })
  .passthrough()

const ld50EntrySchema = z.object({
  species: z.string(),
  route: z.string(),
  value: z.number().nullable(),
  unit: z.string(),
})

const lethalDosageSchema = z.object({
  ld50: z.array(ld50EntrySchema).optional(),
  notes: z.string().optional(),
})

const organToxicityEntrySchema = z.object({
  system: z.string(),
  findings: z.string(),
  mechanism: z.string(),
  notes: z.string(),
})

const humanEpidemiologicalEvidenceSchema = evidenceLevelSchema.nullable()

const animalModelEvidenceSchema = z
  .object({
    level: evidenceLevelSchema.nullable(),
    species: z.array(z.string()),
  })
  .nullable()

const inVitroEvidenceSchema = z
  .object({
    type: z.string(),
    assay_type: z.string(),
  })
  .nullable()

const mechanisticEvidenceSchema = z
  .object({
    level: evidenceLevelSchema.nullable(),
    basis: z.string(),
  })
  .nullable()

const carcinogenicityEvidenceSchema = z
  .object({
    human_epidemiological: humanEpidemiologicalEvidenceSchema,
    animal_models: animalModelEvidenceSchema,
    in_vitro: inVitroEvidenceSchema,
    mechanistic: mechanisticEvidenceSchema,
  })
  .nullable()

const carcinogenicitySchema = z
  .object({
    level: carcinogenicityLevelSchema.nullable(),
    evidence: carcinogenicityEvidenceSchema.optional(),
    description: z.string().optional(),
  })
  .passthrough()

const antibioticFunctionSchema = z
  .object({
    level: antibioticFunctionLevelSchema.nullable(),
    description: z.string().optional(),
  })
  .passthrough()

const toxicitySchema = z
  .object({
    lethal_dosage: lethalDosageSchema.optional(),
    ld50: z.union([z.array(ld50EntrySchema), z.string()]).optional(),
    organ_toxicity: z.union([z.array(organToxicityEntrySchema), z.string()]).optional(),
    carcinogenicity: z.union([carcinogenicitySchema, z.string()]).optional(),
    antibiotic_function: z.union([antibioticFunctionSchema, z.string()]).optional(),
    other: z.string().optional(),
  })
  .passthrough()

export const harmPotentialSchema = z
  .object({
    addiction: addictionSchema.optional(),
    toxicity: toxicitySchema.optional(),
    psychosis: riskFieldSchema.optional(),
    seizure: riskFieldSchema.optional(),
  })
  .passthrough()
  .optional();

export type RiskLevel = z.infer<typeof riskLevelSchema>;
export type CarcinogenicityLevel = z.infer<typeof carcinogenicityLevelSchema>;
export type EvidenceLevel = z.infer<typeof evidenceLevelSchema>;

export type LD50Entry = z.infer<typeof ld50EntrySchema>;

export type OrganToxicityEntry = z.infer<typeof organToxicityEntrySchema>;
export type HarmPotential = z.infer<typeof harmPotentialSchema>;
