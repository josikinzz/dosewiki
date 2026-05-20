export const TOP_LEVEL_ORDER = [
  'id',
  'title',
  'priority',
  'index_categories',
  'identification',
  'classification',
  'summary',
  'dosage',
  'duration',
  'subjective_effects',
  'comparisons',
  'pharmacology',
  'interactions',
  'reagent_testing',
  'tolerance',
  'harm_potential',
  'history_culture',
  'legality',
  'source_citations',
  'citations',
];

export const IDENTIFICATION_ORDER = [
  'common_name',
  'substitutive_name',
  'iupac_name',
  'alternative_names',
  'smiles',
  'inchi_key',
  'cas_number',
  'molecular_formula',
  'molecular_weight',
  'skeletal_structure_image',
  'botanical_name',
];

export const CLASSIFICATION_ORDER = [
  'psychoactive_class',
  'chemical_class',
];

export const DOSAGE_ORDER = ['routes', 'plateau_dosing'];
export const DOSAGE_ROUTE_ORDER = [
  'route',
  'bioavailability',
  'bioavailability_notes',
  'dose_ranges',
  'notes',
];
export const DOSE_RANGES_ORDER = [
  'threshold',
  'light',
  'moderate',
  'strong',
  'heavy',
];
export const DOSE_RANGE_ORDER = [
  'min',
  'max',
  'unit',
];
export const PLATEAU_DOSE_ORDER = [
  'min',
  'max',
  'unit',
  'effects',
];
export const PLATEAU_DOSING_ORDER = [
  'first_plateau',
  'second_plateau',
  'third_plateau',
  'fourth_plateau',
  'fifth_plateau',
  'notes',
];

export const DURATION_ORDER = ['routes'];
export const DURATION_ROUTE_ORDER = [
  'route',
  'half_life',
  'half_life_notes',
  'stages',
];
export const DURATION_STAGES_ORDER = [
  'onset',
  'come_up',
  'peak',
  'offset',
  'after_effects',
  'total_duration',
];
export const DURATION_STAGE_ORDER = [
  'min',
  'max',
  'unit',
];

export const SUBJECTIVE_EFFECTS_ORDER = [
  'notes',
  'sensory',
  'cognitive',
  'physical',
  'progressive_stages',
  'attribution',
];
export const SUBJECTIVE_EFFECTS_NOTES_ORDER = [
  'overview',
  'sensory',
  'cognitive',
  'physical',
];
export const SENSORY_EFFECTS_ORDER = [
  'visual',
  'auditory',
  'tactile',
  'olfactory',
  'gustatory',
  'multisensory',
];
export const SENSE_CATEGORY_ORDER = [
  'note',
  'subcategories',
];
export const EFFECT_SUBCATEGORY_ORDER = [
  'note',
  'effects',
];
export const EFFECT_ENTRY_ORDER = [
  'name',
  'description',
];
export const ATTRIBUTION_ORDER = [
  'author',
  'text',
  'url',
];

export const PHARMACOLOGY_ORDER = [
  'mechanism_of_action',
  'receptor_binding',
  'metabolism',
  'metabolites',
  'protein_binding',
  'volume_of_distribution',
];
export const INTERACTIONS_ORDER = [
  'dangerous',
  'unsafe',
  'caution',
];
export const TOLERANCE_ORDER = [
  'full_tolerance',
  'half_tolerance',
  'baseline_tolerance',
  'cross_tolerance',
];
export const TOXICITY_ORDER = [
  'ld50',
  'organ_toxicity',
  'carcinogenicity',
  'other',
];
export const RISKS_ORDER = [
  'psychosis',
  'self_harm',
  'seizure',
  'other',
];
export const HARM_POTENTIAL_ORDER = [
  'addiction_liability',
  'dependence_liability',
  'toxicity',
  'risks',
];

export const HISTORY_CULTURE_DATE_RANGE_ORDER = [
  'start',
  'end',
];
export const HISTORY_CULTURE_SUBSECTION_ORDER = [
  'heading',
  'content',
  'date_range',
];
export const HISTORY_CULTURE_SECTION_ORDER = [
  'heading',
  'content',
  'date_range',
  'subsections',
  'icon',
];
export const HISTORY_CULTURE_ORDER = [
  'content',
  'sections',
];

export const LEGALITY_ORDER = [
  'international',
  'countries',
];
export const COUNTRY_LEGALITY_ORDER = [
  'status',
  'notes',
];
export const CITATION_ORDER = [
  'name',
  'url',
];
export const DRUG_COMPARISON_ORDER = [
  'drug',
  'comparison',
];
