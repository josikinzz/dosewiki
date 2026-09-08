import type { IconName } from "@/components/common/Icon";
import {
  ARTICLE_GUIDES_BY_CLASS,
  DISSOCIATIVE_INTENSITY_SCALE,
  GUIDE_CLASSES,
  PSYCHEDELIC_INTENSITY_SCALE,
  articleHref,
  type ArticleGuideLink,
} from "@/features/articles/domain/articleGuides";

/**
 * The Library tab of the Subjective Effect Index: the long-form articles the
 * effect entries lean on, arranged by what a reader is looking for rather than
 * by publication date. The archive is nine articles, so this is hand curation
 * over `articleGuides` plus the handful of pieces that belong to no class.
 * Nothing here needs runtime data; every href is a public App Path.
 */

export interface LibraryItem {
  href: string;
  title: string;
  /** One clause, sentence case, no trailing period; wraps under the title. */
  description?: string;
}

export interface LibraryLink {
  href: string;
  label: string;
}

/**
 * A run of rows under one optional sub-label. Class-owned panels label each
 * run with the class once instead of stamping it on every row.
 */
export interface LibraryGroup {
  label?: string;
  /** One clause about the group as a whole, shown under its label. */
  note?: string;
  items: LibraryItem[];
}

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
  psychedelic: "The visual, cognitive, and transpersonal effects the class shares",
  dissociative: "The disconnective effects that define the class, from holes to voids",
  deliriant: "Delirium and true hallucination; no intensity scale has been written yet",
} as const;

export const LIBRARY_PANELS: LibraryPanel[] = [
  {
    id: "intensity-scales",
    title: "Intensity scales",
    icon: "lucide:gauge",
    blurb:
      "The levelling systems the effect entries and substance pages refer to when they say a dose is light, common, or heavy.",
    groups: [
      {
        items: [
          guideItem(PSYCHEDELIC_INTENSITY_SCALE),
          guideItem(DISSOCIATIVE_INTENSITY_SCALE),
          {
            href: articleHref("approximate-frequency-of-occurrence-scale"),
            title: "Approximate Frequency of Occurrence Scale",
            description: "How likely a listed effect is to occur, from rare to universal",
          },
          {
            href: articleHref("duration-terminology-explanation"),
            title: "Duration Terminology Explanation",
            description: "Onset, come up, peak, offset, and after effects, defined",
          },
        ],
      },
    ],
    footerLinks: [
      { href: ARTICLE_GUIDES_BY_CLASS.psychedelic.summaries[0].href, label: "Psychedelic effects" },
      { href: ARTICLE_GUIDES_BY_CLASS.dissociative.summaries[0].href, label: "Dissociative effects" },
      ...(ARTICLE_GUIDES_BY_CLASS.dissociative.categoryHref
        ? [{ href: ARTICLE_GUIDES_BY_CLASS.dissociative.categoryHref, label: "Disconnective effects" }]
        : []),
    ],
  },
  {
    id: "dreaming-and-consciousness",
    title: "Dreaming and consciousness",
    icon: "lucide:moon",
    blurb:
      "States that arise without a substance, documented with the same vocabulary the index uses for drug-induced effects.",
    groups: [
      {
        items: [
          {
            href: articleHref("dreams"),
            title: "Dreams",
            description: "The effects of the dream state broken into their subcomponents",
          },
          {
            href: articleHref("lucid-dreaming"),
            title: "Lucid dreaming",
            description: "Techniques for becoming aware inside a dream and steering it",
          },
          {
            href: articleHref("meditation"),
            title: "Meditation",
            description: "Practices that train the mind and the states they induce",
          },
        ],
      },
    ],
    // The two published SEI effects about dreaming, so a reader who came for
    // the dream article can find the entries that cite it.
    footerLinks: [
      { href: "/effects/dream-potentiation", label: "Dream potentiation" },
      { href: "/effects/dream-suppression", label: "Dream suppression" },
    ],
  },
  {
    id: "drug-guides",
    title: "Drug guides",
    icon: "lucide:book-open-text",
    blurb:
      "Single-substance guides that walk the experience end to end, with their own dosing tiers and intensity models.",
    // One group per class so the class is said once as a sub-label rather
    // than trailing every row. A class with no guide written yet has no group.
    groups: GUIDE_CLASSES.flatMap((guideClass) => {
      const { guides, label } = ARTICLE_GUIDES_BY_CLASS[guideClass];
      return guides.length > 0 ? [{ label, items: guides.map(guideItem) }] : [];
    }),
  },
  {
    id: "drug-classes",
    title: "Drug classes",
    icon: "lucide:layers",
    blurb:
      "The general effect descriptions for each psychoactive class: what its substances have in common, with no single substance in view.",
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
