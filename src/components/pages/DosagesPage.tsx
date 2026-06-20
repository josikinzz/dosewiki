"use client";

import { type ReactNode, useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Icon } from "@/components/common/Icon";
import type { IconName } from "@/components/common/Icon";
import { PublicContentShell } from "@/components/layout/PublicPagePrimitives";
import {
  PublicSegmentedTabs,
  type PublicSegmentedTabItem,
} from "@/components/layout/PublicSegmentedTabs";
import { CategoryGrid } from "@/features/article/components/sections/CategoryGrid";
import { CategoryIntro } from "@/components/pages/CategoryIntro";
import type { DosageCategoryGroup, DrugListEntry } from "../../data/builders/library";
import type { SubstanceLookupEntry } from "../../data/LightweightDataProvider";
import type { CategoryTabContent } from "../../data/categoryTabContent";
import { getCategoryIcon } from "../../data/config/categoryIcons";
import type { CategoryLayout } from "../../hooks/useCategoryLayout";
import { isLowPrioritySubstance } from "@/schema";
import { slugify } from "@/utils/slug";
import { cn } from "@/lib/utils";

const SUBSTANCE_INDEX_ICON = "streamline-ultimate:science-molecule-strucutre-bold" satisfies IconName;

const formatLabel = (count: number, singular: string, plural: string) =>
  `${count} ${count === 1 ? singular : plural}`;

interface DosagesPageProps {
  layout: CategoryLayout;
  substances: SubstanceLookupEntry[];
  /**
   * Per-category intro content (Markdown), keyed by category `key`, projected
   * server-side from the manual index JSON. Umbrella super-category tabs carry
   * their own content inline in `SUPER_CATEGORY_TABS`.
   */
  definitions?: Record<string, CategoryTabContent>;
}

interface SubstanceIndexMobileFilterGridProps {
  ariaLabel: string;
  items: PublicSegmentedTabItem[];
  onValueChange: (value: string) => void;
  value: string;
}

/**
 * Overarching tabs that aggregate several category panels into one view.
 * These sit between "All" and the per-category tabs and render more
 * prominently than the per-category tier.
 */
const SUPER_CATEGORY_TABS: Array<{
  id: string;
  label: string;
  icon: IconName;
  memberKeys: string[];
  /**
   * Intro content for the umbrella tab. These tabs aren't categories in the
   * manual index JSON, so their `definition`/`warning` live here rather than
   * in `psychoactiveIndexManual.json`.
   */
  content: CategoryTabContent;
}> = [
  {
    id: "super:hallucinogens",
    label: "Hallucinogens",
    icon: getCategoryIcon("hallucinogen"),
    memberKeys: ["psychedelic", "dissociative", "deliriant", "hallucinogen"],
    content: {
      definition:
        '**Hallucinogens** are a class of psychoactive substances that produce powerful changes in perception, mood, and thought, often experienced as a qualitatively different state of consciousness rather than simply a stronger or weaker version of normal awareness. They are usually divided into three subclasses — psychedelics, dissociatives, and deliriants — each of which acts on a different brain system and produces a distinct kind of experience. The name comes from the Latin *hallucinari*, meaning "to wander in the mind."',
      warning: "",
    },
  },
  {
    id: "super:depressants",
    label: "Depressants",
    icon: getCategoryIcon("depressant"),
    memberKeys: ["gabaergic", "opioid"],
    content: {
      definition:
        '**Depressants** (also known as "downers") are a class of psychoactive substances that slow down the central nervous system, producing relaxation, calm, reduced anxiety, drowsiness, and lowered inhibition. Most produce their effects by strengthening GABA, the brain\'s main inhibitory or "braking" system, which winds down activity across the nervous system. It is worth noting that "depressant" refers to lowering nervous-system activity, not to causing sadness.',
      warning: "",
    },
  },
];

/**
 * Tab row order. Categories absent from this list (a-typical hallucinogen,
 * miscellaneous) get no tab of their own; the a-typical hallucinogen panel
 * still shows under the Hallucinogens tab. "nootropic" is listed ahead of
 * its category existing so it slots in automatically once added.
 */
const TAB_ORDER: string[] = [
  "super:hallucinogens",
  "psychedelic",
  "dissociative",
  "deliriant",
  "cannabinoid",
  "entactogen",
  "stimulant",
  "nootropic",
  "super:depressants",
  "gabaergic",
  "opioid",
  "antidepressant",
  "antipsychotic",
];

function renderMobileFilterLabel(label: ReactNode) {
  return (
    <span className="theme-substance-index-mobile-tab-label block max-w-full overflow-hidden text-ellipsis whitespace-nowrap text-[0.625rem] leading-3 font-semibold">
      {label}
    </span>
  );
}

function getMobileFilterItemPositionClassName(index: number, itemCount: number) {
  const remainder = itemCount % 4;
  if (remainder === 2 && index === itemCount - remainder) {
    return "col-start-2";
  }
  return undefined;
}

function SubstanceIndexMobileFilterGrid({
  ariaLabel,
  items,
  onValueChange,
  value,
}: SubstanceIndexMobileFilterGridProps) {
  return (
    <div className="-mt-8 sm:hidden">
      <div
        role="group"
        aria-label={ariaLabel}
        className="mx-auto grid w-full max-w-[22rem] grid-cols-4 gap-x-1.5 gap-y-3 px-1"
      >
        {items.map((item, index) => {
          const isActive = item.id === value;

          return (
            <button
              key={item.id}
              type="button"
              aria-pressed={isActive}
              data-state={isActive ? "active" : "inactive"}
              onClick={() => onValueChange(item.id)}
              className={cn(
                "theme-substance-index-mobile-tab group flex min-w-0 flex-col items-center gap-1.5 rounded-2xl px-0 py-1 text-center transition-[color,transform] duration-[220ms] ease-[cubic-bezier(0.25,1,0.5,1)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--theme-accent-strong)] active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100",
                getMobileFilterItemPositionClassName(index, items.length),
              )}
            >
              <span className="theme-substance-index-mobile-tab-icon flex h-[3.25rem] w-[3.25rem] shrink-0 items-center justify-center rounded-[1.1rem] transition-[background,color,box-shadow,transform] duration-[260ms] ease-[cubic-bezier(0.25,1,0.5,1)] group-active:scale-[0.96] motion-reduce:transition-none motion-reduce:group-active:scale-100">
                {item.icon ? <Icon icon={item.icon} size={32} /> : null}
              </span>
              {renderMobileFilterLabel(item.label)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Build DosageCategoryGroup[] from category layout and slug lookup.
 * This avoids loading all 679 articles just to render the home page.
 */
function buildGroupsFromLayout(
  layout: CategoryLayout,
  lookup: Map<string, SubstanceLookupEntry>
): DosageCategoryGroup[] {
  return layout.categories.map((category) => {
    const sections = category.sections.map((section) => {
      const drugs: DrugListEntry[] = section.drugs
        .map((slug) => {
          const entry = lookup.get(slug);
          if (!entry || isLowPrioritySubstance(entry.priority)) return null;
          return { name: entry.name, slug: entry.slug };
        })
        .filter((d): d is DrugListEntry => d !== null);

      return { name: section.label, drugs };
    }).filter((s) => s.drugs.length > 0);

    // Top-level drugs not in sections
    const topLevelDrugs: DrugListEntry[] = category.drugs
      .map((slug) => {
        const entry = lookup.get(slug);
        if (!entry || isLowPrioritySubstance(entry.priority)) return null;
        return { name: entry.name, slug: entry.slug };
      })
      .filter((d): d is DrugListEntry => d !== null);

    // Combine sections and top-level
    const allSections = topLevelDrugs.length > 0 && sections.length > 0
      ? [{ name: "General", drugs: topLevelDrugs }, ...sections]
      : sections;

    const allDrugs = allSections.length > 0
      ? allSections.flatMap((s) => s.drugs)
      : topLevelDrugs;

    return {
      key: category.key,
      name: category.label,
      icon: getCategoryIcon(category.iconKey),
      total: allDrugs.length,
      drugs: allDrugs,
      sections: allSections.length > 0 ? allSections : undefined,
      columns: category.columns,
    } satisfies DosageCategoryGroup;
  }).filter((g) => g.total > 0 || g.key === "miscellaneous");
}

/**
 * Split one category into one panel per subcategory section. Categories
 * without sections fall back to their single panel. Explicit column
 * placements are dropped: they were tuned for the full grid.
 */
function splitGroupBySections(group: DosageCategoryGroup): DosageCategoryGroup[] {
  const sections = (group.sections ?? []).filter((section) => section.drugs.length > 0);
  if (sections.length === 0) {
    return [{ ...group, columns: undefined, column: undefined }];
  }
  const orderedSections = [...sections].sort((a, b) => {
    const aCommon = a.name?.toLowerCase() === "common";
    const bCommon = b.name?.toLowerCase() === "common";
    if (aCommon !== bCommon) return aCommon ? -1 : 1;
    return (a.name ?? "").localeCompare(b.name ?? "");
  });
  return orderedSections.map((section, index) => {
    // Fill columns top-to-bottom so the alphabetical order reads down each
    // column instead of across rows: the first ceil(n/c) panels go in
    // column 0, the next batch in column 1, and so on.
    const columns: Record<string, number> = {};
    for (let count = 1; count <= 6; count++) {
      columns[String(count)] = Math.floor(
        index / Math.ceil(orderedSections.length / count),
      );
    }
    return {
      key: `${group.key}-${slugify(section.name ?? "general")}`,
      name: section.name ?? group.name,
      icon: group.icon,
      total: section.drugs.length,
      drugs: section.drugs,
      columns,
    };
  });
}

export function DosagesPage({ layout, substances, definitions }: DosagesPageProps) {
  const [activeTab, setActiveTab] = useState("all");

  const lookup = useMemo(
    () =>
      new Map<string, SubstanceLookupEntry>(
        substances.map((substance) => [substance.slug, substance]),
      ),
    [substances],
  );
  const substanceCount = substances.filter((substance) => !isLowPrioritySubstance(substance.priority)).length;

  const psychoactiveGroups = useMemo(
    () => buildGroupsFromLayout(layout, lookup),
    [layout, lookup],
  );

  const psychoactiveClassCount = psychoactiveGroups.length;

  const groupsByKey = useMemo(
    () => new Map(psychoactiveGroups.map((group) => [group.key, group])),
    [psychoactiveGroups],
  );

  const superTabs = useMemo(
    () =>
      SUPER_CATEGORY_TABS.filter((tab) =>
        tab.memberKeys.some((key) => groupsByKey.has(key)),
      ),
    [groupsByKey],
  );

  const tabItems = useMemo<PublicSegmentedTabItem[]>(() => {
    const items: PublicSegmentedTabItem[] = [
      { id: "all", label: "All", icon: SUBSTANCE_INDEX_ICON, prominence: "major" },
    ];
    for (const entry of TAB_ORDER) {
      if (entry.startsWith("super:")) {
        const superTab = superTabs.find((tab) => tab.id === entry);
        if (superTab) {
          items.push({
            id: superTab.id,
            label: superTab.label,
            icon: superTab.icon,
            prominence: "major",
          });
        }
        continue;
      }
      const group = groupsByKey.get(entry);
      if (group) {
        items.push({
          id: group.key,
          label: group.name,
          icon: group.icon,
          // When the strip collapses to two rows on wide screens, keep the
          // first row ending on Cannabinoid and start the second on Entactogen.
          ...(entry === "cannabinoid"
            ? { breakAfter: true, breakAfterClassName: "hidden xl:block" }
            : {}),
        });
      }
    }
    return items;
  }, [superTabs, groupsByKey]);

  const resolvedGroups = useMemo(() => {
    if (activeTab === "all") {
      // Order panels to match the tab strip read left-to-right: per-category
      // tabs in TAB_ORDER first (skipping the super-category tabs, which have
      // no panel of their own), then any categories without a tab. Drop the
      // explicit column placement so the grid flows panels in this reading
      // order (left-to-right, top-to-bottom) instead of the tuned layout.
      const seen = new Set<string>();
      const ordered: DosageCategoryGroup[] = [];
      for (const entry of TAB_ORDER) {
        if (entry.startsWith("super:")) continue;
        const group = groupsByKey.get(entry);
        if (group && !seen.has(group.key)) {
          ordered.push(group);
          seen.add(group.key);
        }
      }
      for (const group of psychoactiveGroups) {
        if (!seen.has(group.key)) {
          ordered.push(group);
          seen.add(group.key);
        }
      }
      return ordered.map((group) => ({ ...group, columns: undefined, column: undefined }));
    }
    const superTab = superTabs.find((tab) => tab.id === activeTab);
    if (superTab) {
      return superTab.memberKeys
        .map((key) => groupsByKey.get(key))
        .filter((group): group is DosageCategoryGroup => group !== undefined)
        .map((group) => ({ ...group, columns: undefined, column: undefined }));
    }
    const group = groupsByKey.get(activeTab);
    return group ? splitGroupBySections(group) : psychoactiveGroups;
  }, [activeTab, psychoactiveGroups, superTabs, groupsByKey]);

  const isFiltered = activeTab !== "all";
  const isSingleCategoryView = isFiltered && groupsByKey.has(activeTab);

  const substanceIndexIntro = useMemo<CategoryTabContent>(
    () => ({
      definition: `Browse **${formatLabel(substanceCount, "substance article", "substance articles")}** focused on education and harm reduction, organized across **${formatLabel(psychoactiveClassCount, "psychoactive class", "psychoactive classes")}**. Open any page below to explore detailed information including: *dosage & duration, subjective effects, reagent testing, pharmacology, interactions, harm potential, history & culture, legality, and further reading.*`,
      warning: "",
    }),
    [psychoactiveClassCount, substanceCount],
  );

  // Intro content for the active tab: the "All" tab carries the substance-index
  // intro, umbrella tabs carry their own copy, and per-category tabs read from
  // the server-provided definitions map.
  const activeContent = useMemo<CategoryTabContent | undefined>(() => {
    if (activeTab === "all") return substanceIndexIntro;
    const superTab = SUPER_CATEGORY_TABS.find((tab) => tab.id === activeTab);
    if (superTab) return superTab.content;
    return definitions?.[activeTab];
  }, [activeTab, definitions, substanceIndexIntro]);

  return (
    <PublicContentShell width="wide" focusTarget className="max-w-none 2xl:px-8">
      <div className="mx-auto max-w-3xl md:max-w-4xl">
        <div>
          <PageHeader
            className="sm:mb-8"
            title="Substance Index"
            icon={SUBSTANCE_INDEX_ICON}
            prominentMobileIcon
            showSpotlight={false}
          />
        </div>
      </div>

      <SubstanceIndexMobileFilterGrid
        ariaLabel="Filter substances by class"
        value={activeTab}
        onValueChange={setActiveTab}
        items={tabItems}
      />

      <PublicSegmentedTabs
        ariaLabel="Filter substances by class"
        value={activeTab}
        onValueChange={setActiveTab}
        items={tabItems}
        className="hidden sm:flex"
        listClassName="justify-center"
      />

      <CategoryIntro content={activeContent} activeTab={activeTab} />

      <div
        className={cn(
          "mt-6 sm:mt-10",
          resolvedGroups.length === 1
            ? "mx-auto w-full max-w-xl"
            : resolvedGroups.length === 2
              ? "mx-auto w-full max-w-4xl"
              : undefined,
        )}
      >
        <CategoryGrid
          key={activeTab}
          groups={resolvedGroups}
          drugHrefPrefix="/"
          categoryHrefPrefix={isSingleCategoryView ? undefined : "/category/"}
          maxColumns={isFiltered ? 3 : undefined}
          // Single-class tabs split one category into subsection panels that
          // all share the same category glyph — redundant, so drop the icon.
          // "All" and the super-category tabs (mixed classes) keep theirs.
          hideCardIcons={isSingleCategoryView}
          getCardTone={
            isSingleCategoryView
              ? (group) =>
                  group.name.toLowerCase() === "common" ? "default" : "dim"
              : undefined
          }
        />
      </div>
    </PublicContentShell>
  );
}
