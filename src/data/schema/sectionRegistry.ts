import type { SectionMeta, SectionKey } from "./types";

/**
 * Section registry defining UI groupings for form sections.
 * Each section groups related fields and defines display order.
 */

export const SECTION_REGISTRY: SectionMeta[] = [
  {
    key: "meta",
    label: "Meta",
    icon: "lucide:settings",
    description: "Article metadata and categorization",
    fields: ["id", "title", "index_categories", "summary"],
    defaultCollapsed: false,
  },
  {
    key: "identification",
    label: "Identification",
    icon: "lucide:file-text",
    description: "Chemical identification and nomenclature",
    fields: [
      "identification.common_name",
      "identification.substitutive_name",
      "identification.iupac_name",
      "identification.alternative_names",
      "identification.smiles",
      "identification.inchi_key",
      "identification.cas_number",
      "identification.molecular_formula",
      "identification.molecular_weight",
      "identification.skeletal_structure_image",
      "reagent_testing",
    ],
    defaultCollapsed: false,
  },
  {
    key: "classification",
    label: "Classification",
    icon: "lucide:tags",
    description: "Psychoactive and chemical classifications",
    fields: ["classification.psychoactive_class", "classification.chemical_class"],
    defaultCollapsed: false,
  },
  {
    key: "dosage",
    label: "Dosage",
    icon: "lucide:pill",
    description: "Dosage information by route of administration",
    routeDependent: true,
    fields: [
      "dosage.routes[].route",
      "dosage.routes[].bioavailability",
      "dosage.routes[].dose_ranges.threshold",
      "dosage.routes[].dose_ranges.light",
      "dosage.routes[].dose_ranges.moderate",
      "dosage.routes[].dose_ranges.strong",
      "dosage.routes[].dose_ranges.heavy",
      "dosage.routes[].notes",
    ],
    defaultCollapsed: false,
  },
  {
    key: "duration",
    label: "Duration",
    icon: "lucide:clock",
    description: "Duration stages by route of administration",
    routeDependent: true,
    fields: [
      "duration.routes[].route",
      "duration.routes[].stages.onset",
      "duration.routes[].stages.come_up",
      "duration.routes[].stages.peak",
      "duration.routes[].stages.offset",
      "duration.routes[].stages.after_effects",
      "duration.routes[].stages.total_duration",
    ],
    defaultCollapsed: false,
  },
  {
    key: "subjective_effects",
    label: "Subjective Effects",
    icon: "lucide:brain",
    description: "Reported subjective effects and experiences",
    fields: [
      "subjective_effects.notes.overview",
      "subjective_effects.notes.sensory",
      "subjective_effects.notes.cognitive",
      "subjective_effects.notes.physical",
      "subjective_effects.sensory.visual",
      "subjective_effects.sensory.auditory",
      "subjective_effects.sensory.tactile",
      "subjective_effects.sensory.olfactory",
      "subjective_effects.sensory.gustatory",
      "subjective_effects.sensory.multisensory",
      "subjective_effects.cognitive",
      "subjective_effects.physical",
      "comparisons",
    ],
    defaultCollapsed: true,
  },
  {
    key: "pharmacology",
    label: "Pharmacology",
    icon: "lucide:beaker",
    description: "Pharmacological properties and mechanisms",
    fields: [
      "pharmacology.pharmacodynamics",
      "pharmacology.receptor_profile",
      "pharmacology.pharmacokinetics",
      "pharmacology.metabolites",
    ],
    defaultCollapsed: true,
  },
  {
    key: "interactions",
    label: "Interactions",
    icon: "lucide:alert-triangle",
    description: "Drug interaction warnings",
    fields: ["interactions.dangerous", "interactions.unsafe", "interactions.caution"],
    defaultCollapsed: false,
  },
  {
    key: "tolerance",
    label: "Tolerance",
    icon: "lucide:timer",
    description: "Tolerance development and cross-tolerance",
    fields: [
      "tolerance.full_tolerance",
      "tolerance.half_tolerance",
      "tolerance.baseline_tolerance",
      "tolerance.cross_tolerance",
    ],
    defaultCollapsed: true,
  },
  {
    key: "harm_potential",
    label: "Harm Potential",
    icon: "lucide:shield-alert",
    description: "Addiction, toxicity, and health risks",
    fields: [
      "harm_potential.addiction_liability",
      "harm_potential.dependence_liability",
      "harm_potential.toxicity.ld50",
      "harm_potential.toxicity.organ_toxicity",
      "harm_potential.toxicity.carcinogenicity",
      "harm_potential.toxicity.other",
      "harm_potential.risks.psychosis",
      "harm_potential.risks.self_harm",
      "harm_potential.risks.seizure",
      "harm_potential.risks.other",
    ],
    defaultCollapsed: true,
  },
  {
    key: "legality",
    label: "Legality",
    icon: "lucide:scale",
    description: "Legal status by jurisdiction",
    fields: ["legality.international", "legality.countries"],
    defaultCollapsed: true,
  },
  {
    key: "citations",
    label: "Citations",
    icon: "lucide:book-open",
    description: "Reference sources and citations",
    fields: ["citations"],
    defaultCollapsed: true,
  },
];

/**
 * Get section metadata by key
 */
export function getSectionMeta(key: SectionKey): SectionMeta | undefined {
  return SECTION_REGISTRY.find((section) => section.key === key);
}

/**
 * Get all section keys in display order
 */
export function getSectionKeys(): SectionKey[] {
  return SECTION_REGISTRY.map((section) => section.key);
}

/**
 * Get route-dependent sections
 */
export function getRouteDependentSections(): SectionMeta[] {
  return SECTION_REGISTRY.filter((section) => section.routeDependent);
}

/**
 * Get sections that should be collapsed by default
 */
export function getDefaultCollapsedSections(): SectionKey[] {
  return SECTION_REGISTRY.filter((section) => section.defaultCollapsed).map((section) => section.key);
}
