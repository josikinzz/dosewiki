import { parse, YAMLParseError } from "yaml";
import type { GeneratedArticle } from "../types/generatorSchema";

export interface ParseResult {
  success: boolean;
  data?: GeneratedArticle;
  error?: string;
  lineNumber?: number;
}

/**
 * Parses a YAML string into a GeneratedArticle object.
 * Handles malformed YAML gracefully with informative error messages.
 */
export function parseGeneratedYaml(yamlString: string): ParseResult {
  if (!yamlString || !yamlString.trim()) {
    return {
      success: false,
      error: "No YAML content to parse",
    };
  }

  // Strip markdown code fence if present (common when LLM wraps output)
  let cleanedYaml = yamlString.trim();
  if (cleanedYaml.startsWith("```yaml") || cleanedYaml.startsWith("```yml")) {
    cleanedYaml = cleanedYaml.replace(/^```ya?ml\s*\n?/, "");
  }
  if (cleanedYaml.startsWith("```")) {
    cleanedYaml = cleanedYaml.replace(/^```\s*\n?/, "");
  }
  if (cleanedYaml.endsWith("```")) {
    cleanedYaml = cleanedYaml.replace(/\s*```$/, "");
  }

  try {
    const parsed = parse(cleanedYaml);

    if (!parsed || typeof parsed !== "object") {
      return {
        success: false,
        error: "Parsed content is not a valid object",
      };
    }

    // Return the parsed data with defensive defaults
    const article = normalizeArticle(parsed);

    return {
      success: true,
      data: article,
    };
  } catch (error) {
    if (error instanceof YAMLParseError) {
      const lineMatch = error.message.match(/at line (\d+)/);
      const lineNumber = lineMatch ? parseInt(lineMatch[1], 10) : undefined;

      return {
        success: false,
        error: `YAML parsing error: ${error.message}`,
        lineNumber,
      };
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown parsing error",
    };
  }
}

/**
 * Normalizes the parsed YAML into a proper GeneratedArticle with defaults.
 * This provides defensive parsing to handle missing or malformed fields.
 */
function normalizeArticle(raw: Record<string, unknown>): GeneratedArticle {
  return {
    id: typeof raw.id === "number" ? raw.id : null,
    title: getString(raw.title),
    index_categories: getStringArray(raw.index_categories),

    identification: normalizeIdentification(raw.identification),
    summary: getString(raw.summary),
    classification: normalizeClassification(raw.classification),
    dosage: normalizeDosage(raw.dosage),
    duration: normalizeDuration(raw.duration),
    subjective_effects: normalizeSubjectiveEffects(raw.subjective_effects),
    pharmacology: normalizePharmacology(raw.pharmacology),
    interactions: normalizeInteractions(raw.interactions),
    reagent_testing: normalizeReagentTesting(raw.reagent_testing),
    harm_potential: normalizeHarmPotential(raw.harm_potential),
    tolerance: normalizeTolerance(raw.tolerance),
    legality: normalizeLegality(raw.legality),
    citations: normalizeCitations(raw.citations),
  };
}

// Helper functions
function getString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function getNumber(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

function getStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === "string");
  }
  return [];
}

function getObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function normalizeIdentification(raw: unknown): GeneratedArticle["identification"] {
  const obj = getObject(raw);
  return {
    common_name: getString(obj.common_name),
    substitutive_name: getString(obj.substitutive_name),
    iupac_name: getString(obj.iupac_name),
    alternative_names: getStringArray(obj.alternative_names),
    smiles: getString(obj.smiles),
    inchi_key: getString(obj.inchi_key),
    cas_number: getString(obj.cas_number),
    molecular_formula: getString(obj.molecular_formula),
    molecular_weight: getString(obj.molecular_weight),
    skeletal_structure_image: getString(obj.skeletal_structure_image),
  };
}

function normalizeClassification(raw: unknown): GeneratedArticle["classification"] {
  const obj = getObject(raw);
  return {
    psychoactive_class: getStringArray(obj.psychoactive_class),
    chemical_class: getStringArray(obj.chemical_class),
  };
}

function normalizeDoseRange(raw: unknown): GeneratedArticle["dosage"]["routes"][0]["dose_ranges"]["threshold"] {
  const obj = getObject(raw);
  return {
    min: getNumber(obj.min),
    max: getNumber(obj.max),
    unit: getString(obj.unit),
  };
}

function normalizeDoseRanges(raw: unknown): GeneratedArticle["dosage"]["routes"][0]["dose_ranges"] {
  const obj = getObject(raw);
  return {
    threshold: normalizeDoseRange(obj.threshold),
    light: normalizeDoseRange(obj.light),
    moderate: normalizeDoseRange(obj.moderate),
    strong: normalizeDoseRange(obj.strong),
    heavy: normalizeDoseRange(obj.heavy),
  };
}

function normalizeDosageRoute(raw: unknown): GeneratedArticle["dosage"]["routes"][0] {
  const obj = getObject(raw);
  return {
    route: getString(obj.route),
    bioavailability: getString(obj.bioavailability),
    dose_ranges: normalizeDoseRanges(obj.dose_ranges),
    notes: getString(obj.notes),
  };
}

function normalizePlateauDosing(raw: unknown): GeneratedArticle["dosage"]["plateau_dosing"] {
  if (!raw) return null;
  const obj = getObject(raw);
  if (Object.keys(obj).length === 0) return null;

  const normalizePlateauDose = (dose: unknown) => {
    const d = getObject(dose);
    return {
      min: getNumber(d.min),
      max: getNumber(d.max),
      unit: getString(d.unit),
      effects: getString(d.effects),
    };
  };

  return {
    first_plateau: normalizePlateauDose(obj.first_plateau),
    second_plateau: normalizePlateauDose(obj.second_plateau),
    third_plateau: normalizePlateauDose(obj.third_plateau),
    fourth_plateau: normalizePlateauDose(obj.fourth_plateau),
  };
}

function normalizeDosage(raw: unknown): GeneratedArticle["dosage"] {
  const obj = getObject(raw);
  const routes = Array.isArray(obj.routes)
    ? obj.routes.map(normalizeDosageRoute)
    : [];

  return {
    routes,
    plateau_dosing: normalizePlateauDosing(obj.plateau_dosing),
  };
}

function normalizeDurationStage(raw: unknown): GeneratedArticle["duration"]["routes"][0]["stages"]["onset"] {
  const obj = getObject(raw);
  return {
    min: getNumber(obj.min),
    max: getNumber(obj.max),
    unit: getString(obj.unit),
  };
}

function normalizeDurationStages(raw: unknown): GeneratedArticle["duration"]["routes"][0]["stages"] {
  const obj = getObject(raw);
  return {
    onset: normalizeDurationStage(obj.onset),
    come_up: normalizeDurationStage(obj.come_up),
    peak: normalizeDurationStage(obj.peak),
    offset: normalizeDurationStage(obj.offset),
    after_effects: normalizeDurationStage(obj.after_effects),
    total_duration: normalizeDurationStage(obj.total_duration),
  };
}

function normalizeDurationRoute(raw: unknown): GeneratedArticle["duration"]["routes"][0] {
  const obj = getObject(raw);
  return {
    route: getString(obj.route),
    stages: normalizeDurationStages(obj.stages),
  };
}

function normalizeDuration(raw: unknown): GeneratedArticle["duration"] {
  const obj = getObject(raw);
  const routes = Array.isArray(obj.routes)
    ? obj.routes.map(normalizeDurationRoute)
    : [];

  return { routes };
}

function normalizeSubjectiveEffects(raw: unknown): GeneratedArticle["subjective_effects"] {
  const obj = getObject(raw);
  const sensory = getObject(obj.sensory);

  return {
    sensory: {
      visual: getStringArray(sensory.visual),
      auditory: getStringArray(sensory.auditory),
      tactile: getStringArray(sensory.tactile),
      olfactory: getStringArray(sensory.olfactory),
      gustatory: getStringArray(sensory.gustatory),
      multisensory: getStringArray(sensory.multisensory),
    },
    cognitive: getStringArray(obj.cognitive),
    physical: getStringArray(obj.physical),
  };
}

function normalizePharmacology(raw: unknown): GeneratedArticle["pharmacology"] {
  const obj = getObject(raw);
  const receptorBinding = getObject(obj.receptor_binding);

  // Convert receptor binding to Record<string, string>
  const binding: Record<string, string> = {};
  for (const [key, value] of Object.entries(receptorBinding)) {
    binding[key] = getString(value);
  }

  return {
    mechanism_of_action: getStringArray(obj.mechanism_of_action),
    receptor_binding: binding,
    metabolism: getString(obj.metabolism),
    metabolites: getStringArray(obj.metabolites),
    half_life: getString(obj.half_life),
    bioavailability_notes: getString(obj.bioavailability_notes),
  };
}

function normalizeInteractions(raw: unknown): GeneratedArticle["interactions"] {
  const obj = getObject(raw);
  return {
    dangerous: getStringArray(obj.dangerous),
    unsafe: getStringArray(obj.unsafe),
    caution: getStringArray(obj.caution),
  };
}

function normalizeReagentTesting(raw: unknown): Record<string, string> {
  const obj = getObject(raw);
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(obj)) {
    result[key] = getString(value);
  }
  return result;
}

function normalizeHarmPotential(raw: unknown): GeneratedArticle["harm_potential"] {
  const obj = getObject(raw);
  const toxicity = getObject(obj.toxicity);
  const risks = getObject(obj.risks);

  return {
    addiction_liability: getString(obj.addiction_liability),
    dependence_liability: getString(obj.dependence_liability),
    toxicity: {
      ld50: getString(toxicity.ld50),
      organ_toxicity: getString(toxicity.organ_toxicity),
      carcinogenicity: getString(toxicity.carcinogenicity),
      other: getString(toxicity.other),
    },
    risks: {
      psychosis: getString(risks.psychosis),
      self_harm: getString(risks.self_harm),
      seizure: getString(risks.seizure),
      other: getStringArray(risks.other),
    },
  };
}

function normalizeTolerance(raw: unknown): GeneratedArticle["tolerance"] {
  const obj = getObject(raw);
  return {
    full_tolerance: getString(obj.full_tolerance),
    half_tolerance: getString(obj.half_tolerance),
    baseline_tolerance: getString(obj.baseline_tolerance),
    cross_tolerance: getStringArray(obj.cross_tolerance),
  };
}

function normalizeLegality(raw: unknown): GeneratedArticle["legality"] {
  const obj = getObject(raw);
  const countries = getObject(obj.countries);

  const normalizedCountries: Record<string, { status: string; notes: string }> = {};
  for (const [key, value] of Object.entries(countries)) {
    const countryObj = getObject(value);
    normalizedCountries[key] = {
      status: getString(countryObj.status),
      notes: getString(countryObj.notes),
    };
  }

  return {
    international: getStringArray(obj.international),
    countries: normalizedCountries,
  };
}

function normalizeCitations(raw: unknown): GeneratedArticle["citations"] {
  if (!Array.isArray(raw)) return [];

  return raw.map((item) => {
    const obj = getObject(item);
    return {
      name: getString(obj.name),
      url: getString(obj.url),
    };
  });
}
