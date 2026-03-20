import { parse, YAMLParseError } from "yaml";
import { substanceArticleSchema, type SubstanceArticle } from "@/schema";

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
    history_culture: normalizeHistoryCulture(raw.history_culture),
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
    bioavailability_notes: getString(obj.bioavailability_notes),
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

  // fifth_plateau is nullable (Plateau Sigma - achieved via redosing, not a single dose)
  const fifthPlateau = obj.fifth_plateau
    ? normalizePlateauDose(obj.fifth_plateau)
    : null;

  return {
    first_plateau: normalizePlateauDose(obj.first_plateau),
    second_plateau: normalizePlateauDose(obj.second_plateau),
    third_plateau: normalizePlateauDose(obj.third_plateau),
    fourth_plateau: normalizePlateauDose(obj.fourth_plateau),
    fifth_plateau: fifthPlateau,
    notes: obj.notes ? getString(obj.notes) : null,
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
    half_life: getString(obj.half_life),
    half_life_notes: getString(obj.half_life_notes),
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
function getSenseCategory(value: unknown): { note: string; subcategories: Record<string, { note: string; effects: { name: string; description: string }[] }> } {
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

  // Normalize receptor_profile array of objects
  const rawProfile = Array.isArray(obj.receptor_profile) ? obj.receptor_profile : [];
  const receptor_profile = rawProfile.map((entry: unknown) => {
    const e = getObject(entry);
    return {
      receptor: getString(e.receptor),
      ...(e.tag ? { tag: getString(e.tag) } : {}),
      ...(e.affinity ? { affinity: getString(e.affinity) } : {}),
      ...(e.efficacy ? { efficacy: getString(e.efficacy) } : {}),
    };
  });

  return {
    summary: getString(obj.summary),
    receptor_profile,
    pharmacokinetics: getString(obj.pharmacokinetics),
    metabolites: getStringArray(obj.metabolites),
    protein_binding: obj.protein_binding ? getString(obj.protein_binding) : undefined,
    volume_of_distribution: obj.volume_of_distribution ? getString(obj.volume_of_distribution) : undefined,
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
  if (!raw) return undefined;
  const obj = getObject(raw);

  // Handle toxicity - can have ld50/organ_toxicity as arrays or strings
  const toxicity = getObject(obj.toxicity);
  const normalizedToxicity: NonNullable<SubstanceArticle["harm_potential"]>["toxicity"] = {};

  // LD50 - preserve array or string format
  if (Array.isArray(toxicity.ld50)) {
    normalizedToxicity.ld50 = toxicity.ld50.map((entry) => {
      const e = getObject(entry);
      return {
        species: getString(e.species),
        route: getString(e.route),
        value: typeof e.value === "number" ? e.value : null,
        unit: getString(e.unit),
      };
    });
  } else if (typeof toxicity.ld50 === "string" && toxicity.ld50) {
    normalizedToxicity.ld50 = toxicity.ld50;
  }

  // Organ toxicity - preserve array or string format
  if (Array.isArray(toxicity.organ_toxicity)) {
    normalizedToxicity.organ_toxicity = toxicity.organ_toxicity.map((entry) => {
      const e = getObject(entry);
      return {
        system: getString(e.system),
        findings: getString(e.findings),
        mechanism: getString(e.mechanism),
        notes: getString(e.notes),
      };
    });
  } else if (typeof toxicity.organ_toxicity === "string" && toxicity.organ_toxicity) {
    normalizedToxicity.organ_toxicity = toxicity.organ_toxicity;
  }

  // Carcinogenicity - can be object or string
  if (toxicity.carcinogenicity && typeof toxicity.carcinogenicity === "object") {
    const carc = getObject(toxicity.carcinogenicity);
    normalizedToxicity.carcinogenicity = {
      level: carc.level as typeof normalizedToxicity.carcinogenicity extends { level: infer L } ? L : never ?? null,
      evidence: carc.evidence as typeof normalizedToxicity.carcinogenicity extends { evidence?: infer E } ? E : never,
      description: getString(carc.description),
    };
  } else if (typeof toxicity.carcinogenicity === "string" && toxicity.carcinogenicity) {
    normalizedToxicity.carcinogenicity = toxicity.carcinogenicity;
  }

  // Antibiotic function
  if (toxicity.antibiotic_function && typeof toxicity.antibiotic_function === "object") {
    const ab = getObject(toxicity.antibiotic_function);
    normalizedToxicity.antibiotic_function = {
      level: ab.level as typeof normalizedToxicity.antibiotic_function extends { level: infer L } ? L : never ?? null,
      description: getString(ab.description),
    };
  }

  // Other toxicity notes
  if (toxicity.other) {
    (normalizedToxicity as Record<string, unknown>).other = getString(toxicity.other);
  }

  // Normalize addiction - new format with psychological and physical_dependence
  const addiction = getObject(obj.addiction);
  const normalizedAddiction: NonNullable<SubstanceArticle["harm_potential"]>["addiction"] = {};

  if (addiction.psychological) {
    const psych = getObject(addiction.psychological);
    normalizedAddiction.psychological = {
      level: psych.level as typeof normalizedAddiction.psychological extends { level: infer L } ? L : never ?? null,
      description: getString(psych.description),
    };
  }

  if (addiction.physical_dependence) {
    const phys = getObject(addiction.physical_dependence);
    normalizedAddiction.physical_dependence = {
      level: phys.level as typeof normalizedAddiction.physical_dependence extends { level: infer L } ? L : never ?? null,
      description: getString(phys.description),
    };
  }

  // Normalize psychosis and seizure - top-level in new schema
  const normalizeRiskField = (field: unknown) => {
    if (!field || typeof field !== "object") return undefined;
    const f = getObject(field);
    const normalizedLevel = typeof f.level === "string"
      ? ({
          "Very High": "extremely_high",
          High: "high",
          Moderate: "moderate",
          Low: "low",
          "Very Low": "extremely_low",
        } as const)[f.level] ?? null
      : null;
    return {
      level: normalizedLevel,
      description: getString(f.description),
    };
  };

  // Build the result, preserving any extra fields via passthrough
  const result: NonNullable<SubstanceArticle["harm_potential"]> = {
    ...(obj as Record<string, unknown>), // Passthrough for legacy fields
    addiction: Object.keys(normalizedAddiction).length > 0 ? normalizedAddiction : undefined,
    toxicity: Object.keys(normalizedToxicity).length > 0 ? normalizedToxicity : undefined,
    psychosis: normalizeRiskField(obj.psychosis),
    seizure: normalizeRiskField(obj.seizure),
  };

  // Clean up undefined values
  if (!result.addiction) delete result.addiction;
  if (!result.toxicity) delete result.toxicity;
  if (!result.psychosis) delete result.psychosis;
  if (!result.seizure) delete result.seizure;

  return result;
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

/**
 * Normalizes a date_range object from YAML.
 * Returns undefined if no valid start date is present.
 */
function normalizeDateRange(raw: unknown): { start: string; end?: string } | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const obj = getObject(raw);
  const start = getString(obj.start);
  if (!start) return undefined;
  const end = getString(obj.end);
  return end ? { start, end } : { start };
}

function normalizeHistoryCulture(raw: unknown): SubstanceArticle["history_culture"] {
  const obj = getObject(raw);

  // Normalize sections array with nested subsections
  const sections = Array.isArray(obj.sections)
    ? obj.sections.map((section) => {
        const sectionObj = getObject(section);
        // Normalize subsections array if present
        const subsections = Array.isArray(sectionObj.subsections)
          ? sectionObj.subsections.map((sub) => {
              const subObj = getObject(sub);
              return {
                heading: getString(subObj.heading),
                content: getString(subObj.content),
                date_range: normalizeDateRange(subObj.date_range),
              };
            })
          : [];
        return {
          heading: getString(sectionObj.heading),
          content: getString(sectionObj.content),
          date_range: normalizeDateRange(sectionObj.date_range),
          subsections,
        };
      })
    : [];

  return {
    content: getString(obj.content),
    sections,
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
