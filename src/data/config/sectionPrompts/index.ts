/**
 * Section-specific prompts for AI generation.
 *
 * IMPORTANT: Prompt content is now loaded exclusively from Convex.
 * This file only exports types and metadata - no static prompt content.
 *
 * To load prompts, use the useSectionPrompt() hook from src/hooks/usePrompts.ts.
 * Run `node scripts/migrate-prompts-to-convex.mjs` to populate prompts.
 */

// Section key type (matches Convex prompt keys without "section_" prefix)
export type SectionKey =
  | "base"
  | "harm_potential"
  | "dosage_duration"
  | "subjective_effects"
  | "pharmacology"
  | "interactions"
  | "tolerance"
  | "history_culture"
  | "legality"
  | "identification"
  | "summary";

// Section metadata for UI
export interface SectionMeta {
  key: SectionKey;
  label: string;
  description: string;
  hasExtractedSources: boolean;
}

export const sectionMetadata: SectionMeta[] = [
  {
    key: "summary",
    label: "Summary",
    description: "Brief overview paragraph introducing the substance",
    hasExtractedSources: true,
  },
  {
    key: "identification",
    label: "Identification & Classification",
    description: "Chemical names, SMILES, CAS numbers, and classification tags",
    hasExtractedSources: false,
  },
  {
    key: "dosage_duration",
    label: "Dosage & Duration",
    description: "Dose ranges by route and duration timelines",
    hasExtractedSources: true,
  },
  {
    key: "subjective_effects",
    label: "Subjective Effects",
    description: "Sensory, cognitive, and physical effects",
    hasExtractedSources: true,
  },
  {
    key: "pharmacology",
    label: "Pharmacology",
    description: "Mechanism of action, receptor binding, metabolism",
    hasExtractedSources: true,
  },
  {
    key: "interactions",
    label: "Interactions",
    description: "Dangerous, unsafe, and caution drug combinations",
    hasExtractedSources: false,
  },
  {
    key: "tolerance",
    label: "Tolerance",
    description: "Tolerance development and cross-tolerance",
    hasExtractedSources: true,
  },
  {
    key: "harm_potential",
    label: "Harm Potential",
    description: "Addiction, toxicity, and health risks",
    hasExtractedSources: true,
  },
  {
    key: "history_culture",
    label: "History & Culture",
    description: "Discovery, medical history, cultural significance, notable figures",
    hasExtractedSources: true,
  },
  {
    key: "legality",
    label: "Legality",
    description: "International and country-specific legal status",
    hasExtractedSources: true,
  },
];

// =============================================================================
// DEPRECATED: Static prompt exports
// These are kept as empty strings for backwards compatibility during transition.
// Use useSectionPrompt() hook instead.
// =============================================================================

/** @deprecated Use useSectionPrompt("base") instead */
export const basePrompt = "";

/** @deprecated Use useSectionPrompt("harm_potential") instead */
export const harmPotentialPrompt = "";

/** @deprecated Use useSectionPrompt("dosage_duration") instead */
export const dosageDurationPrompt = "";

/** @deprecated Use useSectionPrompt("subjective_effects") instead */
export const subjectiveEffectsPrompt = "";

/** @deprecated Use useSectionPrompt("pharmacology") instead */
export const pharmacologyPrompt = "";

/** @deprecated Use useSectionPrompt("interactions") instead */
export const interactionsPrompt = "";

/** @deprecated Use useSectionPrompt("tolerance") instead */
export const tolerancePrompt = "";

/** @deprecated Use useSectionPrompt("history_culture") instead */
export const historyCulturePrompt = "";

/** @deprecated Use useSectionPrompt("legality") instead */
export const legalityPrompt = "";

/** @deprecated Use useSectionPrompt("identification") instead */
export const identificationPrompt = "";

/** @deprecated Use useSectionPrompt("summary") instead */
export const summaryPrompt = "";

/** @deprecated Use useAllPrompts() instead */
export const sectionPrompts = {
  base: basePrompt,
  harm_potential: harmPotentialPrompt,
  dosage_duration: dosageDurationPrompt,
  subjective_effects: subjectiveEffectsPrompt,
  pharmacology: pharmacologyPrompt,
  interactions: interactionsPrompt,
  tolerance: tolerancePrompt,
  history_culture: historyCulturePrompt,
  legality: legalityPrompt,
  identification: identificationPrompt,
  summary: summaryPrompt,
} as const;
