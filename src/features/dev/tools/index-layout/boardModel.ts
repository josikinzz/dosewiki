/**
 * The board is the public Substance Index with editing handles, so its view
 * model is built by the same rules the page uses: a category's top-level
 * substances become a leading "General" section when named sections also
 * exist, sections render in convention order (Common first, Other last), and
 * substances the page would drop are kept here with the reason attached.
 */
import type { IconName } from "@/components/common/Icon";
import type { SubstanceRecord } from "@/data/builders/contentBuilder";
import { orderIndexSections, sectionConventionRank } from "@/data/builders/indexSectionOrder";
import { getCategoryIcon } from "@/data/config/categoryIcons";
import { slugify } from "@/utils/slug";
import type { LayoutSlot } from "./layoutOps";
import type { ManualIndexConfig, SlugIssue } from "./types";

export type BoardItem = {
  slug: string;
  name: string;
  issues: SlugIssue[];
  /** The public page drops missing and direct-URL-only substances. */
  hiddenOnSite: boolean;
};

/**
 * The tray of substances the layout does not place. It is not a slot in the
 * manual, so drag gestures read it as "leaving the index" and "entering the
 * index" rather than as a move between two lists.
 */
export const UNPLACED_SLOT: LayoutSlot = { categoryKey: "__unplaced", sectionKey: null };

export type BoardSection = {
  slot: LayoutSlot;
  id: string;
  /** Section heading; undefined for a category that lists substances without sections. */
  label?: string;
  /** Set for the top-level list shown beside named sections; it cannot be renamed or removed. */
  isGeneral: boolean;
  /** Convention rank: 0 leads, 2 closes, 1 keeps authored order. */
  rank: number;
  items: BoardItem[];
  /** The page hides a section with nothing visible in it. */
  hiddenOnSite: boolean;
};

export type BoardCategory = {
  key: string;
  label: string;
  iconKey: string;
  icon: IconName;
  sections: BoardSection[];
  /** Distinct visible substances, matching the public count badge. */
  total: number;
  /** The page drops a category with nothing visible in it. */
  hiddenOnSite: boolean;
};

export type BoardRecord = Pick<SubstanceRecord, "name" | "isHidden" | "isDirectUrlOnly">;

/**
 * A slug listed under Common and again under its class, or in two categories,
 * is how this index reads, so repeats are never flagged; only substances the
 * page cannot show are.
 */
function describeItem(slug: string, library: ReadonlyMap<string, BoardRecord>): BoardItem {
  const normalized = slugify(slug);
  const record = normalized ? library.get(normalized) : undefined;
  if (!record) {
    return { slug, name: slug, issues: ["missing"], hiddenOnSite: true };
  }
  const hidden = record.isHidden || record.isDirectUrlOnly;
  return { slug, name: record.name, issues: hidden ? ["hidden"] : [], hiddenOnSite: record.isDirectUrlOnly };
}

export function buildBoard(
  manual: ManualIndexConfig,
  library: ReadonlyMap<string, BoardRecord>,
): BoardCategory[] {
  return manual.categories.map((category) => {
    const describe = (slug: string) => describeItem(slug, library);
    const topLevel = category.drugs.map(describe);
    const named = category.sections.map((section) => {
      const items = section.drugs.map(describe);
      return {
        slot: { categoryKey: category.key, sectionKey: section.key },
        id: `${category.key}::${section.key}`,
        label: section.label,
        isGeneral: false,
        rank: sectionConventionRank(section.label),
        items,
        hiddenOnSite: !items.some((item) => !item.hiddenOnSite),
      } satisfies BoardSection;
    });

    const topSlot: LayoutSlot = { categoryKey: category.key, sectionKey: null };
    const sections: BoardSection[] =
      named.length === 0
        ? [
            {
              slot: topSlot,
              id: `${category.key}::`,
              isGeneral: false,
              rank: 1,
              items: topLevel,
              hiddenOnSite: false,
            },
          ]
        : orderIndexSections(
            [
              ...(topLevel.length > 0
                ? [
                    {
                      slot: topSlot,
                      id: `${category.key}::`,
                      label: "General",
                      isGeneral: true,
                      rank: 0,
                      items: topLevel,
                      hiddenOnSite: false,
                    } satisfies BoardSection,
                  ]
                : []),
              ...named,
            ].map((section) => ({ ...section, name: section.label })),
          );

    const visible = new Set<string>();
    for (const section of sections) {
      for (const item of section.items) {
        if (!item.hiddenOnSite) visible.add(slugify(item.slug));
      }
    }

    return {
      key: category.key,
      label: category.label,
      iconKey: category.iconKey,
      icon: getCategoryIcon(category.iconKey),
      sections,
      total: visible.size,
      hiddenOnSite: visible.size === 0 && category.key !== "miscellaneous",
    };
  });
}

/** Every slot a substance can be moved to, labelled for a menu. */
export type BoardDestination = { slot: LayoutSlot; categoryLabel: string; sectionLabel: string | null };

export function listDestinations(board: readonly BoardCategory[]): BoardDestination[] {
  const destinations: BoardDestination[] = [];
  for (const category of board) {
    const named = category.sections.filter((section) => section.slot.sectionKey !== null);
    destinations.push({
      slot: { categoryKey: category.key, sectionKey: null },
      categoryLabel: category.label,
      sectionLabel: named.length > 0 ? "General" : null,
    });
    for (const section of named) {
      destinations.push({ slot: section.slot, categoryLabel: category.label, sectionLabel: section.label ?? null });
    }
  }
  return destinations;
}
