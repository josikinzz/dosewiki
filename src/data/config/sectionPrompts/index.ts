// Section-specific prompts for AI generation
// Each prompt is imported as raw markdown

import basePrompt from './base.md?raw';
import harmPotentialPrompt from './harmPotential.md?raw';
import dosageDurationPrompt from './dosageDuration.md?raw';
import subjectiveEffectsPrompt from './subjectiveEffects.md?raw';
import pharmacologyPrompt from './pharmacology.md?raw';
import interactionsPrompt from './interactions.md?raw';
import tolerancePrompt from './tolerance.md?raw';
import legalityPrompt from './legality.md?raw';
import identificationPrompt from './identification.md?raw';

export const sectionPrompts = {
  base: basePrompt,
  harm_potential: harmPotentialPrompt,
  dosage_duration: dosageDurationPrompt,
  subjective_effects: subjectiveEffectsPrompt,
  pharmacology: pharmacologyPrompt,
  interactions: interactionsPrompt,
  tolerance: tolerancePrompt,
  legality: legalityPrompt,
  identification: identificationPrompt,
} as const;

export type SectionKey = keyof typeof sectionPrompts;

// Section metadata for UI
export interface SectionMeta {
  key: SectionKey;
  label: string;
  description: string;
  hasExtractedSources: boolean;
}

export const sectionMetadata: SectionMeta[] = [
  {
    key: 'identification',
    label: 'Identification & Classification',
    description: 'Chemical names, SMILES, CAS numbers, and classification tags',
    hasExtractedSources: false,
  },
  {
    key: 'dosage_duration',
    label: 'Dosage & Duration',
    description: 'Dose ranges by route and duration timelines',
    hasExtractedSources: false,
  },
  {
    key: 'subjective_effects',
    label: 'Subjective Effects',
    description: 'Sensory, cognitive, and physical effects',
    hasExtractedSources: false,
  },
  {
    key: 'pharmacology',
    label: 'Pharmacology',
    description: 'Mechanism of action, receptor binding, metabolism',
    hasExtractedSources: false,
  },
  {
    key: 'interactions',
    label: 'Interactions',
    description: 'Dangerous, unsafe, and caution drug combinations',
    hasExtractedSources: false,
  },
  {
    key: 'harm_potential',
    label: 'Harm Potential',
    description: 'Addiction, toxicity, and health risks',
    hasExtractedSources: true, // harmpotential-quotes folder exists
  },
  {
    key: 'tolerance',
    label: 'Tolerance',
    description: 'Tolerance development and cross-tolerance',
    hasExtractedSources: false,
  },
  {
    key: 'legality',
    label: 'Legality',
    description: 'International and country-specific legal status',
    hasExtractedSources: false,
  },
];

export {
  basePrompt,
  harmPotentialPrompt,
  dosageDurationPrompt,
  subjectiveEffectsPrompt,
  pharmacologyPrompt,
  interactionsPrompt,
  tolerancePrompt,
  legalityPrompt,
  identificationPrompt,
};
