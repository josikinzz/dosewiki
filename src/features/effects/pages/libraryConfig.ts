import type { IconName } from "@/components/common/Icon";
import {
  ARTICLE_GUIDES_BY_CLASS,
  DISSOCIATIVE_INTENSITY_SCALE,
  GUIDE_CLASSES,
  PSYCHEDELIC_INTENSITY_SCALE,
  articleHref,
  type ArticleGuideLink,
} from "@/features/articles/domain/articleGuides";
import { msg } from "@/i18n/messages";

/**
 * The Library tab of the Subjective Effect Index: the long-form articles the
 * effect entries lean on, arranged by what a reader is looking for rather than
 * by publication date. The archive is nine articles, so this is hand curation
 * over `articleGuides` plus the handful of pieces that belong to no class.
 * Nothing here needs runtime data; every href is a public App Path. Every
 * reader-visible literal is a `msg()` key that `LibraryPanelSection` renders
 * through `t()`, so the mirror sees it in its own language.
 */

interface LibraryItem { href: string;
title: string;
/** One clause, sentence case, no trailing period; wraps under the title. */
description?: string; }

interface LibraryLink { href: string;
label: string; }

/**
 * A run of rows under one optional sub-label. Class-owned panels label each
 * run with the class once instead of stamping it on every row.
 */
interface LibraryGroup { label?: string;
/** One clause about the group as a whole, shown under its label. */
note?: string;
items: LibraryItem[]; }

export interface LibraryPanel {
  id: string;
  title: string;
  icon: IconName;
  blurb: string;
  groups: LibraryGroup[];
  /** Related pages that are not themselves library articles. */
  footerLinks?: LibraryLink[];
}

function guideItem(guide: ArticleGuideLink): LibraryItem {
  return {
    href: articleHref(guide.slug),
    title: guide.title,
    description: guide.description,
  };
}

/** What each `/psychoactive/*` summary page covers, for the Drug classes panel. */
const CLASS_PAGE_DESCRIPTIONS = {
  psychedelic: msg("The visual, cognitive, and transpersonal effects the class shares"),
  dissociative: msg("The disconnective effects that define the class, from holes to voids"),
  deliriant: msg("Delirium and true hallucination; no intensity scale has been written yet"),
} as const;

export const LIBRARY_PANELS: LibraryPanel[] = [
  {
    id: "intensity-scales",
    title: msg("Intensity scales"),
    icon: "lucide:gauge",
    blurb: msg(
      "The levelling systems the effect entries and substance pages refer to when they say a dose is light, common, or heavy.",
    ),
    groups: [
      {
        items: [
          guideItem(PSYCHEDELIC_INTENSITY_SCALE),
          guideItem(DISSOCIATIVE_INTENSITY_SCALE),
          {
            href: articleHref("approximate-frequency-of-occurrence-scale"),
            title: msg("Approximate Frequency of Occurrence Scale"),
            description: msg("How likely a listed effect is to occur, from rare to universal"),
          },
          {
            href: articleHref("duration-terminology-explanation"),
            title: msg("Duration Terminology Explanation"),
            description: msg("Onset, come up, peak, offset, and after effects, defined"),
          },
        ],
      },
    ],
    footerLinks: [
      { href: ARTICLE_GUIDES_BY_CLASS.psychedelic.summaries[0].href, label: msg("Psychedelic effects") },
      { href: ARTICLE_GUIDES_BY_CLASS.dissociative.summaries[0].href, label: msg("Dissociative effects") },
      ...(ARTICLE_GUIDES_BY_CLASS.dissociative.categoryHref
        ? [{ href: ARTICLE_GUIDES_BY_CLASS.dissociative.categoryHref, label: msg("Disconnective effects") }]
        : []),
    ],
  },
  {
    id: "dreaming-and-consciousness",
    title: msg("Dreaming and consciousness"),
    icon: "lucide:moon",
    blurb: msg(
      "States that arise without a substance, documented with the same vocabulary the index uses for drug-induced effects.",
    ),
    groups: [
      {
        items: [
          {
            href: articleHref("dreams"),
            title: msg("Dreams"),
            description: msg("The effects of the dream state broken into their subcomponents"),
          },
          {
            href: articleHref("lucid-dreaming"),
            title: msg("Lucid dreaming"),
            description: msg("Techniques for becoming aware inside a dream and steering it"),
          },
          {
            href: articleHref("meditation"),
            title: msg("Meditation"),
            description: msg("Practices that train the mind and the states they induce"),
          },
        ],
      },
    ],
    // The two published SEI effects about dreaming, so a reader who came for
    // the dream article can find the entries that cite it.
    footerLinks: [
      { href: "/effects/dream-potentiation", label: msg("Dream potentiation") },
      { href: "/effects/dream-suppression", label: msg("Dream suppression") },
    ],
  },
  {
    id: "drug-guides",
    title: msg("Drug guides"),
    icon: "lucide:book-open-text",
    blurb: msg(
      "Single-substance guides that walk the experience end to end, with their own dosing tiers and intensity models.",
    ),
    // One group per class so the class is said once as a sub-label rather
    // than trailing every row. A class with no guide written yet has no group.
    groups: GUIDE_CLASSES.flatMap((guideClass) => {
      const { guides, label } = ARTICLE_GUIDES_BY_CLASS[guideClass];
      return guides.length > 0 ? [{ label, items: guides.map(guideItem) }] : [];
    }),
  },
  {
    id: "drug-classes",
    title: msg("Drug classes"),
    icon: "lucide:layers",
    blurb: msg(
      "The general effect descriptions for each psychoactive class: what its substances have in common, with no single substance in view.",
    ),
    // One row per summary page rather than one per class: psychedelics own
    // three (visual, cognitive, miscellaneous), and collapsing them behind a
    // single "Psychedelics" row hid two published articles. The class note
    // belongs to the class, so it rides the group, not a row.
    groups: GUIDE_CLASSES.map((guideClass) => {
      const { label, summaries } = ARTICLE_GUIDES_BY_CLASS[guideClass];
      return {
        label,
        note: CLASS_PAGE_DESCRIPTIONS[guideClass],
        items: summaries.map((summary) => ({ href: summary.href, title: summary.title })),
      };
    }),
  },
];
