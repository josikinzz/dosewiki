/**
 * Manual field metadata overrides.
 * This file contains metadata that cannot be derived from the Zod schema:
 * - Labels (human-readable names)
 * - Section assignments (UI groupings)
 * - Transformers (value converters)
 * - Placeholders and descriptions
 * - Route-dependent flags
 * - Required field markers
 *
 * These overrides are merged with the auto-generated base registry.
 */

import type { FieldMeta, SectionKey } from "./types";
import {
  arrayTransformer,
  doseRangeTransformer,
  durationStageTransformer,
  citationTransformer,
  recordTransformer,
  countryLegalityTransformer,
} from "./transformers";

/**
 * Partial field metadata for overrides.
 * Only include the properties you want to override from the generated base.
 */
export type FieldOverride = Partial<Omit<FieldMeta, "path">> & {
  label: string; // Label is required for all overrides
  section: SectionKey; // Section assignment is required
};

export const FIELD_OVERRIDES: Record<string, FieldOverride> = {
  // ==========================================
  // META FIELDS
  // ==========================================
  id: {
    label: "ID",
    type: "number",
    required: false,
    section: "meta",
    description: "Unique numeric identifier (auto-generated)",
  },
  title: {
    label: "Title",
    type: "text",
    required: false,
    section: "meta",
    description: "Article title (usually same as common name)",
  },
  index_categories: {
    label: "Index Categories",
    type: "tagArray",
    required: false,
    section: "meta",
    transformer: arrayTransformer,
    description: "Categories for indexing (e.g., Psychedelic, Stimulant, Hidden)",
  },
  summary: {
    label: "Summary",
    type: "textarea",
    required: false,
    section: "meta",
    description: "Brief summary of the substance",
  },

  // ==========================================
  // IDENTIFICATION
  // ==========================================
  "identification.common_name": {
    label: "Common Name",
    type: "text",
    required: true,
    section: "identification",
    placeholder: "e.g., LSD, MDMA, Psilocybin",
  },
  "identification.substitutive_name": {
    label: "Substitutive Name",
    type: "text",
    required: false,
    section: "identification",
    placeholder: "e.g., Lysergic acid diethylamide",
  },
  "identification.iupac_name": {
    label: "IUPAC Name",
    type: "text",
    required: false,
    section: "identification",
  },
  "identification.alternative_names": {
    label: "Alternative Names",
    type: "tagArray",
    required: false,
    section: "identification",
    transformer: arrayTransformer,
    placeholder: "Acid, Lucy, Tabs",
  },
  "identification.smiles": {
    label: "SMILES",
    type: "text",
    required: false,
    section: "identification",
    description: "Simplified molecular input line entry system notation",
  },
  "identification.inchi_key": {
    label: "InChI Key",
    type: "text",
    required: false,
    section: "identification",
  },
  "identification.cas_number": {
    label: "CAS Number",
    type: "text",
    required: false,
    section: "identification",
    placeholder: "e.g., 50-37-3",
  },
  "identification.molecular_formula": {
    label: "Molecular Formula",
    type: "text",
    required: false,
    section: "identification",
    placeholder: "e.g., C20H25N3O",
  },
  "identification.molecular_weight": {
    label: "Molecular Weight",
    type: "text",
    required: false,
    section: "identification",
    placeholder: "e.g., 323.43 g/mol",
  },
  "identification.skeletal_structure_image": {
    label: "Structure Image Path",
    type: "text",
    required: false,
    section: "identification",
  },

  // ==========================================
  // CLASSIFICATION
  // ==========================================
  "classification.psychoactive_class": {
    label: "Psychoactive Class",
    type: "tagArray",
    required: false,
    section: "classification",
    transformer: arrayTransformer,
    placeholder: "Psychedelic, Stimulant, Depressant",
  },
  "classification.chemical_class": {
    label: "Chemical Class",
    type: "tagArray",
    required: false,
    section: "classification",
    transformer: arrayTransformer,
    placeholder: "Lysergamide, Phenethylamine, Tryptamine",
  },

  // ==========================================
  // DOSAGE (Route-dependent fields)
  // ==========================================
  "dosage.routes[].route": {
    label: "Route",
    type: "text",
    required: true,
    section: "dosage",
    routeDependent: true,
    placeholder: "Oral, Insufflated, Sublingual",
  },
  "dosage.routes[].bioavailability": {
    label: "Bioavailability",
    type: "text",
    required: false,
    section: "dosage",
    routeDependent: true,
    placeholder: "e.g., 70-80%",
  },
  "dosage.routes[].dose_ranges.threshold": {
    label: "Threshold",
    type: "dose",
    required: false,
    section: "dosage",
    routeDependent: true,
    transformer: doseRangeTransformer,
    placeholder: "e.g., 15-25 ug",
  },
  "dosage.routes[].dose_ranges.light": {
    label: "Light",
    type: "dose",
    required: false,
    section: "dosage",
    routeDependent: true,
    transformer: doseRangeTransformer,
    placeholder: "e.g., 25-75 ug",
  },
  "dosage.routes[].dose_ranges.moderate": {
    label: "Moderate",
    type: "dose",
    required: false,
    section: "dosage",
    routeDependent: true,
    transformer: doseRangeTransformer,
    placeholder: "e.g., 75-150 ug",
  },
  "dosage.routes[].dose_ranges.strong": {
    label: "Strong",
    type: "dose",
    required: false,
    section: "dosage",
    routeDependent: true,
    transformer: doseRangeTransformer,
    placeholder: "e.g., 150-300 ug",
  },
  "dosage.routes[].dose_ranges.heavy": {
    label: "Heavy",
    type: "dose",
    required: false,
    section: "dosage",
    routeDependent: true,
    transformer: doseRangeTransformer,
    placeholder: "e.g., 300+ ug",
  },
  "dosage.routes[].notes": {
    label: "Dosage Notes",
    type: "textarea",
    required: false,
    section: "dosage",
    routeDependent: true,
  },

  // ==========================================
  // DURATION (Route-dependent fields)
  // ==========================================
  "duration.routes[].route": {
    label: "Route",
    type: "text",
    required: true,
    section: "duration",
    routeDependent: true,
  },
  "duration.routes[].stages.onset": {
    label: "Onset",
    type: "duration",
    required: false,
    section: "duration",
    routeDependent: true,
    transformer: durationStageTransformer,
    placeholder: "e.g., 15-30 minutes",
  },
  "duration.routes[].stages.come_up": {
    label: "Come-up",
    type: "duration",
    required: false,
    section: "duration",
    routeDependent: true,
    transformer: durationStageTransformer,
    placeholder: "e.g., 30-60 minutes",
  },
  "duration.routes[].stages.peak": {
    label: "Peak",
    type: "duration",
    required: false,
    section: "duration",
    routeDependent: true,
    transformer: durationStageTransformer,
    placeholder: "e.g., 2-4 hours",
  },
  "duration.routes[].stages.offset": {
    label: "Offset",
    type: "duration",
    required: false,
    section: "duration",
    routeDependent: true,
    transformer: durationStageTransformer,
    placeholder: "e.g., 2-3 hours",
  },
  "duration.routes[].stages.after_effects": {
    label: "After Effects",
    type: "duration",
    required: false,
    section: "duration",
    routeDependent: true,
    transformer: durationStageTransformer,
    placeholder: "e.g., 4-12 hours",
  },
  "duration.routes[].stages.total_duration": {
    label: "Total Duration",
    type: "duration",
    required: false,
    section: "duration",
    routeDependent: true,
    transformer: durationStageTransformer,
    placeholder: "e.g., 8-12 hours",
  },

  // ==========================================
  // SUBJECTIVE EFFECTS
  // ==========================================
  "subjective_effects.notes.overview": {
    label: "Effects Overview",
    type: "textarea",
    required: false,
    section: "subjective_effects",
  },
  "subjective_effects.notes.sensory": {
    label: "Sensory Notes",
    type: "textarea",
    required: false,
    section: "subjective_effects",
  },
  "subjective_effects.notes.cognitive": {
    label: "Cognitive Notes",
    type: "textarea",
    required: false,
    section: "subjective_effects",
  },
  "subjective_effects.notes.physical": {
    label: "Physical Notes",
    type: "textarea",
    required: false,
    section: "subjective_effects",
  },
  "subjective_effects.sensory.visual": {
    label: "Visual Effects",
    type: "tagArray",
    required: false,
    section: "subjective_effects",
    transformer: arrayTransformer,
  },
  "subjective_effects.sensory.auditory": {
    label: "Auditory Effects",
    type: "tagArray",
    required: false,
    section: "subjective_effects",
    transformer: arrayTransformer,
  },
  "subjective_effects.sensory.tactile": {
    label: "Tactile Effects",
    type: "tagArray",
    required: false,
    section: "subjective_effects",
    transformer: arrayTransformer,
  },
  "subjective_effects.sensory.olfactory": {
    label: "Olfactory Effects",
    type: "tagArray",
    required: false,
    section: "subjective_effects",
    transformer: arrayTransformer,
  },
  "subjective_effects.sensory.gustatory": {
    label: "Gustatory Effects",
    type: "tagArray",
    required: false,
    section: "subjective_effects",
    transformer: arrayTransformer,
  },
  "subjective_effects.sensory.multisensory": {
    label: "Multisensory Effects",
    type: "tagArray",
    required: false,
    section: "subjective_effects",
    transformer: arrayTransformer,
  },
  "subjective_effects.cognitive": {
    label: "Cognitive Effects",
    type: "tagArray",
    required: false,
    section: "subjective_effects",
    transformer: arrayTransformer,
  },
  "subjective_effects.physical": {
    label: "Physical Effects",
    type: "tagArray",
    required: false,
    section: "subjective_effects",
    transformer: arrayTransformer,
  },

  // ==========================================
  // COMPARISONS
  // ==========================================
  comparisons: {
    label: "Comparisons",
    type: "object",
    required: false,
    section: "subjective_effects",
    description: "Comparisons to other substances",
  },

  // ==========================================
  // PHARMACOLOGY
  // ==========================================
  "pharmacology.pharmacodynamics": {
    label: "Pharmacodynamics",
    type: "textarea",
    required: false,
    section: "pharmacology",
    description: "Plain-language pharmacodynamics overview",
  },
  "pharmacology.receptor_profile": {
    label: "Receptor Profile",
    type: "object",
    required: false,
    section: "pharmacology",
    description: "Combined mechanism of action and receptor binding data",
  },
  "pharmacology.pharmacokinetics": {
    label: "Pharmacokinetics",
    type: "textarea",
    required: false,
    section: "pharmacology",
  },
  "pharmacology.metabolites": {
    label: "Metabolites",
    type: "tagArray",
    required: false,
    section: "pharmacology",
    transformer: arrayTransformer,
  },

  // ==========================================
  // INTERACTIONS
  // ==========================================
  "interactions.dangerous": {
    label: "Dangerous Interactions",
    type: "tagArray",
    required: false,
    section: "interactions",
    transformer: arrayTransformer,
    description: "Life-threatening combinations",
  },
  "interactions.unsafe": {
    label: "Unsafe Interactions",
    type: "tagArray",
    required: false,
    section: "interactions",
    transformer: arrayTransformer,
    description: "Significantly risky combinations",
  },
  "interactions.caution": {
    label: "Caution Interactions",
    type: "tagArray",
    required: false,
    section: "interactions",
    transformer: arrayTransformer,
    description: "Exercise caution with these combinations",
  },

  // ==========================================
  // REAGENT TESTING
  // ==========================================
  reagent_testing: {
    label: "Reagent Testing",
    type: "object",
    required: false,
    section: "identification",
    transformer: recordTransformer,
    description: "One per line: reagent: color reaction",
  },

  // ==========================================
  // TOLERANCE
  // ==========================================
  "tolerance.full_tolerance": {
    label: "Full Tolerance",
    type: "text",
    required: false,
    section: "tolerance",
    placeholder: "e.g., develops immediately",
  },
  "tolerance.half_tolerance": {
    label: "Half Tolerance",
    type: "text",
    required: false,
    section: "tolerance",
    placeholder: "e.g., 5-7 days",
  },
  "tolerance.baseline_tolerance": {
    label: "Baseline Tolerance",
    type: "text",
    required: false,
    section: "tolerance",
    placeholder: "e.g., 10-14 days",
  },
  "tolerance.cross_tolerance": {
    label: "Cross-tolerance",
    type: "tagArray",
    required: false,
    section: "tolerance",
    transformer: arrayTransformer,
    description: "Other substances with shared tolerance",
  },

  // ==========================================
  // HARM POTENTIAL
  // ==========================================
  "harm_potential.addiction_liability": {
    label: "Addiction Liability",
    type: "textarea",
    required: false,
    section: "harm_potential",
  },
  "harm_potential.dependence_liability": {
    label: "Dependence Liability",
    type: "textarea",
    required: false,
    section: "harm_potential",
  },
  "harm_potential.toxicity.ld50": {
    label: "LD50",
    type: "text",
    required: false,
    section: "harm_potential",
  },
  "harm_potential.toxicity.organ_toxicity": {
    label: "Organ Toxicity",
    type: "textarea",
    required: false,
    section: "harm_potential",
  },
  "harm_potential.toxicity.carcinogenicity": {
    label: "Carcinogenicity",
    type: "text",
    required: false,
    section: "harm_potential",
  },
  "harm_potential.toxicity.other": {
    label: "Other Toxicity",
    type: "textarea",
    required: false,
    section: "harm_potential",
  },
  "harm_potential.risks.psychosis": {
    label: "Psychosis Risk",
    type: "textarea",
    required: false,
    section: "harm_potential",
  },
  "harm_potential.risks.self_harm": {
    label: "Self-harm Risk",
    type: "textarea",
    required: false,
    section: "harm_potential",
  },
  "harm_potential.risks.seizure": {
    label: "Seizure Risk",
    type: "textarea",
    required: false,
    section: "harm_potential",
  },
  "harm_potential.risks.other": {
    label: "Other Risks",
    type: "tagArray",
    required: false,
    section: "harm_potential",
    transformer: arrayTransformer,
  },

  // ==========================================
  // LEGALITY
  // ==========================================
  "legality.international": {
    label: "International Status",
    type: "tagArray",
    required: false,
    section: "legality",
    transformer: arrayTransformer,
    description: "International scheduling (UN conventions, etc.)",
  },
  "legality.countries": {
    label: "Country-specific Status",
    type: "object",
    required: false,
    section: "legality",
    transformer: countryLegalityTransformer,
    description: "One per line: country | status | notes",
  },

  // ==========================================
  // CITATIONS
  // ==========================================
  citations: {
    label: "Citations",
    type: "citation",
    required: false,
    section: "citations",
    transformer: citationTransformer,
    description: "One per line: name | url",
  },

  // ==========================================
  // PLATEAU DOSING (DXM-specific)
  // ==========================================
  "dosage.plateau_dosing": {
    label: "Plateau Dosing",
    type: "object",
    required: false,
    section: "dosage",
    description: "DXM-specific plateau dosing information",
  },
};
