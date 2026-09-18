/**
 * Base parsing utilities shared across all source parsers.
 * This file remains the stable public surface for parser callers.
 */

import type { ParserResult, NarrativeContent } from "./types";

export { parseDoseRange, normalizeRoute } from "./base/dose";
export { parseDurationRange } from "./base/duration";
export {
  extractSection,
  extractSubsections,
  extractBulletList,
  extractLabeledBullets,
  parseLabelValueTable,
  stripMarkdownLinks,
  cleanMarkdown,
  stripReferences,
} from "./base/markdown";
export { normalizeCountry, extractStatusAndNotes } from "./base/legality";
export { detectInteractionSeverity } from "./base/interactions";

const POSITIVE_INDICATORS = [
  "euphoria",
  "empathy",
  "sociability",
  "relaxation",
  "creativity",
  "energy",
  "focus",
  "confidence",
  "pleasure",
  "bliss",
  "love",
  "enhanced",
  "increased",
  "heightened",
];

const NEGATIVE_INDICATORS = [
  "anxiety",
  "paranoia",
  "nausea",
  "headache",
  "insomnia",
  "confusion",
  "dizziness",
  "tremor",
  "sweating",
  "vasoconstriction",
  "tachycardia",
  "dehydration",
  "muscle tension",
  "jaw clenching",
  "decreased",
  "impaired",
  "difficulty",
  "suppression",
];

export function createEmptyParserResult(): ParserResult {
  return {
    dosage: [],
    duration: [],
    effects: [],
    interactions: [],
    legal: [],
    internationalLaw: [],
    narrativeContent: createEmptyNarrativeContent(),
    sectionsExtracted: [],
  };
}

export function createEmptyNarrativeContent(): NarrativeContent {
  return {
    experienceReports: [],
    synthesis: [],
    qualitativeComments: [],
    generalNotes: [],
  };
}

export function detectEffectCategory(effectName: string): "positive" | "neutral" | "negative" {
  const lower = effectName.toLowerCase();

  for (const indicator of NEGATIVE_INDICATORS) {
    if (lower.includes(indicator)) return "negative";
  }

  for (const indicator of POSITIVE_INDICATORS) {
    if (lower.includes(indicator)) return "positive";
  }

  return "neutral";
}
