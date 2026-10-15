export interface EffectIndexHomeIntroCopy {
  lead: string;
  method: string;
  organisation: string;
}

export const EFFECT_INDEX_HOME_INTRO_COPY_KEYS = {
  lead: "effect-index-home-intro-lead",
  method: "effect-index-home-intro-method",
  organisation: "effect-index-home-intro-organisation",
} as const;

export const EFFECT_INDEX_HOME_PANEL_BLURBS_KEY = "effect-index-home-panel-blurbs";

export const EFFECT_INDEX_HOME_INTRO_FALLBACK: EffectIndexHomeIntroCopy = {
  lead: "**Effect Index,** is a resource dedicated to establishing the field of formalised subjective effect documentation. It is the home of the [Subjective Effect Index](/effects) (SEI), which contains {{effectCount}} effect descriptions that exist to serve as a comprehensive map of all potential experiences that can occur under the influence of any class of psychoactive compound, particularly hallucinogens.",
  method:
    "The effects identified here are accompanied by detailed descriptions of how it feels to experience them. These are written in an objective and [consistent writing style](/documentation-style-guide) based upon phenomenological observation and avoids the use of metaphor or analogy. The descriptions also strive to use language that is as simple and understandable as possible. This has been done with the hope that they will serve as a universal terminology that allows people to describe and discuss that which was previously considered ineffable.",
  organisation:
    "These effects are organised into categories based on the sense affected and their behaviour. Many of these are further broken down into levels, subcomponents, and variations in style, which can occur across different substances. Detailed [replications](/replications) are included whenever possible to supplement the text descriptions in the form of images, audio clips, and animations.",
};

export const EFFECT_INDEX_HOME_PANEL_BLURB_FALLBACKS = [
  "Hallucinogenic substance classes, broken down and described",
  "A selection of subjective effects that best represent the SEI",
  "Analyses that go beyond individual subjective effects",
  "Recommended firsthand accounts of hallucinogenic experiences",
  "Artistic representations of specific subjective effects",
] as const;

const EFFECT_INDEX_HOME_PANEL_BLURB_SLOTS = {
  substanceSummaries: 0,
  featuredEffects: 1,
  featuredArticle: 2,
  featuredReports: 3,
  featuredReplications: 4,
} as const

export type EffectIndexHomePanelSlot = keyof typeof EFFECT_INDEX_HOME_PANEL_BLURB_SLOTS;

export function effectIndexHomePanelBlurb(
  slot: EffectIndexHomePanelSlot,
  blurbs?: readonly string[],
): string {
  const index = EFFECT_INDEX_HOME_PANEL_BLURB_SLOTS[slot];
  return blurbs?.[index]?.trim() || EFFECT_INDEX_HOME_PANEL_BLURB_FALLBACKS[index];
}

export interface EffectIndexHomeCopy {
  intro: EffectIndexHomeIntroCopy;
  panelBlurbs: readonly string[];
}
