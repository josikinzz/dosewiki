/**
 * Section-specific prompts for AI generation.
 *
 * IMPORTANT: Prompt content is now loaded exclusively from Convex.
 * This file only exports types and metadata - no static prompt content.
 *
 * To load prompts, use the useSectionPrompt() hook from src/hooks/usePrompts.ts.
 * Run `node scripts/migrate-prompts-to-convex.mjs` to populate prompts.
 */

import {
  sectionPromptDescriptors,
  type SectionKey,
} from "../promptRegistry";

export type { SectionKey };

// Section metadata for UI
export interface SectionMeta {
  key: SectionKey;
  label: string;
  description: string;
  hasExtractedSources: boolean;
}

export const sectionMetadata: SectionMeta[] = sectionPromptDescriptors
  .filter((descriptor) => descriptor.editorVisible)
  .map((descriptor) => ({
    key: descriptor.sectionKey,
    label: descriptor.label,
    description: descriptor.description,
    hasExtractedSources: descriptor.sourceMaterial === "extracted",
  }));

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
