/**
 * Editable prose for the Effect Index homepage.
 *
 * Kept apart from the components for the same reason `seiIntroCopy.ts` is: the
 * homepage route is a server component that resolves these strings from the
 * copy layer, and `HomeIntro` pulls in `useState`. Importing the component from
 * the server just to reach its fallbacks would drag a client-only module across
 * the boundary.
 *
 * Every string here is the exact wording the components shipped with, so a
 * deployment whose `copyBlocks` table is un-seeded renders the page unchanged.
 * The Effect Index rows are keyed `effect-index-home-*` — whole-key flavor rows
 * rather than `-effect-index` suffixes, because these slots exist on no other
 * flavor and so have no dose.wiki wording to sit beside.
 */

export interface EffectIndexHomeIntroCopy {
  /** Lead paragraph. Carries `{{effectCount}}` and one `**bolded**` phrase. */
  lead: string;
  /** Second paragraph, revealed on "read more". */
  method: string;
  /** Third paragraph, revealed on "read more". */
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

/**
 * The one-line blurb under each panel title.
 *
 * The copy block is a `list`, so the studio presents the five blurbs as one
 * ordered editor rather than five near-identical blocks — and the order below
 * is the contract between that list and the panels. `blurbAt` reads by index
 * and falls back per slot, so a shortened (or reordered-short) list degrades to
 * the shipped wording for the missing slots instead of blanking a panel.
 */
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

/** Everything the homepage reads from the copy layer, in one prop. */
export interface EffectIndexHomeCopy {
  intro: EffectIndexHomeIntroCopy;
  panelBlurbs: readonly string[];
}
