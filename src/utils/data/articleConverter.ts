/**
 * Converts GeneratedArticle (YAML schema) to RawArticle (articles.json schema)
 */
import type { GeneratedArticle } from "../../types/generatorSchema";

// Helper: Format dose range to string "min-max unit"
function formatDoseRange(range: { min: number | null; max: number | null; unit: string }): string {
  if (range.min === null && range.max === null) return "";
  if (range.min === null) return `${range.max}+ ${range.unit}`.trim();
  if (range.max === null) return `${range.min}+ ${range.unit}`.trim();
  if (range.min === range.max) return `${range.min} ${range.unit}`.trim();
  return `${range.min}-${range.max} ${range.unit}`.trim();
}

// Helper: Format duration stage to string
function formatDuration(stage: { min: number | null; max: number | null; unit: string }): string {
  if (stage.min === null && stage.max === null) return "";
  if (stage.min === null) return `${stage.max} ${stage.unit}`.trim();
  if (stage.max === null) return `${stage.min}+ ${stage.unit}`.trim();
  if (stage.min === stage.max) return `${stage.min} ${stage.unit}`.trim();
  return `${stage.min}-${stage.max} ${stage.unit}`.trim();
}

// RawArticle type (matching articles.json schema)
interface RawDoseRanges {
  threshold?: string;
  light?: string;
  moderate?: string;
  strong?: string;
  heavy?: string;
}

interface RawRouteDefinition {
  route: string;
  units: string;
  dose_ranges: RawDoseRanges;
}

interface RawDurationStages {
  total_duration?: string;
  onset?: string;
  come_up?: string;
  peak?: string;
  offset?: string;
  after_effects?: string;
}

interface RawDurationRoute {
  route: string;
  canonical_routes: string[];
  stages: RawDurationStages;
}

interface RawTolerance {
  full_tolerance?: string;
  half_tolerance?: string;
  zero_tolerance?: string;
  cross_tolerances?: string[];
}

interface RawInteractions {
  dangerous?: string[];
  unsafe?: string[];
  caution?: string[];
}

interface RawCitation {
  name: string;
  reference: string;
}

interface RawDrugInfo {
  drug_name: string;
  substitutive_name: string;
  IUPAC_name: string;
  smiles: string;
  botanical_name: string;
  alternative_name: string;
  chemical_class: string;
  psychoactive_class: string;
  mechanism_of_action: string;
  categories: string[];
  dosages: { routes_of_administration: RawRouteDefinition[] };
  duration: { routes_of_administration: RawDurationRoute[] };
  tolerance: RawTolerance;
  half_life: string;
  addiction_potential: string;
  interactions: RawInteractions;
  notes: string;
  subjective_effects: string[];
  citations: RawCitation[];
}

export interface RawArticle {
  id: number;
  title: string;
  "index-category": string;
  drug_info: RawDrugInfo;
}

export function convertGeneratedToRawArticle(generated: GeneratedArticle, id: number): RawArticle {
  // Map dosage routes
  const dosageRoutes = generated.dosage.routes.map((route) => ({
    route: route.route,
    units: route.dose_ranges.threshold.unit || "mg",
    dose_ranges: {
      threshold: formatDoseRange(route.dose_ranges.threshold),
      light: formatDoseRange(route.dose_ranges.light),
      moderate: formatDoseRange(route.dose_ranges.moderate),
      strong: formatDoseRange(route.dose_ranges.strong),
      heavy: formatDoseRange(route.dose_ranges.heavy),
    },
  }));

  // Map duration routes
  const durationRoutes = generated.duration.routes.map((route) => ({
    route: route.route,
    canonical_routes: [route.route.toLowerCase()],
    stages: {
      total_duration: formatDuration(route.stages.total_duration),
      onset: formatDuration(route.stages.onset),
      come_up: formatDuration(route.stages.come_up),
      peak: formatDuration(route.stages.peak),
      offset: formatDuration(route.stages.offset),
      after_effects: formatDuration(route.stages.after_effects),
    },
  }));

  // Flatten subjective effects
  const subjectiveEffects = [
    ...generated.subjective_effects.sensory.visual,
    ...generated.subjective_effects.sensory.auditory,
    ...generated.subjective_effects.sensory.tactile,
    ...generated.subjective_effects.sensory.olfactory,
    ...generated.subjective_effects.sensory.gustatory,
    ...generated.subjective_effects.sensory.multisensory,
    ...generated.subjective_effects.cognitive,
    ...generated.subjective_effects.physical,
  ].filter(Boolean);

  return {
    id,
    title: generated.title || generated.identification.common_name,
    "index-category": generated.index_categories.map(c => c.toLowerCase().replace(/\s+/g, "-")).join(";"),
    drug_info: {
      drug_name: generated.identification.common_name,
      substitutive_name: generated.identification.substitutive_name,
      IUPAC_name: generated.identification.iupac_name,
      smiles: generated.identification.smiles,
      botanical_name: "",
      alternative_name: generated.identification.alternative_names.join("; "),
      chemical_class: generated.classification.chemical_class.join("; "),
      psychoactive_class: generated.classification.psychoactive_class.join("; "),
      mechanism_of_action: generated.pharmacology.mechanism_of_action.join("; "),
      categories: generated.classification.psychoactive_class,
      dosages: { routes_of_administration: dosageRoutes },
      duration: { routes_of_administration: durationRoutes },
      tolerance: {
        full_tolerance: generated.tolerance.full_tolerance,
        half_tolerance: generated.tolerance.half_tolerance,
        zero_tolerance: generated.tolerance.baseline_tolerance,
        cross_tolerances: generated.tolerance.cross_tolerance,
      },
      half_life: generated.pharmacology.half_life,
      addiction_potential: generated.harm_potential.addiction_liability,
      interactions: {
        dangerous: generated.interactions.dangerous,
        unsafe: generated.interactions.unsafe,
        caution: generated.interactions.caution,
      },
      notes: generated.summary,
      subjective_effects: subjectiveEffects,
      citations: generated.citations.map(c => ({ name: c.name, reference: c.url })),
    },
  };
}
