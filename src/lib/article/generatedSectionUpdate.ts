import yaml from "yaml";

import { createEmptyDosageRoute, createEmptyDurationRoute } from "@/data/schema/defaultFactories";
import {
  assertEditorialReviewMutationAllowed,
  dosageSchema,
  durationSchema,
  harmPotentialSchema,
  interactionsSchema,
  legalitySchema,
  pharmacologySchema,
  toleranceSchema,
  type HarmPotential,
  type Interactions,
  type Legality,
  type Pharmacology,
  type SubstanceArticle,
  type Tolerance,
} from "@/schema";
import { normalizePharmacologySection, normalizeRouteName } from "../../../lib/article/normalization.mjs";

export type GeneratedSectionKey =
  | "dosage_duration"
  | "harm_potential"
  | "legality"
  | "tolerance"
  | "interactions"
  | "pharmacology";

export type GeneratedSectionUpdateMode =
  | "preview"
  | "editor_apply"
  | "batch_apply"
  | "prepopulate_apply";

export type GeneratedSectionSource =
  | { kind: "generated_yaml"; content: string }
  | { kind: "normalized"; data: unknown }
  | { kind: "parsed_source"; data: unknown };

type ArticlePatch = Partial<SubstanceArticle>

type GeneratedSectionDiagnostic = {
  level: "info" | "warning" | "error";
  code: string;
  message: string;
}

export type GeneratedSectionUpdateResult = {
  patch: ArticlePatch;
  nextArticle: SubstanceArticle;
  changedFields: string[];
  preservedFields: string[];
  skippedFields: string[];
  touchedSections: string[];
  diagnostics: GeneratedSectionDiagnostic[];
};

type GeneratedPharmacology = Pharmacology & {
  summary?: string;
  route_bioavailability?: Record<string, string>;
  route_half_life?: Record<string, string>;
  route_half_life_notes?: Record<string, string>;
  route_bioavailability_notes?: Record<string, string>;
  bioavailability_notes?: string;
  half_life?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function parseYamlRecord(content: string): Record<string, unknown> {
  if (content.trim().length === 0) {
    throw new Error("Generated YAML is empty.");
  }

  const parsed = yaml.parse(content);
  if (!isRecord(parsed)) {
    throw new Error("Generated YAML must parse to an object.");
  }

  return parsed;
}

function sourceData(sectionKey: GeneratedSectionKey, source: GeneratedSectionSource): unknown {
  const data = source.kind === "generated_yaml" ? parseYamlRecord(source.content) : source.data;
  if (!isRecord(data) || sectionKey === "dosage_duration") {
    return data;
  }

  return data[sectionKey] ?? data;
}

function withoutEditorialReview(data: unknown, diagnostics: GeneratedSectionDiagnostic[], skippedFields: string[]) {
  if (!isRecord(data) || !("editorial_review" in data)) {
    return data;
  }

  const { editorial_review: _editorialReview, ...rest } = data;
  skippedFields.push("editorial_review");
  diagnostics.push({
    level: "warning",
    code: "editorial_review_skipped",
    message: "Skipped editor-only editorial_review from generated section update.",
  });
  return rest;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function sectionRecord(data: unknown, sectionKey: GeneratedSectionKey): Record<string, unknown> {
  if (!isRecord(data)) {
    throw new Error(`Generated ${sectionKey} update must be an object.`);
  }

  return data;
}

function routeRecord(value?: Record<string, string>) {
  return value ?? {};
}

function normalizeHarmPotential(data: unknown): HarmPotential {
  const harmPotential = (isRecord(data) ? data : {}) as NonNullable<HarmPotential>;
  const toxicity = isRecord(harmPotential.toxicity) ? harmPotential.toxicity : {};
  const lethalDosage = isRecord(toxicity.lethal_dosage) ? toxicity.lethal_dosage : {};
  const carcinogenicity = isRecord(toxicity.carcinogenicity) ? toxicity.carcinogenicity : {};
  const antibioticFunction = isRecord(toxicity.antibiotic_function) ? toxicity.antibiotic_function : {};

  return harmPotentialSchema.parse({
    addiction: {
      psychological: {
        level: harmPotential.addiction?.psychological?.level ?? null,
        description: harmPotential.addiction?.psychological?.description ?? "",
      },
      physical_dependence: {
        level: harmPotential.addiction?.physical_dependence?.level ?? null,
        description: harmPotential.addiction?.physical_dependence?.description ?? "",
      },
    },
    toxicity: {
      ...toxicity,
      lethal_dosage: {
        ...lethalDosage,
        notes: typeof lethalDosage.notes === "string" ? lethalDosage.notes : "",
        ld50: Array.isArray(lethalDosage.ld50)
          ? lethalDosage.ld50
          : Array.isArray(toxicity.ld50)
            ? toxicity.ld50
            : [],
      },
      organ_toxicity: Array.isArray(toxicity.organ_toxicity) ? toxicity.organ_toxicity : [],
      carcinogenicity: {
        level: carcinogenicity.level ?? null,
        evidence: carcinogenicity.evidence ?? null,
        description: carcinogenicity.description ?? "",
      },
      antibiotic_function: {
        level: antibioticFunction.level ?? null,
        description: antibioticFunction.description ?? "",
      },
      other: typeof toxicity.other === "string" ? toxicity.other : "",
    },
    psychosis: {
      level: harmPotential.psychosis?.level ?? null,
      description: harmPotential.psychosis?.description ?? "",
    },
    seizure: {
      level: harmPotential.seizure?.level ?? null,
      description: harmPotential.seizure?.description ?? "",
    },
  });
}

function pharmacologyPatch(
  data: unknown,
  article: SubstanceArticle,
  diagnostics: GeneratedSectionDiagnostic[],
): Pick<SubstanceArticle, "pharmacology" | "dosage" | "duration"> {
  const pharmacology = normalizePharmacologySection(data) as GeneratedPharmacology;
  const routeBioMap = routeRecord(pharmacology.route_bioavailability);
  const routeHalfLifeMap = routeRecord(pharmacology.route_half_life);
  const routeHalfLifeNotesMap = routeRecord(pharmacology.route_half_life_notes);
  const routeBioNotesMap = routeRecord(pharmacology.route_bioavailability_notes);

  const dosageRoutes = article.dosage.routes.map((route) => {
    const routeName = normalizeRouteName(route.route);
    return {
      ...route,
      bioavailability: routeBioMap[routeName] ?? route.bioavailability,
      bioavailability_notes: routeBioNotesMap[routeName] ?? route.bioavailability_notes,
    };
  });

  const durationRoutes = article.duration.routes.map((route) => {
    const routeName = normalizeRouteName(route.route);
    return {
      ...route,
      half_life: routeHalfLifeMap[routeName] ?? route.half_life,
      half_life_notes: routeHalfLifeNotesMap[routeName] ?? route.half_life_notes,
    };
  });

  const existingRoutes = new Set(dosageRoutes.map((route) => normalizeRouteName(route.route)));
  const routesToAdd = new Set<string>();
  for (const routeName of [
    ...Object.keys(routeBioMap),
    ...Object.keys(routeBioNotesMap),
    ...Object.keys(routeHalfLifeMap),
    ...Object.keys(routeHalfLifeNotesMap),
  ]) {
    if (!existingRoutes.has(routeName)) {
      routesToAdd.add(routeName);
    }
  }

  for (const routeName of routesToAdd) {
    dosageRoutes.push(createEmptyDosageRoute(routeName, {
      bioavailability: routeBioMap[routeName] ?? "",
      bioavailability_notes: routeBioNotesMap[routeName] ?? "",
    }));
    durationRoutes.push(createEmptyDurationRoute(routeName, {
      half_life: routeHalfLifeMap[routeName] ?? "",
      half_life_notes: routeHalfLifeNotesMap[routeName] ?? "",
    }));
    diagnostics.push({ level: "info", code: "route_added", message: `Added ${routeName} route from generated pharmacology.` });
  }

  return {
    pharmacology: pharmacologySchema.parse({
      pharmacodynamics: pharmacology.pharmacodynamics ?? pharmacology.summary ?? "",
      summary: pharmacology.summary ?? "",
      binding_sites: pharmacology.binding_sites ?? [],
      pharmacokinetics: pharmacology.pharmacokinetics ?? "",
      metabolites: pharmacology.metabolites ?? [],
      protein_binding: pharmacology.protein_binding ?? "",
      volume_of_distribution: pharmacology.volume_of_distribution ?? "",
      route_bioavailability: routeBioMap,
      route_half_life: routeHalfLifeMap,
      route_half_life_notes: routeHalfLifeNotesMap,
      route_bioavailability_notes: routeBioNotesMap,
      bioavailability_notes: pharmacology.bioavailability_notes ?? "",
      half_life: pharmacology.half_life ?? "",
    }),
    dosage: dosageSchema.parse({ ...article.dosage, routes: dosageRoutes }),
    duration: durationSchema.parse({ ...article.duration, routes: durationRoutes }),
  };
}

export function buildGeneratedSectionUpdate(
  currentArticle: SubstanceArticle,
  sectionKey: GeneratedSectionKey,
  source: GeneratedSectionSource,
  mode: GeneratedSectionUpdateMode,
): GeneratedSectionUpdateResult {
  const diagnostics: GeneratedSectionDiagnostic[] = [];
  const skippedFields: string[] = [];
  const data = withoutEditorialReview(sourceData(sectionKey, source), diagnostics, skippedFields);
  let patch: ArticlePatch;

  switch (sectionKey) {
    case "tolerance": {
      const tolerance = sectionRecord(data, sectionKey) as Partial<Tolerance>;
      patch = {
        tolerance: toleranceSchema.parse({
          full_tolerance: tolerance.full_tolerance ?? "",
          half_tolerance: tolerance.half_tolerance ?? "",
          baseline_tolerance: tolerance.baseline_tolerance ?? "",
          cross_tolerance: stringArray(tolerance.cross_tolerance),
        }),
      };
      break;
    }
    case "interactions": {
      const interactions = sectionRecord(data, sectionKey) as Partial<Interactions>;
      patch = {
        interactions: interactionsSchema.parse({
          dangerous: stringArray(interactions.dangerous),
          unsafe: stringArray(interactions.unsafe),
          caution: stringArray(interactions.caution),
        }),
      };
      break;
    }
    case "legality": {
      const legality = sectionRecord(data, sectionKey) as Partial<Legality>;
      patch = {
        legality: legalitySchema.parse({
          international: stringArray(legality.international),
          countries: isRecord(legality.countries) ? legality.countries : currentArticle.legality.countries,
        }),
      };
      break;
    }
    case "harm_potential":
      patch = { harm_potential: normalizeHarmPotential(sectionRecord(data, sectionKey)) };
      break;
    case "dosage_duration": {
      const record = sectionRecord(data, sectionKey);
      const dosage = isRecord(record.dosage) ? record.dosage : {};
      const duration = isRecord(record.duration) ? record.duration : {};
      patch = {
        dosage: dosageSchema.parse({
          ...currentArticle.dosage,
          routes: Array.isArray(dosage.routes) ? dosage.routes : currentArticle.dosage.routes,
        }),
        duration: durationSchema.parse({
          ...currentArticle.duration,
          routes: Array.isArray(duration.routes) ? duration.routes : currentArticle.duration.routes,
        }),
      };
      break;
    }
    case "pharmacology":
      patch = pharmacologyPatch(data, currentArticle, diagnostics);
      break;
  }

  const changedFields = Object.keys(patch).sort();
  assertEditorialReviewMutationAllowed("generated_update", changedFields);

  if (mode === "preview") {
    diagnostics.push({ level: "info", code: "preview", message: "Generated update built in preview mode." });
  }

  return {
    patch,
    nextArticle: { ...currentArticle, ...patch },
    changedFields,
    preservedFields: [],
    skippedFields,
    touchedSections: changedFields,
    diagnostics,
  };
}
