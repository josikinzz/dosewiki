import { parse, YAMLParseError } from "yaml";
import { substanceArticleSchema, type SubstanceArticle } from "../../../../schema";

export interface ParseResult {
  success: boolean;
  data?: SubstanceArticle;
  error?: string;
  lineNumber?: number;
}

/**
 * Parses a YAML string into a SubstanceArticle object.
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

    // Normalize first (fills in defaults for missing fields)
    const article = normalizeArticle(parsed);

    // Validate with Zod
    const validation = substanceArticleSchema.safeParse(article);

    if (!validation.success) {
      // Return first validation error for user feedback
      const firstIssue = validation.error.issues[0];
      return {
        success: false,
        error: `Validation error at ${firstIssue.path.join(".")}: ${firstIssue.message}`,
      };
    }

    return {
      success: true,
      data: validation.data,
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
 * Normalizes the parsed YAML into a proper SubstanceArticle with defaults.
 * This provides defensive parsing to handle missing or malformed fields.
 */
function normalizeArticle(raw: Record<string, unknown>): SubstanceArticle {
  // Normalize priority with validation
  const rawPriority = raw.priority;
  const priority = rawPriority === "high" || rawPriority === "normal" || rawPriority === "low"
    ? rawPriority
    : "normal";

  return {
    id: typeof raw.id === "number" ? raw.id : null,
    title: getString(raw.title),
    priority,
    index_categories: getStringArray(raw.index_categories),

    identification: normalizeIdentification(raw.identification),
    summary: getString(raw.summary),
    classification: normalizeClassification(raw.classification),
    dosage: normalizeDosage(raw.dosage),
    duration: normalizeDuration(raw.duration),
    subjective_effects: normalizeSubjectiveEffects(raw.subjective_effects),
    comparisons: normalizeComparisons(raw.comparisons),
    pharmacology: normalizePharmacology(raw.pharmacology),
    interactions: normalizeInteractions(raw.interactions),
    reagent_testing: normalizeReagentTesting(raw.reagent_testing),
    harm_potential: normalizeHarmPotential(raw.harm_potential),
    tolerance: normalizeTolerance(raw.tolerance),
    legality: normalizeLegality(raw.legality),
    source_citations: normalizeSourceCitations(raw.source_citations),
    citations: normalizeCitations(raw.citations),
  };
}

function normalizeSourceCitations(raw: unknown): SubstanceArticle["source_citations"] {
  if (!Array.isArray(raw)) return [];

  return raw.map((item) => {
    const obj = getObject(item);
    return {
      name: getString(obj.name),
      url: getString(obj.url),
    };
  });
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

/**
 * Normalizes an array of effects to EffectEntry[] format.
 */
function normalizeEffectsArray(effects: unknown): { name: string; description: string }[] {
  if (!Array.isArray(effects)) return [];
  return effects
    .map((effect) => {
      if (typeof effect === "string") {
        return { name: effect, description: "" };
      }
      if (effect && typeof effect === "object") {
        return {
          name: getString((effect as Record<string, unknown>).name),
          description: getString((effect as Record<string, unknown>).description),
        };
      }
      return null;
    })
    .filter((e): e is { name: string; description: string } => e !== null && e.name.length > 0);
}

/**
 * Converts effect data to the flexible Record<string, { note, effects }> format.
 * Supports:
 * - Legacy format: string[] (converts to { General: { note: "", effects: [...] } })
 * - Old format: { subcategory: [{ name, description }] }
 * - New format: { subcategory: { note, effects: [...] } }
 */
function getEffectCategory(value: unknown): Record<string, { note: string; effects: { name: string; description: string }[] }> {
  // Handle legacy string array format
  if (Array.isArray(value)) {
    const effects = normalizeEffectsArray(value);
    return effects.length > 0 ? { General: { note: "", effects } } : {};
  }

  // Handle structured format
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const result: Record<string, { note: string; effects: { name: string; description: string }[] }> = {};
    for (const [subcategory, subcategoryData] of Object.entries(value)) {
      // New format: { note, effects }
      if (subcategoryData && typeof subcategoryData === "object" && !Array.isArray(subcategoryData) && "effects" in subcategoryData) {
        const obj = subcategoryData as Record<string, unknown>;
        const effects = normalizeEffectsArray(obj.effects);
        if (effects.length > 0 || getString(obj.note)) {
          result[subcategory] = {
            note: getString(obj.note),
            effects,
          };
        }
      }
      // Old format: subcategory is directly an array of effects
      else if (Array.isArray(subcategoryData)) {
        const effects = normalizeEffectsArray(subcategoryData);
        if (effects.length > 0) {
          result[subcategory] = { note: "", effects };
        }
      }
    }
    return result;
  }

  return {};
}

function normalizeIdentification(raw: unknown): SubstanceArticle["identification"] {
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
    botanical_name: getString(obj.botanical_name),
  };
}

function normalizeClassification(raw: unknown): SubstanceArticle["classification"] {
  const obj = getObject(raw);
  return {
    psychoactive_class: getStringArray(obj.psychoactive_class),
    chemical_class: getStringArray(obj.chemical_class),
  };
}

function normalizeDoseRange(raw: unknown): SubstanceArticle["dosage"]["routes"][0]["dose_ranges"]["threshold"] {
  const obj = getObject(raw);
  return {
    min: getNumber(obj.min),
    max: getNumber(obj.max),
    unit: getString(obj.unit),
  };
}

function normalizeDoseRanges(raw: unknown): SubstanceArticle["dosage"]["routes"][0]["dose_ranges"] {
  const obj = getObject(raw);
  return {
    threshold: normalizeDoseRange(obj.threshold),
    light: normalizeDoseRange(obj.light),
    moderate: normalizeDoseRange(obj.moderate),
    strong: normalizeDoseRange(obj.strong),
    heavy: normalizeDoseRange(obj.heavy),
  };
}

function normalizeDosageRoute(raw: unknown): SubstanceArticle["dosage"]["routes"][0] {
  const obj = getObject(raw);
  return {
    route: getString(obj.route),
    bioavailability: getString(obj.bioavailability),
    dose_ranges: normalizeDoseRanges(obj.dose_ranges),
    notes: getString(obj.notes),
  };
}

function normalizePlateauDosing(raw: unknown): SubstanceArticle["dosage"]["plateau_dosing"] {
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

function normalizeDosage(raw: unknown): SubstanceArticle["dosage"] {
  const obj = getObject(raw);
  const routes = Array.isArray(obj.routes)
    ? obj.routes.map(normalizeDosageRoute)
    : [];

  return {
    routes,
    plateau_dosing: normalizePlateauDosing(obj.plateau_dosing),
  };
}

function normalizeDurationStage(raw: unknown): SubstanceArticle["duration"]["routes"][0]["stages"]["onset"] {
  const obj = getObject(raw);
  return {
    min: getNumber(obj.min),
    max: getNumber(obj.max),
    unit: getString(obj.unit),
  };
}

function normalizeDurationStages(raw: unknown): SubstanceArticle["duration"]["routes"][0]["stages"] {
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

function normalizeDurationRoute(raw: unknown): SubstanceArticle["duration"]["routes"][0] {
  const obj = getObject(raw);
  return {
    route: getString(obj.route),
    stages: normalizeDurationStages(obj.stages),
  };
}

function normalizeDuration(raw: unknown): SubstanceArticle["duration"] {
  const obj = getObject(raw);
  const routes = Array.isArray(obj.routes)
    ? obj.routes.map(normalizeDurationRoute)
    : [];

  return { routes };
}

/**
 * Converts sense data to the { note, subcategories } format.
 * Supports both:
 * - Legacy format: Record<string, EffectEntry[]> (wraps in { note: "", subcategories: ... })
 * - New format: { note, subcategories }
 */
function getSenseCategory(value: unknown): { note: string; subcategories: Record<string, { name: string; description: string }[]> } {
  if (!value || typeof value !== "object") {
    return { note: "", subcategories: {} };
  }

  const obj = value as Record<string, unknown>;

  // Check if it's the new format with explicit note and subcategories
  if ("subcategories" in obj) {
    return {
      note: getString(obj.note),
      subcategories: getEffectCategory(obj.subcategories),
    };
  }

  // Legacy format: treat the whole object as subcategories
  return {
    note: "",
    subcategories: getEffectCategory(value),
  };
}

function normalizeSubjectiveEffects(raw: unknown): SubstanceArticle["subjective_effects"] {
  const obj = getObject(raw);
  const sensory = getObject(obj.sensory);
  const notes = getObject(obj.notes);

  // Build base result
  const result: SubstanceArticle["subjective_effects"] = {
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
    cognitive: getEffectCategory(obj.cognitive),
    physical: getEffectCategory(obj.physical),
  };

  // Add optional progressive_stages if present
  if (obj.progressive_stages) {
    result.progressive_stages = getEffectCategory(obj.progressive_stages);
  }

  // Add optional attribution if present
  if (obj.attribution && typeof obj.attribution === "object") {
    const attrObj = getObject(obj.attribution);
    result.attribution = {
      author: getString(attrObj.author),
      text: getString(attrObj.text),
      url: getString(attrObj.url),
    };
  }

  return result;
}

function normalizePharmacology(raw: unknown): SubstanceArticle["pharmacology"] {
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

function normalizeInteractions(raw: unknown): SubstanceArticle["interactions"] {
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

function normalizeHarmPotential(raw: unknown): SubstanceArticle["harm_potential"] {
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

function normalizeTolerance(raw: unknown): SubstanceArticle["tolerance"] {
  const obj = getObject(raw);
  return {
    full_tolerance: getString(obj.full_tolerance),
    half_tolerance: getString(obj.half_tolerance),
    baseline_tolerance: getString(obj.baseline_tolerance),
    cross_tolerance: getStringArray(obj.cross_tolerance),
  };
}

function normalizeLegality(raw: unknown): SubstanceArticle["legality"] {
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

function normalizeCitations(raw: unknown): SubstanceArticle["citations"] {
  if (!Array.isArray(raw)) return [];

  return raw.map((item) => {
    const obj = getObject(item);
    return {
      name: getString(obj.name),
      url: getString(obj.url),
    };
  });
}

function normalizeComparisons(raw: unknown): SubstanceArticle["comparisons"] {
  // Handle both formats:
  // 1. comparisons: [...] (flat array - preferred)
  // 2. comparisons: { items: [...] } (legacy nested format)
  let items: unknown[] = [];

  if (Array.isArray(raw)) {
    items = raw;
  } else {
    const obj = getObject(raw);
    if (Array.isArray(obj.items)) {
      items = obj.items;
    }
  }

  return items.map((item) => {
    const itemObj = getObject(item);
    return {
      drug: getString(itemObj.drug),
      comparison: getString(itemObj.comparison),
    };
  });
}
