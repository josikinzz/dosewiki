/**
 * Hand-curated map from a psychoactive class to the Effect Index articles that
 * explain it. The archive is nine articles, so this is a curation problem, not a
 * taxonomy problem: every surface that says "read the dissociative scale" reads
 * from here, and adding a deliriant scale one day is one entry.
 *
 * Consumers: the substance page's subjective-effects section (keyed by
 * `classification.psychoactive_class`), effect pages in the disconnective
 * family, the `/effects/category/*` pages, and the SEI Library tab.
 */
import { PSYCHOACTIVE_SUMMARY_DEFINITIONS } from "@/features/psychoactive-summaries/summaryDefinitions";
import { msg, type Translate } from "@/i18n/messages";

export type GuideClass = "psychedelic" | "dissociative" | "deliriant";

export interface ArticleGuideLink {
  slug: string;
  title: string;
  /** One clause, sentence case, no trailing period; rendered beside the title. */
  description: string;
  /**
   * The substance pages this guide belongs to, by article slug. A guide covers
   * one substance end to end, so it is offered on that substance's page and
   * nowhere else: linking the DXM guide from ketamine or PCP says the guide is
   * about dissociatives in general, which it is not. Empty for a scale, which
   * grades a whole class and belongs on every page in it.
   */
  substanceSlugs?: readonly string[];
}

export interface ClassSummaryLink {
  href: string;
  title: string;
}

export interface ClassGuides {
  label: string;
  /** The intensity scale for the class, when one has been written. */
  scale?: ArticleGuideLink;
  /** Long-form single-substance guides in the class. */
  guides: readonly ArticleGuideLink[];
  /**
   * The general effect-description articles for the class: the `/psychoactive/*`
   * summaries. Unlike a guide these describe no single substance, so every
   * substance in the class links them.
   */
  summaries: readonly ClassSummaryLink[];
  /** The SEI category page whose effects the class is defined by, when one exists. */
  categoryHref?: string;
}

/**
 * Read off the summary route definitions rather than restated here, so a
 * retitled or repathed summary page cannot leave a stale label in a caption.
 * Psychedelics own three summaries (visual, cognitive, miscellaneous) and the
 * other two classes own one each; the key prefix is the class.
 */
function summariesForClass(guideClass: GuideClass): readonly ClassSummaryLink[] {
  return PSYCHOACTIVE_SUMMARY_DEFINITIONS.filter(
    (definition) => definition.key === guideClass || definition.key.startsWith(`${guideClass}-`),
  ).map(({ path, title }) => ({ href: path, title }));
}

export const PSYCHEDELIC_INTENSITY_SCALE: ArticleGuideLink = {
  slug: "psychedelic-intensity-scale",
  title: msg("Psychedelic Intensity Scale"),
  description: msg("Seven levels from threshold to ego death"),
};

export const DISSOCIATIVE_INTENSITY_SCALE: ArticleGuideLink = {
  slug: "dissociative-intensity-scale",
  title: msg("Dissociative Intensity Scale"),
  description: msg("Six levels of disconnection, including holes and voids"),
};

export const ARTICLE_GUIDES_BY_CLASS: Record<GuideClass, ClassGuides> = {
  psychedelic: {
    label: msg("Psychedelics"),
    scale: PSYCHEDELIC_INTENSITY_SCALE,
    guides: [
      {
        slug: "dmt",
        title: msg("DMT"),
        description: msg("Stages of the experience and a six-level intensity model"),
        substanceSlugs: ["dmt"],
      },
    ],
    summaries: summariesForClass("psychedelic"),
  },
  dissociative: {
    label: msg("Dissociatives"),
    scale: DISSOCIATIVE_INTENSITY_SCALE,
    guides: [
      {
        slug: "dxm",
        title: msg("DXM"),
        description: msg("Plateaus, dosing tiers, and the dissociative experience end to end"),
        // DoseWiki files the substance under its full name; /substances/dxm is
        // a redirect to the article itself.
        substanceSlugs: ["dextromethorphan"],
      },
    ],
    summaries: summariesForClass("dissociative"),
    categoryHref: "/effects/category/disconnective-effects",
  },
  deliriant: {
    label: msg("Deliriants"),
    guides: [],
    summaries: summariesForClass("deliriant"),
  },
};

export const GUIDE_CLASSES = Object.keys(ARTICLE_GUIDES_BY_CLASS) as GuideClass[];

export function articleHref(slug: string): string {
  return `/articles/${slug}`;
}

/**
 * First guide class named by a substance's `classification.psychoactive_class`
 * list. Matching is by substring on the lowercased value so "Psychedelics",
 * "psychedelic", and "Serotonergic psychedelic" all resolve; the list order
 * decides ties, which is the order the editor wrote the classes in.
 */
export function resolveGuideClass(psychoactiveClasses: readonly string[]): GuideClass | undefined {
  for (const raw of psychoactiveClasses) {
    const value = raw.trim().toLowerCase();
    if (!value) continue;
    const match = GUIDE_CLASSES.find((guideClass) => value.includes(guideClass));
    if (match) return match;
  }
  return undefined;
}

/**
 * The guide a substance page may offer: only the one written about that exact
 * substance. Every other page in the class gets the scale alone, so a guide
 * about one drug is never presented as reading for another.
 */
export function resolveSubstanceGuide(
  guides: ClassGuides,
  substanceSlug: string | undefined,
): ArticleGuideLink | undefined {
  if (!substanceSlug) return undefined;

  return guides.guides.find((guide) => guide.substanceSlugs?.includes(substanceSlug));
}

export interface SummaryCaption {
  /**
   * Set only when the class owns several summaries, which then read as one
   * group rather than as separate titles.
   */
  groupLabel?: string;
  entries: readonly ClassSummaryLink[];
}

/**
 * The class summaries as a caption reads them.
 *
 * One summary keeps its full title ("Subjective Effects of Deliriants").
 * Psychedelics own three, and listing those titles verbatim repeats "Effects of
 * Psychedelics" three times in one faint sentence, so they collapse to a group
 * whose members are named by the part that differs: "Effects of psychedelics
 * (visual, cognitive, miscellaneous)". The short names come off the route path,
 * not from a second set of hand-written labels.
 */
export function buildSummaryCaption(t: Translate, guides: ClassGuides): SummaryCaption {
  if (guides.summaries.length <= 1) {
    return { entries: guides.summaries };
  }

  return {
    groupLabel: t("Effects of {{class}}", { class: t(guides.label).toLowerCase() }),
    entries: guides.summaries.map((summary) => {
      // `.at(-1)` is not in this project's TS lib target.
      const segments = summary.href.split("/").filter(Boolean);

      return { href: summary.href, title: segments[segments.length - 1] ?? summary.title };
    }),
  };
}
