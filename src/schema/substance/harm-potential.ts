import { z } from "zod";

/** Severity levels for addiction, dependence, and risk assessments */
export const riskLevelSchema = z.enum([
  "extremely_low",
  "low",
  "moderate",
  "high",
  "extremely_high",
]);

/** Carcinogenicity classification levels */
export const carcinogenicityLevelSchema = z.enum([
  "confirmed",
  "probable",
  "possible",
  "no_evidence",
  "unknown",
]);

/** Evidence level for carcinogenicity studies */
export const evidenceLevelSchema = z.enum([
  "none",
  "negative",
  "limited",
  "positive",
]);

/** Antibiotic function classification levels */
export const antibioticFunctionLevelSchema = z.enum([
  "confirmed",
  "probable",
  "possible",
  "no_evidence",
  "unknown",
]);

/** Risk field with severity level and description */
const riskFieldSchema = z
  .object({
    level: riskLevelSchema.nullable(),
    description: z.string(),
  })
  .passthrough()

/** Addiction subsection with psychological and physical components */
const addictionSchema = z
  .object({
    psychological: riskFieldSchema.optional(),
    physical_dependence: riskFieldSchema.optional(),
  })
  .passthrough()

/** Structured LD50 entry */
const ld50EntrySchema = z.object({
  species: z.string(),
  route: z.string(),
  value: z.number().nullable(),
  unit: z.string(),
})

/** Lethal dosage container with LD50 data and freeform notes */
const lethalDosageSchema = z.object({
  ld50: z.array(ld50EntrySchema).optional(),
  notes: z.string().optional(),
})

/** Structured organ toxicity entry */
const organToxicityEntrySchema = z.object({
  system: z.string(),
  findings: z.string(),
  mechanism: z.string(),
  notes: z.string(),
})

/** Human epidemiological evidence for carcinogenicity */
const humanEpidemiologicalEvidenceSchema = evidenceLevelSchema.nullable()

/** Animal model evidence for carcinogenicity */
const animalModelEvidenceSchema = z
  .object({
    level: evidenceLevelSchema.nullable(),
    species: z.array(z.string()),
  })
  .nullable()

/** In vitro evidence for carcinogenicity */
const inVitroEvidenceSchema = z
  .object({
    type: z.string(),
    assay_type: z.string(),
  })
  .nullable()

/** Mechanistic evidence for carcinogenicity */
const mechanisticEvidenceSchema = z
  .object({
    level: evidenceLevelSchema.nullable(),
    basis: z.string(),
  })
  .nullable()

/** Detailed carcinogenicity evidence breakdown */
const carcinogenicityEvidenceSchema = z
  .object({
    human_epidemiological: humanEpidemiologicalEvidenceSchema,
    animal_models: animalModelEvidenceSchema,
    in_vitro: inVitroEvidenceSchema,
    mechanistic: mechanisticEvidenceSchema,
  })
  .nullable()

/** Carcinogenicity subsection with level, evidence, and description */
const carcinogenicitySchema = z
  .object({
    level: carcinogenicityLevelSchema.nullable(),
    evidence: carcinogenicityEvidenceSchema.optional(),
    description: z.string().optional(),
  })
  .passthrough()

/** Antibiotic function subsection */
const antibioticFunctionSchema = z
  .object({
    level: antibioticFunctionLevelSchema.nullable(),
    description: z.string().optional(),
  })
  .passthrough()

/** Toxicity subsection with structured data - accepts both new objects and legacy strings */
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

/** Harm potential section - passthrough for legacy 'risks' object */
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
