import type { SubstanceArticle } from '@/schema';
import { createEmptyArticle } from '@/data/schema/defaults.generated';

/** Minimal valid article for basic tests */
export const minimalArticle: SubstanceArticle = {
  ...createEmptyArticle(),
  id: 1,
  title: 'Test Substance',
  identification: {
    ...createEmptyArticle().identification,
    common_name: 'Test Substance',
  },
};

/** Article with full dosage/duration data */
export const fullArticleWithDosage: SubstanceArticle = {
  ...createEmptyArticle(),
  id: 42,
  title: 'LSD',
  index_categories: ['Psychedelics', 'Research Chemicals'],
  identification: {
    common_name: 'LSD',
    substitutive_name: 'Lysergic acid diethylamide',
    iupac_name: '(6aR,9R)-N,N-diethyl-7-methyl-6,6a,8,9-tetrahydroindolo[4,3-fg]quinoline-9-carboxamide',
    alternative_names: ['Acid', 'Lucy', 'Tabs'],
    smiles: 'CCN(CC)C(=O)[C@H]1CN([C@@H]2Cc3c[nH]c4cccc(C2=C1)c34)C',
    inchi_key: '',
    cas_number: '50-37-3',
    molecular_formula: 'C20H25N3O',
    molecular_weight: '323.43 g/mol',
    skeletal_structure_image: '',
    botanical_name: null,
  },
  classification: {
    psychoactive_class: ['Psychedelic'],
    chemical_class: ['Lysergamide'],
  },
  dosage: {
    routes: [
      {
        route: 'Sublingual',
        bioavailability: '71%',
        bioavailability_notes: '',
        dose_ranges: {
          threshold: { min: 15, max: null, unit: 'μg' },
          light: { min: 25, max: 75, unit: 'μg' },
          moderate: { min: 75, max: 150, unit: 'μg' },
          strong: { min: 150, max: 300, unit: 'μg' },
          heavy: { min: 300, max: null, unit: 'μg' },
        },
        notes: '',
      },
    ],
    plateau_dosing: null,
  },
  duration: {
    routes: [
      {
        route: 'Sublingual',
        half_life: '',
        half_life_notes: '',
        stages: {
          onset: { min: 15, max: 30, unit: 'minutes' },
          come_up: { min: 45, max: 90, unit: 'minutes' },
          peak: { min: 3, max: 5, unit: 'hours' },
          offset: { min: 3, max: 5, unit: 'hours' },
          after_effects: { min: 6, max: 24, unit: 'hours' },
          total_duration: { min: 8, max: 12, unit: 'hours' },
        },
      },
    ],
  },
  interactions: {
    dangerous: ['Lithium', 'Tramadol'],
    unsafe: [],
    caution: ['Cannabis'],
  },
  pharmacology: {
    ...createEmptyArticle().pharmacology,
    binding_sites: [
      { target: "5-HT2A", tag: "5-HT2A receptor agonist" },
    ],
  },
  subjective_effects: {
    ...createEmptyArticle().subjective_effects,
    notes: { overview: '', sensory: '', cognitive: '', physical: '' },
  },
  tolerance: {
    full_tolerance: '1-2 days',
    half_tolerance: '5-7 days',
    baseline_tolerance: '2 weeks',
    cross_tolerance: ['Psilocybin', 'Mescaline'],
  },
  harm_potential: {
    addiction: {
      psychological: {
        level: 'extremely_low',
        description: 'Low addiction potential.',
      },
      physical_dependence: {
        level: null,
        description: '',
      },
    },
  },
  legality: {
    international: ['Schedule I (UN)'],
    countries: {},
  },
  citations: [
    { name: 'PsychonautWiki', url: 'https://psychonautwiki.org/wiki/LSD' },
  ],
};

/** Article with hidden flag */
export const hiddenArticle: SubstanceArticle = {
  ...minimalArticle,
  id: 99,
  title: 'Hidden Substance',
  index_categories: ['Hidden', 'Test'],
};
