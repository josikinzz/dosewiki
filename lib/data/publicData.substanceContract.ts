import { z } from "zod";
import { normalizePharmacologySection } from "../article/normalization.mjs";
import {
  doseRangesSchema,
  durationStagesSchema,
  pharmacologySchema,
  projectPublicArticle,
  substanceArticleSchema,
  type PublicArticleProjection,
  type SubstanceArticle,
} from "../../src/schema";

const publicSubstancePrioritySchema = z.enum(["high", "normal", "low"]);
type PublicSubstancePriority = z.infer<typeof publicSubstancePrioritySchema>;

export type PublicSubstanceArticleRecord = PublicArticleProjection<SubstanceArticle> & {
  slug: string;
  publicRevision?: string;
  priority: PublicSubstancePriority;
  /**
   * Public-safe signal that an editor completed manual review of the article.
   * Derived from the editor-only `editorial_review.status`; the underlying
   * review object (and its private notes) is never carried into public data.
   */
  expert_reviewed: boolean;
};

const publicSubstanceArticleRecordSchema = substanceArticleSchema.extend({
  slug: z.string().min(1),
  publicRevision: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  priority: publicSubstancePrioritySchema,
  // Preserved through parsing so an already-projected record keeps its derived
  // flag; `.optional()` lets raw (pre-projection) records parse and have the
  // flag derived from `editorial_review` below.
  expert_reviewed: z.boolean().optional(),
});

const publicSubstanceLibraryReferenceSchema = z.object({
  url: z.string().nullable().optional(),
  doi: z.string().nullable().optional(),
  pmid: z.string().nullable().optional(),
  isbn: z.string().nullable().optional(),
});

const publicSubstanceLibraryDosageSchema = z.object({
  routes: z.array(z.object({
    route: z.string(),
    dose_ranges: doseRangesSchema,
    bioavailability: z.string(),
    notes: z.string(),
  })),
});

const publicSubstanceLibraryDurationSchema = z.object({
  routes: z.array(z.object({
    route: z.string(),
    stages: durationStagesSchema,
  })),
});

const publicSubstanceLibraryInputSchema = z.object({
  id: substanceArticleSchema.shape.id,
  title: substanceArticleSchema.shape.title,
  slug: z.string().min(1),
  priority: publicSubstancePrioritySchema,
  index_categories: substanceArticleSchema.shape.index_categories,
  identification: substanceArticleSchema.shape.identification,
  classification: substanceArticleSchema.shape.classification,
  summary: substanceArticleSchema.shape.summary,
  dosage: publicSubstanceLibraryDosageSchema,
  duration: publicSubstanceLibraryDurationSchema,
  subjective_effects: substanceArticleSchema.shape.subjective_effects,
  pharmacology: pharmacologySchema,
  interactions: substanceArticleSchema.shape.interactions,
  reagent_testing: substanceArticleSchema.shape.reagent_testing,
  tolerance: substanceArticleSchema.shape.tolerance,
  harm_potential: z.object({
    addiction_liability: z.string().optional(),
  }),
  references: z.array(publicSubstanceLibraryReferenceSchema),
  source_citations: substanceArticleSchema.shape.source_citations,
  citations: substanceArticleSchema.shape.citations,
  expert_reviewed: z.boolean(),
})

export type PublicSubstanceLibraryInputRecord = z.infer<
  typeof publicSubstanceLibraryInputSchema
>;

const REFERENCE_TEMPLATES = new Set([
  "cite_journal",
  "cite_book",
  "cite_web",
  "cite_report",
  "cite_database",
  "unknown",
]);

const SENSORY_KEYS = [
  "visual",
  "auditory",
  "tactile",
  "olfactory",
  "gustatory",
  "multisensory",
] as const;

const EVIDENCE_LEVELS = new Set(["none", "negative", "limited", "positive"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function readString(record: Record<string, unknown>, key: string): string {
  return typeof record[key] === "string" ? record[key] : "";
}

function emptyDurationStage() {
  return { min: null, max: null, unit: "" };
}

function readStringArray(record: Record<string, unknown>, key: string): string[] {
  return Array.isArray(record[key]) ? record[key].filter((value): value is string => typeof value === "string") : [];
}

function normalizeRequiredStringArray(record: Record<string, unknown>, key: string): unknown {
  const value = record[key];

  if (value === null || value === undefined) {
    return [];
  }

  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : value;
}

function emptySenseCategory() {
  return { note: "", subcategories: {} };
}

function normalizeEffectCategory(value: unknown) {
  return isRecord(value) ? value : {};
}

function normalizeSenseCategory(value: unknown) {
  if (!isRecord(value)) {
    return emptySenseCategory();
  }

  return {
    note: readString(value, "note"),
    subcategories: isRecord(value.subcategories) ? value.subcategories : {},
  };
}

function normalizeSubjectiveEffects(value: unknown) {
  const record = isRecord(value) ? value : {};
  const notes = isRecord(record.notes) ? record.notes : {};
  const sensory = isRecord(record.sensory) ? record.sensory : {};
  const normalized: Record<string, unknown> = {
    notes: {
      overview: readString(notes, "overview"),
      sensory: readString(notes, "sensory"),
      cognitive: readString(notes, "cognitive"),
      physical: readString(notes, "physical"),
    },
    sensory: Object.fromEntries(
      SENSORY_KEYS.map((key) => [key, normalizeSenseCategory(sensory[key])]),
    ),
    cognitive: normalizeEffectCategory(record.cognitive),
    physical: normalizeEffectCategory(record.physical),
  };

  if (record.progressive_stages === null || isRecord(record.progressive_stages)) {
    normalized.progressive_stages = record.progressive_stages;
  }

  if (typeof record.is_stub === "boolean") {
    normalized.is_stub = record.is_stub;
  }

  if (typeof record.source_overview === "string") {
    normalized.source_overview = record.source_overview;
  }

  if (isRecord(record.attribution)) {
    normalized.attribution = {
      author: readString(record.attribution, "author"),
      text: readString(record.attribution, "text"),
      url: readString(record.attribution, "url"),
    };
  }

  return normalized;
}

function normalizeIdentification(value: unknown, title: unknown) {
  const record = isRecord(value) ? value : {};

  return {
    common_name: readString(record, "common_name") || (typeof title === "string" ? title : ""),
    substitutive_name: readString(record, "substitutive_name"),
    iupac_name: readString(record, "iupac_name"),
    alternative_names: readStringArray(record, "alternative_names"),
    smiles: readString(record, "smiles"),
    inchi_key: readString(record, "inchi_key"),
    cas_number: readString(record, "cas_number"),
    molecular_formula: readString(record, "molecular_formula"),
    molecular_weight: readString(record, "molecular_weight"),
    skeletal_structure_image: readString(record, "skeletal_structure_image"),
    botanical_name: typeof record.botanical_name === "string" ? record.botanical_name : null,
  };
}

function normalizeClassification(value: unknown) {
  const record = isRecord(value) ? value : {};

  return {
    psychoactive_class: normalizeRequiredStringArray(record, "psychoactive_class"),
    chemical_class: normalizeRequiredStringArray(record, "chemical_class"),
  };
}

function normalizeDosage(value: unknown) {
  if (!isRecord(value)) {
    return value;
  }

  return {
    ...value,
    routes: Array.isArray(value.routes)
      ? value.routes.map((route) => {
          if (!isRecord(route)) {
            return route;
          }

          return {
            ...route,
            route: readString(route, "route"),
            bioavailability: readString(route, "bioavailability"),
            bioavailability_notes: readString(route, "bioavailability_notes"),
            notes: readString(route, "notes"),
          };
        })
      : value.routes,
  };
}

function normalizeDurationStage(value: unknown) {
  return isRecord(value) ? value : emptyDurationStage();
}

function normalizeDuration(value: unknown) {
  if (!isRecord(value)) {
    return value;
  }

  return {
    ...value,
    routes: Array.isArray(value.routes)
      ? value.routes.map((route) => {
          if (!isRecord(route)) {
            return route;
          }

          const stages = isRecord(route.stages) ? route.stages : {};

          return {
            ...route,
            route: readString(route, "route"),
            half_life: readString(route, "half_life"),
            half_life_notes: readString(route, "half_life_notes"),
            stages: {
              onset: normalizeDurationStage(stages.onset),
              come_up: normalizeDurationStage(stages.come_up),
              peak: normalizeDurationStage(stages.peak),
              offset: normalizeDurationStage(stages.offset),
              after_effects: normalizeDurationStage(stages.after_effects),
              total_duration: normalizeDurationStage(stages.total_duration),
            },
          };
        })
      : value.routes,
  };
}

function normalizeTolerance(value: unknown) {
  const record = isRecord(value) ? value : {};

  return {
    full_tolerance: readString(record, "full_tolerance"),
    half_tolerance: readString(record, "half_tolerance"),
    baseline_tolerance: readString(record, "baseline_tolerance"),
    cross_tolerance: readStringArray(record, "cross_tolerance"),
  };
}

function normalizePharmacology(value: unknown) {
  return normalizePharmacologySection(value);
}

function omitNullRecordValues(record: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== null));
}

function normalizeEvidenceLevel(value: unknown): unknown {
  return typeof value === "string" && EVIDENCE_LEVELS.has(value) ? value : null;
}

function normalizeCarcinogenicityEvidence(value: unknown) {
  if (!isRecord(value)) {
    return value;
  }

  return {
    ...value,
    human_epidemiological: normalizeEvidenceLevel(value.human_epidemiological),
    animal_models: isRecord(value.animal_models)
      ? {
          ...value.animal_models,
          level: normalizeEvidenceLevel(value.animal_models.level),
          species: readStringArray(value.animal_models, "species"),
        }
      : value.animal_models,
    in_vitro: isRecord(value.in_vitro)
      ? {
          ...value.in_vitro,
          type: readString(value.in_vitro, "type"),
          assay_type: readString(value.in_vitro, "assay_type"),
        }
      : value.in_vitro,
    mechanistic: isRecord(value.mechanistic)
      ? {
          ...value.mechanistic,
          level: normalizeEvidenceLevel(value.mechanistic.level),
          basis: readString(value.mechanistic, "basis"),
        }
      : value.mechanistic,
  };
}

function normalizeCarcinogenicity(value: unknown) {
  if (!isRecord(value)) {
    return value;
  }

  return {
    ...value,
    evidence: normalizeCarcinogenicityEvidence(value.evidence),
  };
}

function normalizeToxicity(value: unknown) {
  if (!isRecord(value)) {
    return value;
  }

  const toxicity = omitNullRecordValues(value);

  return {
    ...toxicity,
    carcinogenicity: normalizeCarcinogenicity(toxicity.carcinogenicity),
  };
}

function normalizeHarmPotential(value: unknown) {
  if (!isRecord(value)) {
    return value;
  }

  return {
    ...value,
    toxicity: normalizeToxicity(value.toxicity),
  };
}

function normalizeReferences(value: unknown) {
  if (!Array.isArray(value)) {
    return value;
  }

  return value.map((reference) => {
    if (!isRecord(reference)) {
      return reference;
    }

    const { template } = reference;
    if (template === null || template === undefined || REFERENCE_TEMPLATES.has(String(template))) {
      return reference;
    }

    return {
      ...reference,
      template: "unknown",
    };
  });
}

function normalizePublicSubstanceRecord(input: unknown): unknown {
  if (!isRecord(input)) {
    return input;
  }

  return {
    ...input,
    priority: input.priority === "hide_for_now" ? "low" : input.priority,
    identification: normalizeIdentification(input.identification, input.title),
    classification: normalizeClassification(input.classification),
    dosage: normalizeDosage(input.dosage),
    duration: normalizeDuration(input.duration),
    subjective_effects: normalizeSubjectiveEffects(input.subjective_effects),
    pharmacology: normalizePharmacology(input.pharmacology),
    reagent_testing: isRecord(input.reagent_testing) ? input.reagent_testing : {},
    tolerance: normalizeTolerance(input.tolerance),
    harm_potential: normalizeHarmPotential(input.harm_potential),
    references: normalizeReferences(input.references),
  };
}

export function parsePublicSubstanceRecord(input: unknown): PublicSubstanceArticleRecord | null {
  const parsed = publicSubstanceArticleRecordSchema.safeParse(normalizePublicSubstanceRecord(input));

  if (!parsed.success) {
    return null;
  }

  // Derive before `projectPublicArticle` strips `editorial_review`. Robust to
  // both inputs: already-projected records carry `expert_reviewed`; raw records
  // still have `editorial_review.status` to derive from.
  const expertReviewed =
    parsed.data.expert_reviewed === true ||
    (parsed.data.editorial_review as { status?: unknown } | undefined)?.status === "completed";
  const publicArticle = projectPublicArticle(parsed.data);
  return {
    ...publicArticle,
    slug: parsed.data.slug,
    priority: parsed.data.priority ?? "normal",
    publicRevision: parsed.data.publicRevision,
    expert_reviewed: expertReviewed,
  };
}

export function parsePublicSubstanceRecords(inputs: unknown[]): PublicSubstanceArticleRecord[] {
  return inputs.flatMap((input) => {
    const parsed = parsePublicSubstanceRecord(input);
    return parsed ? [parsed] : [];
  });
}

export function parsePublicSubstanceLibraryInputRecord(
  input: unknown,
): PublicSubstanceLibraryInputRecord | null {
  const parsed = publicSubstanceLibraryInputSchema.safeParse(
    normalizePublicSubstanceRecord(input),
  );
  return parsed.success ? parsed.data : null;
}

export function parsePublicSubstanceLibraryInputRecords(
  inputs: unknown[],
): PublicSubstanceLibraryInputRecord[] {
  return inputs.flatMap((input) => {
    const parsed = parsePublicSubstanceLibraryInputRecord(input);
    return parsed ? [parsed] : [];
  });
}
