import { PSYCHOACTIVE_SUMMARY_DEFINITIONS } from "@/features/psychoactive-summaries/summaryDefinitions";
import { msg, type Translate } from "@/i18n/messages";

export type GuideClass = "psychedelic" | "dissociative" | "deliriant";

export interface ArticleGuideLink {
  slug: string;
  title: string;
  description: string;
  substanceSlugs?: readonly string[];
}

export interface ClassSummaryLink {
  href: string;
  title: string;
}

export interface ClassGuides {
  label: string;
  scale?: ArticleGuideLink;
  guides: readonly ArticleGuideLink[];
  summaries: readonly ClassSummaryLink[];
  categoryHref?: string;
}

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

export function resolveGuideClass(psychoactiveClasses: readonly string[]): GuideClass | undefined {
  for (const raw of psychoactiveClasses) {
    const value = raw.trim().toLowerCase();
    if (!value) continue;
    const match = GUIDE_CLASSES.find((guideClass) => value.includes(guideClass));
    if (match) return match;
  }
  return undefined;
}

export function resolveSubstanceGuide(
  guides: ClassGuides,
  substanceSlug: string | undefined,
): ArticleGuideLink | undefined {
  if (!substanceSlug) return undefined;

  return guides.guides.find((guide) => guide.substanceSlugs?.includes(substanceSlug));
}

export interface SummaryCaption {
  groupLabel?: string;
  entries: readonly ClassSummaryLink[];
}

export function buildSummaryCaption(t: Translate, guides: ClassGuides): SummaryCaption {
  if (guides.summaries.length <= 1) {
    return { entries: guides.summaries };
  }

  return {
    groupLabel: t("Effects of {{class}}", { class: t(guides.label).toLowerCase() }),
    entries: guides.summaries.map((summary) => {
      const segments = summary.href.split("/").filter(Boolean);

      return { href: summary.href, title: segments[segments.length - 1] ?? summary.title };
    }),
  };
}
