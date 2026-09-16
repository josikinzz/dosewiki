"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useT } from "@/i18n/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { BetaDisclaimer } from "@/components/common/BetaDisclaimer";
import { PublicContentShell } from "@/components/layout/PublicPagePrimitives";
import {
  PublicSegmentedTabs,
  type PublicSegmentedTabItem,
} from "@/components/layout/PublicSegmentedTabs";
import { CategoryGrid } from "@/features/article/components/sections/CategoryGrid";
import IndexItem from "@/features/dev/tools/index-layout/IndexItem.editor";
import IndexCategory from "@/features/dev/tools/index-layout/IndexCategory.editor";
import { CategoryIntro } from "@/components/pages/CategoryIntro";
import type { DosageCategoryGroup, DrugListEntry } from "../../data/builders/library";
import type { SubstanceLookupEntry } from "../../data/LightweightDataProvider";
import type { CategoryTabContent } from "../../data/categoryTabContent";
import { getCategoryIcon } from "../../data/config/categoryIcons";
import type { CategoryLayout } from "../../hooks/useCategoryLayout";
import { orderIndexSections, sectionConventionRank } from "../../data/builders/indexSectionOrder";
import { useLegacyIndexHashRoute } from "@/hooks/useLegacyIndexHashRoute";
// Deep-import the pure visibility helper instead of the `@/schema` barrel: the
// barrel `export *`s the Zod-heavy substance schema, which would otherwise drag
// the entire Zod graph (~109 KB gz) into this client component's bundle. The
// helper itself has no runtime dependencies.
import { isDirectUrlOnlySubstance } from "@/schema/substance/substanceVisibilityPolicy";
import { slugify } from "@/utils/slug";
import { replaceCurrentIndexViewPath, scrollIntoViewRespectingMotion } from "@/utils/navigation";
import {
  SUBSTANCE_INDEX_DEFAULT_VIEW,
  SUBSTANCE_INDEX_LEGACY_COVER_ID,
  parseLegacySubstanceIndexHash,
  substanceIndexViewPath,
  type SubstanceIndexView,
} from "@/utils/indexViewRoutes";
import { SUBSTANCE_INDEX_ALL_COLUMN_LAYOUT } from "./substanceIndexAllLayout";
import {
  SUBSTANCE_INDEX_ICON,
  SUBSTANCE_INDEX_SUPER_TABS,
  buildSubstanceIndexTabItems,
  orderCategoriesForAllTab,
  resolveSubstanceIndexSuperTabs,
} from "./substanceIndexTabs";

interface DosagesPageProps {
  layout: CategoryLayout;
  substances: SubstanceLookupEntry[];
  /**
   * Per-category intro content (Markdown), keyed by category `key`, projected
   * server-side from the manual index JSON. Umbrella super-category tabs carry
   * their own content inline in `SUBSTANCE_INDEX_SUPER_TABS`.
   */
  definitions?: Record<string, CategoryTabContent>;
  /** Server-resolved URL state; must match the first rendered panel set. */
  initialView?: SubstanceIndexView;
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
          if (!entry || isDirectUrlOnlySubstance(entry.priority)) return null;
          return { name: entry.name, slug: entry.slug };
        })
        .filter((d): d is DrugListEntry => d !== null);

      return { name: section.label, drugs };
    }).filter((s) => s.drugs.length > 0);

    // Top-level drugs not in sections
    const topLevelDrugs: DrugListEntry[] = category.drugs
      .map((slug) => {
        const entry = lookup.get(slug);
        if (!entry || isDirectUrlOnlySubstance(entry.priority)) return null;
        return { name: entry.name, slug: entry.slug };
      })
      .filter((d): d is DrugListEntry => d !== null);

    // Combine sections and top-level, then enforce the canonical order
    // (Common/General first, "Other …" last) regardless of authored order.
    const allSections = orderIndexSections(
      topLevelDrugs.length > 0 && sections.length > 0
        ? [{ name: "General", drugs: topLevelDrugs }, ...sections]
        : sections,
    );

    const allDrugs = allSections.length > 0
      ? allSections.flatMap((s) => s.drugs)
      : topLevelDrugs;
    const uniqueDrugCount = new Set(allDrugs.map((drug) => drug.slug)).size;

    return {
      key: category.key,
      name: category.label,
      icon: getCategoryIcon(category.iconKey),
      total: uniqueDrugCount,
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
    const rankDelta = sectionConventionRank(a.name) - sectionConventionRank(b.name);
    if (rankDelta !== 0) return rankDelta;
    return (a.name ?? "").localeCompare(b.name ?? "");
  });
  return orderedSections.map((section, index) => {
    // Spread panels across min(count, n) columns as evenly as possible,
    // filling each column top-to-bottom so the ordered list still reads down
    // each column. Balanced sizing stops a small panel count from starving the
    // trailing columns: 4 panels across 3 columns become 2+1+1 (three columns)
    // instead of the old 2+2+0 (which collapsed the grid to two columns).
    const n = orderedSections.length;
    const columns: Record<string, number> = {};
    for (let count = 1; count <= 6; count++) {
      const cols = Math.min(count, n);
      const base = Math.floor(n / cols);
      const remainder = n % cols;
      let cursor = 0;
      let target = cols - 1;
      for (let c = 0; c < cols; c++) {
        const size = base + (c < remainder ? 1 : 0);
        if (index < cursor + size) {
          target = c;
          break;
        }
        cursor += size;
      }
      columns[String(count)] = target;
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

export function DosagesPage({
  layout,
  substances,
  definitions,
  initialView = SUBSTANCE_INDEX_DEFAULT_VIEW,
}: DosagesPageProps) {
  const [activeTab, setActiveTab] = useState<SubstanceIndexView>(initialView);
  const panelsStartRef = useRef<HTMLDivElement | null>(null);
  const t = useT();
  const resolveLegacyHash = useCallback((hash: string) => {
    const view = parseLegacySubstanceIndexHash(hash);
    return view ? { view, pathname: substanceIndexViewPath(view) } : null;
  }, []);
  useLegacyIndexHashRoute<SubstanceIndexView>({
    value: activeTab,
    setValue: setActiveTab,
    resolve: resolveLegacyHash,
    coverId: SUBSTANCE_INDEX_LEGACY_COVER_ID,
  });

  const lookup = useMemo(
    () =>
      new Map<string, SubstanceLookupEntry>(
        substances.map((substance) => [substance.slug, substance]),
      ),
    [substances],
  );

  const psychoactiveGroups = useMemo(
    () => buildGroupsFromLayout(layout, lookup),
    [layout, lookup],
  );

  const groupsByKey = useMemo(
    () => new Map(psychoactiveGroups.map((group) => [group.key, group])),
    [psychoactiveGroups],
  );

  const superTabs = useMemo(
    () => resolveSubstanceIndexSuperTabs((key) => groupsByKey.has(key)),
    [groupsByKey],
  );

  const tabItems = useMemo<PublicSegmentedTabItem[]>(
    () =>
      buildSubstanceIndexTabItems(psychoactiveGroups).map((item) => ({
        ...item,
        label: typeof item.label === "string" ? t(item.label) : item.label,
      })),
    [psychoactiveGroups, t],
  );

  const handleTabChange = (value: string) => {
    const nextView = value as SubstanceIndexView;
    setActiveTab(nextView);
    replaceCurrentIndexViewPath(substanceIndexViewPath(nextView));
  };

  // Only scroll down to the panels when the user re-clicks the tab they are
  // already on. `wasActive` comes from the tab strip (captured at pointer-down
  // on desktop) so switching tabs never scrolls — comparing against `activeTab`
  // here would be wrong on desktop, where Radix updates it before this fires.
  const handleTabSelect = (
    item: PublicSegmentedTabItem,
    { wasActive }: { wasActive: boolean },
  ) => {
    if (!wasActive || !panelsStartRef.current) {
      return;
    }

    scrollIntoViewRespectingMotion(panelsStartRef.current);
  };

  const resolvedGroups = useMemo(() => {
    if (activeTab === "all") {
      return orderCategoriesForAllTab(psychoactiveGroups).map((group) => ({
        ...group,
        columns: undefined,
        column: undefined,
      }));
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

  // Intro content for the active tab: the "All" tab deliberately carries no
  // intro — the grid speaks for itself — while umbrella tabs carry their own
  // copy and per-category tabs read from the server-provided definitions map.
  const activeContent = useMemo<CategoryTabContent | undefined>(() => {
    if (activeTab === "all") return undefined;
    // The umbrella tabs are not categories in the manual index, so the server
    // contributes their prose under their tab id when the copy layer knows it.
    // The inline `tab.content` stays as the fallback.
    const superTab = SUBSTANCE_INDEX_SUPER_TABS.find((tab) => tab.id === activeTab);
    if (superTab) {
      const content = definitions?.[superTab.id] ?? superTab.content;
      return content
        ? { ...content, definition: t(content.definition), warning: content.warning ? t(content.warning) : content.warning }
        : undefined;
    }
    const content = definitions?.[activeTab];
    return content
      ? { ...content, definition: t(content.definition), warning: content.warning ? t(content.warning) : content.warning }
      : undefined;
  }, [activeTab, definitions, t]);

  return (
    <PublicContentShell width="wide" focusTarget className="max-w-none 2xl:px-8">
      <IndexItem />
      <IndexCategory groups={psychoactiveGroups} />
      <div className="mx-auto max-w-3xl md:max-w-4xl">
        <div>
          <PageHeader
            className="sm:mb-8"
            title={t("Substance Index")}
            icon={SUBSTANCE_INDEX_ICON}
            description={<BetaDisclaimer />}
            descriptionClassName="mx-auto text-sm italic text-balance"
          />
        </div>
      </div>

      <div data-nosnippet>
        <PublicSegmentedTabs
          ariaLabel={t("Filter substances by class")}
          value={activeTab}
          onValueChange={handleTabChange}
          onItemSelect={handleTabSelect}
          items={tabItems}
          mobileVariant="appGrid"
          mobileClassName="-mt-8"
          listClassName="justify-center"
        />
      </div>

      <CategoryIntro content={activeContent} activeTab={activeTab} />

      <div key={activeTab} ref={panelsStartRef} className="theme-tab-panel-enter mt-6 scroll-mt-24 sm:mt-10">
        <CategoryGrid
          groups={resolvedGroups}
          columnLayout={activeTab === "all" ? SUBSTANCE_INDEX_ALL_COLUMN_LAYOUT : undefined}
          drugHrefPrefix="/"
          categoryHrefPrefix={isSingleCategoryView ? undefined : "/category/"}
          // Single-class tabs split one category into subsection panels that
          // all share the same category glyph — redundant, so drop the icon.
          // "All" and the super-category tabs (mixed classes) keep theirs.
          hideCardIcons={isSingleCategoryView}
        />
      </div>
    </PublicContentShell>
  );
}
