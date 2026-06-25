import type { SubstanceArticle } from "@/schema";
import { normalizeEditorialReviewForEditor } from "@/schema";
import { normalizePharmacologySection } from "../../../../../lib/article/normalization.mjs";
import {
  getEffectCategory,
  getNumber,
  getObject,
  getSenseCategory,
  getString,
  getStringArray,
  normalizeDateRange,
} from "./yamlParserShared";

type NamedUrlItem = {
  name: string;
  url: string;
};

function normalizeNamedUrlItems(raw: unknown): NamedUrlItem[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw.map((entry) => {
    const item = getObject(entry);
    return {
      name: getString(item.name),
      url: getString(item.url),
    };
  });
}

export function normalizeEditorialReview(raw: unknown): SubstanceArticle["editorial_review"] {
  return normalizeEditorialReviewForEditor(raw);
}

export function normalizeSourceCitations(raw: unknown): SubstanceArticle["source_citations"] {
  return normalizeNamedUrlItems(raw);
}

export function normalizeIdentification(raw: unknown): SubstanceArticle["identification"] {
  const item = getObject(raw);
  return {
    common_name: getString(item.common_name),
    substitutive_name: getString(item.substitutive_name),
    iupac_name: getString(item.iupac_name),
    alternative_names: getStringArray(item.alternative_names),
    smiles: getString(item.smiles),
    inchi_key: getString(item.inchi_key),
    cas_number: getString(item.cas_number),
    molecular_formula: getString(item.molecular_formula),
    molecular_weight: getString(item.molecular_weight),
    skeletal_structure_image: getString(item.skeletal_structure_image),
    botanical_name: getString(item.botanical_name),
  };
}

export function normalizeClassification(raw: unknown): SubstanceArticle["classification"] {
  const item = getObject(raw);
  return {
    psychoactive_class: getStringArray(item.psychoactive_class),
    chemical_class: getStringArray(item.chemical_class),
  };
}

function normalizeDoseRange(
  raw: unknown,
): SubstanceArticle["dosage"]["routes"][0]["dose_ranges"]["threshold"] {
  const item = getObject(raw);
  return {
    min: getNumber(item.min),
    max: getNumber(item.max),
    unit: getString(item.unit),
  };
}

function normalizeDoseRanges(raw: unknown): SubstanceArticle["dosage"]["routes"][0]["dose_ranges"] {
  const item = getObject(raw);
  return {
    threshold: normalizeDoseRange(item.threshold),
    light: normalizeDoseRange(item.light),
    moderate: normalizeDoseRange(item.moderate),
    strong: normalizeDoseRange(item.strong),
    heavy: normalizeDoseRange(item.heavy),
  };
}

function normalizeDosageRoute(raw: unknown): SubstanceArticle["dosage"]["routes"][0] {
  const item = getObject(raw);
  const referenceIds = Array.isArray(item.reference_ids) ? getStringArray(item.reference_ids) : undefined;
  return {
    route: getString(item.route),
    bioavailability: getString(item.bioavailability),
    bioavailability_notes: getString(item.bioavailability_notes),
    dose_ranges: normalizeDoseRanges(item.dose_ranges),
    notes: getString(item.notes),
    reference_ids: referenceIds,
  };
}

function normalizePlateauDose(
  raw: unknown,
): NonNullable<SubstanceArticle["dosage"]["plateau_dosing"]>["first_plateau"] {
  const item = getObject(raw);
  return {
    min: getNumber(item.min),
    max: getNumber(item.max),
    unit: getString(item.unit),
    effects: getString(item.effects),
  };
}

function normalizePlateauDosing(raw: unknown): SubstanceArticle["dosage"]["plateau_dosing"] {
  if (!raw) {
    return null;
  }

  const item = getObject(raw);
  if (Object.keys(item).length === 0) {
    return null;
  }

  return {
    first_plateau: normalizePlateauDose(item.first_plateau),
    second_plateau: normalizePlateauDose(item.second_plateau),
    third_plateau: normalizePlateauDose(item.third_plateau),
    fourth_plateau: normalizePlateauDose(item.fourth_plateau),
    fifth_plateau: item.fifth_plateau ? normalizePlateauDose(item.fifth_plateau) : null,
    notes: item.notes ? getString(item.notes) : null,
  };
}

export function normalizeDosage(raw: unknown): SubstanceArticle["dosage"] {
  const item = getObject(raw);
  return {
    routes: Array.isArray(item.routes) ? item.routes.map(normalizeDosageRoute) : [],
    plateau_dosing: normalizePlateauDosing(item.plateau_dosing),
  };
}

function normalizeDurationStage(
  raw: unknown,
): SubstanceArticle["duration"]["routes"][0]["stages"]["onset"] {
  const item = getObject(raw);
  return {
    min: getNumber(item.min),
    max: getNumber(item.max),
    unit: getString(item.unit),
  };
}

function normalizeDurationStages(raw: unknown): SubstanceArticle["duration"]["routes"][0]["stages"] {
  const item = getObject(raw);
  return {
    onset: normalizeDurationStage(item.onset),
    come_up: normalizeDurationStage(item.come_up),
    peak: normalizeDurationStage(item.peak),
    offset: normalizeDurationStage(item.offset),
    after_effects: normalizeDurationStage(item.after_effects),
    total_duration: normalizeDurationStage(item.total_duration),
  };
}

function normalizeDurationRoute(raw: unknown): SubstanceArticle["duration"]["routes"][0] {
  const item = getObject(raw);
  const referenceIds = Array.isArray(item.reference_ids) ? getStringArray(item.reference_ids) : undefined;
  return {
    route: getString(item.route),
    half_life: getString(item.half_life),
    half_life_notes: getString(item.half_life_notes),
    stages: normalizeDurationStages(item.stages),
    reference_ids: referenceIds,
  };
}

export function normalizeDuration(raw: unknown): SubstanceArticle["duration"] {
  const item = getObject(raw);
  return {
    routes: Array.isArray(item.routes) ? item.routes.map(normalizeDurationRoute) : [],
  };
}

export function normalizeSubjectiveEffects(raw: unknown): SubstanceArticle["subjective_effects"] {
  const item = getObject(raw);
  const sensory = getObject(item.sensory);
  const notes = getObject(item.notes);
  const subjectiveEffects: SubstanceArticle["subjective_effects"] = {
    notes: {
      overview: getString(notes.overview),
      sensory: getString(notes.sensory),
      cognitive: getString(notes.cognitive),
      physical: getString(notes.physical),
    },
    sensory: {
      visual: getSenseCategory(sensory.visual),
      auditory: getSenseCategory(sensory.auditory),
      tactile: getSenseCategory(sensory.tactile),
      olfactory: getSenseCategory(sensory.olfactory),
      gustatory: getSenseCategory(sensory.gustatory),
      multisensory: getSenseCategory(sensory.multisensory),
    },
    cognitive: getEffectCategory(item.cognitive),
    physical: getEffectCategory(item.physical),
  };

  if (item.progressive_stages) {
    subjectiveEffects.progressive_stages = getEffectCategory(item.progressive_stages);
  }

  if (typeof item.attribution === "object" && item.attribution) {
    const attribution = getObject(item.attribution);
    subjectiveEffects.attribution = {
      author: getString(attribution.author),
      text: getString(attribution.text),
      url: getString(attribution.url),
    };
  }

  return subjectiveEffects;
}

export function normalizePharmacology(raw: unknown): SubstanceArticle["pharmacology"] {
  return normalizePharmacologySection(raw);
}

export function normalizeInteractions(raw: unknown): SubstanceArticle["interactions"] {
  const item = getObject(raw);
  return {
    dangerous: getStringArray(item.dangerous),
    unsafe: getStringArray(item.unsafe),
    caution: getStringArray(item.caution),
  };
}

export function normalizeReagentTesting(raw: unknown): Record<string, string> {
  const item = getObject(raw);
  return Object.fromEntries(
    Object.entries(item).map(([key, value]) => [key, getString(value)]),
  );
}

export function normalizeTolerance(raw: unknown): SubstanceArticle["tolerance"] {
  const item = getObject(raw);
  return {
    full_tolerance: getString(item.full_tolerance),
    half_tolerance: getString(item.half_tolerance),
    baseline_tolerance: getString(item.baseline_tolerance),
    cross_tolerance: getStringArray(item.cross_tolerance),
  };
}

function normalizeHistoryCultureSubsection(
  raw: unknown,
): SubstanceArticle["history_culture"]["sections"][number]["subsections"][number] {
  const item = getObject(raw);
  return {
    heading: getString(item.heading),
    content: getString(item.content),
    date_range: normalizeDateRange(item.date_range),
  };
}

function normalizeHistoryCultureSection(
  raw: unknown,
): SubstanceArticle["history_culture"]["sections"][number] {
  const item = getObject(raw);
  return {
    heading: getString(item.heading),
    content: getString(item.content),
    date_range: normalizeDateRange(item.date_range),
    subsections: Array.isArray(item.subsections)
      ? item.subsections.map(normalizeHistoryCultureSubsection)
      : [],
  };
}

export function normalizeHistoryCulture(raw: unknown): SubstanceArticle["history_culture"] {
  const item = getObject(raw);
  return {
    content: getString(item.content),
    sections: Array.isArray(item.sections)
      ? item.sections.map(normalizeHistoryCultureSection)
      : [],
  };
}

export function normalizeLegality(raw: unknown): SubstanceArticle["legality"] {
  const item = getObject(raw);
  const countries = getObject(item.countries);
  const normalizedCountries: Record<string, { status: string; notes: string }> = {};

  for (const [country, value] of Object.entries(countries)) {
    const countryData = getObject(value);
    normalizedCountries[country] = {
      status: getString(countryData.status),
      notes: getString(countryData.notes),
    };
  }

  return {
    international: getStringArray(item.international),
    countries: normalizedCountries,
  };
}

export function normalizeCitations(raw: unknown): SubstanceArticle["citations"] {
  return normalizeNamedUrlItems(raw);
}

export function normalizeComparisons(raw: unknown): SubstanceArticle["comparisons"] {
  const items = Array.isArray(raw)
    ? raw
    : Array.isArray(getObject(raw).items)
      ? getObject(raw).items as unknown[]
      : [];

  return items.map((entry) => {
    const item = getObject(entry);
    return {
      drug: getString(item.drug),
      comparison: getString(item.comparison),
    };
  });
}
