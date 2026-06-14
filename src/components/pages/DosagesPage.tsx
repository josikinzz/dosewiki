"use client";

import { useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import type { IconName } from "@/components/common/Icon";
import { PublicContentShell } from "@/components/layout/PublicPagePrimitives";
import {
  PublicSegmentedTabs,
  type PublicSegmentedTabItem,
} from "@/components/layout/PublicSegmentedTabs";
import { CategoryGrid } from "@/features/article/components/sections/CategoryGrid";
import type { DosageCategoryGroup, DrugListEntry } from "../../data/builders/library";
import type { SubstanceLookupEntry } from "../../data/LightweightDataProvider";
import { getCategoryIcon } from "../../data/config/categoryIcons";
import type { CategoryLayout } from "../../hooks/useCategoryLayout";
import { isLowPrioritySubstance } from "@/schema";
import { slugify } from "@/utils/slug";
import { cn } from "@/lib/utils";

const SUBSTANCE_INDEX_ICON = "streamline-ultimate:science-molecule-strucutre-bold" satisfies IconName;

interface DosagesPageProps {
  layout: CategoryLayout;
  substances: SubstanceLookupEntry[];
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
}> = [
  {
    id: "super:hallucinogens",
    label: "Hallucinogens",
    icon: getCategoryIcon("hallucinogen"),
    memberKeys: ["psychedelic", "dissociative", "deliriant", "hallucinogen"],
  },
  {
    id: "super:depressants",
    label: "Depressants",
    icon: getCategoryIcon("depressant"),
    memberKeys: ["gabaergic", "opioid"],
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

export function DosagesPage({ layout, substances }: DosagesPageProps) {
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

  const formatLabel = (count: number, singular: string, plural: string) =>
    `${count} ${count === 1 ? singular : plural}`;

  return (
    <PublicContentShell width="wide" focusTarget className="max-w-none 2xl:px-8">
      <div className="mx-auto max-w-3xl md:max-w-4xl">
        <div>
          <PageHeader
            title="Substance Index"
            icon={SUBSTANCE_INDEX_ICON}
            showSpotlight={false}
            descriptionClassName="type-lead theme-accent-emphasis-scope theme-text-secondary mx-auto max-w-[90ch] text-balance"
            description={
              <>
                Browse {" "}
                <strong>{formatLabel(substanceCount, "substance article", "substance articles")}</strong>
                {" "} focused on education and harm reduction, organized across {" "}
                <strong>{formatLabel(psychoactiveClassCount, "psychoactive class", "psychoactive classes")}</strong>
                .
                <br />
                Open any page below to explore detailed information including: {" "}
                <em>dosage &amp; duration, subjective effects, reagent testing, pharmacology, interactions, harm potential, history &amp; culture, legality, and further reading.</em>
              </>
            }
          />
        </div>
      </div>

      <PublicSegmentedTabs
        ariaLabel="Filter substances by class"
        value={activeTab}
        onValueChange={setActiveTab}
        items={tabItems}
        listClassName="justify-center"
      />

      <div
        className={cn(
          "mt-10",
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
