/**
 * TypeScript interfaces for the new article generator YAML schema.
 * These types match the structure defined in prompt.md.
 */

// Dose range with min/max/unit
export interface DoseRange {
  min: number | null;
  max: number | null;
  unit: string;
}

// All dose tiers for a route
export interface DoseRanges {
  threshold: DoseRange;
  light: DoseRange;
  moderate: DoseRange;
  strong: DoseRange;
  heavy: DoseRange;
}

// Single dosage route
export interface DosageRoute {
  route: string;
  bioavailability: string;
  dose_ranges: DoseRanges;
  notes: string;
}

// DXM-specific plateau dosing
export interface PlateauDose {
  min: number | null;
  max: number | null;
  unit: string;
  effects: string;
}

export interface PlateauDosing {
  first_plateau: PlateauDose;
  second_plateau: PlateauDose;
  third_plateau: PlateauDose;
  fourth_plateau: PlateauDose;
}

// Dosage section
export interface Dosage {
  routes: DosageRoute[];
  plateau_dosing: PlateauDosing | null;
}

// Duration stage (onset, come_up, etc.)
export interface DurationStage {
  min: number | null;
  max: number | null;
  unit: string;
}

// All duration stages
export interface DurationStages {
  onset: DurationStage;
  come_up: DurationStage;
  peak: DurationStage;
  offset: DurationStage;
  after_effects: DurationStage;
  total_duration: DurationStage;
}

// Single duration route
export interface DurationRoute {
  route: string;
  stages: DurationStages;
}

// Duration section
export interface Duration {
  routes: DurationRoute[];
}

// Identification section
export interface Identification {
  common_name: string;
  substitutive_name: string;
  iupac_name: string;
  alternative_names: string[];
  smiles: string;
  inchi_key: string;
  cas_number: string;
  molecular_formula: string;
  molecular_weight: string;
  skeletal_structure_image: string;
}

// Classification section
export interface Classification {
  psychoactive_class: string[];
  chemical_class: string[];
}

// Sensory effects subsection
export interface SensoryEffects {
  visual: string[];
  auditory: string[];
  tactile: string[];
  olfactory: string[];
  gustatory: string[];
  multisensory: string[];
}

// Notes for each subjective effects category
export interface SubjectiveEffectsNotes {
  overview: string;
  sensory: string;
  cognitive: string;
  physical: string;
}

// Subjective effects section
export interface SubjectiveEffects {
  notes: SubjectiveEffectsNotes;
  sensory: SensoryEffects;
  cognitive: string[];
  physical: string[];
}

// Drug comparison entry
export interface DrugComparison {
  drug: string;
  comparison: string;
}

// Pharmacology section
export interface Pharmacology {
  mechanism_of_action: string[];
  receptor_binding: Record<string, string>;
  metabolism: string;
  metabolites: string[];
  half_life: string;
  bioavailability_notes: string;
}

// Interactions section
export interface Interactions {
  dangerous: string[];
  unsafe: string[];
  caution: string[];
}

// Toxicity subsection
export interface Toxicity {
  ld50: string;
  organ_toxicity: string;
  carcinogenicity: string;
  other: string;
}

// Risks subsection
export interface Risks {
  psychosis: string;
  self_harm: string;
  seizure: string;
  other: string[];
}

// Harm potential section
export interface HarmPotential {
  addiction_liability: string;
  dependence_liability: string;
  toxicity: Toxicity;
  risks: Risks;
}

// Tolerance section
export interface Tolerance {
  full_tolerance: string;
  half_tolerance: string;
  baseline_tolerance: string;
  cross_tolerance: string[];
}

// Country legality entry
export interface CountryLegality {
  status: string;
  notes: string;
}

// Legality section
export interface Legality {
  international: string[];
  countries: Record<string, CountryLegality>;
}

// Citation entry
export interface Citation {
  name: string;
  url: string;
}

// Root generated article type
export interface GeneratedArticle {
  id: number | null;
  title: string;
  index_categories: string[];

  identification: Identification;
  summary: string;
  classification: Classification;
  dosage: Dosage;
  duration: Duration;
  subjective_effects: SubjectiveEffects;
  comparisons: DrugComparison[];
  pharmacology: Pharmacology;
  interactions: Interactions;
  reagent_testing: Record<string, string>;
  harm_potential: HarmPotential;
  tolerance: Tolerance;
  legality: Legality;
  citations: Citation[];
}
