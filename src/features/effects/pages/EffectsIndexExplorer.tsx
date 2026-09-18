"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { IndexPanelGrid, INDEX_PANEL_STACK_CLASS_NAME } from "@/components/common/IndexPanelLayout";
import { StateCard } from "@/components/common/StateCard";
import { PublicSegmentedTabs } from "@/components/layout/PublicSegmentedTabs";
import { useResponsiveColumnCount } from "@/hooks/useResponsiveColumnCount";
import { useLegacyIndexHashRoute } from "@/hooks/useLegacyIndexHashRoute";
import { useT } from "@/i18n/client";
import type { PublicRouteEmptyState } from "@server/next/publicRouteOutcomes";
import { EffectCategoryCard } from "../components/EffectCategoryCard";
import {
  ParentCategoryCard,
  type PreparedParentSubcategory,
} from "../components/ParentCategoryCard";
import { SEIIntroSection } from "../components/SEIIntroSection";
import type { SEIIntroCopy } from "../components/seiIntroCopy";
import {
  FLAT_CATEGORIES,
  PARENT_CATEGORIES,
  TABS,
  type ParentCategoryConfig,
  type TabId,
} from "./effectsIndexConfig";
import { EffectsLibraryPanels } from "./EffectsLibraryPanels";
import {
  EFFECT_INDEX_DEFAULT_VIEW,
  EFFECT_INDEX_LEGACY_COVER_ID,
  effectIndexViewPath,
  parseLegacyEffectIndexHash,
  type EffectIndexView,
} from "@/utils/indexViewRoutes";
import { replaceCurrentIndexViewPath } from "@/utils/navigation";
import { publicHref } from "@/utils/publicHref";
import {
  getNormalizedEffectTags,
  resolveSubcategorySlug,
} from "./effectCategoryGroups";
import { useEffectCategoryExport } from "./useEffectCategoryExport";

interface EffectSummary {
  slug: string;
  name: string;
  tags: string[];
}

interface EffectsIndexExplorerProps {
  effects: EffectSummary[];
  effectHrefPrefix?: string;
  emptyState?: PublicRouteEmptyState;
  /** Editable intro prose, resolved on the server. */
  introCopy?: SEIIntroCopy;
  /** Editable per-tab intro blobs, keyed by tab id; falls back to TABS config. */
  tabBlobs?: Partial<Record<TabId, string>>;
  /** Server-resolved URL state; must match the first rendered panel set. */
  initialView?: EffectIndexView;
}

type EffectWithLowerTags = EffectSummary & {
  lowerTags: Set<string>;
};

type ParentCategoryModel = Omit<ParentCategoryConfig, "subcategories"> & {
  subcategories: PreparedParentSubcategory[];
  totalEffects: number;
};

type FlatCategoryModel = (typeof FLAT_CATEGORIES)[number] & {
  effects: EffectSummary[];
};

function matchesTags(effect: EffectWithLowerTags, lowerTags: string[]) {
  return lowerTags.every((tag) => effect.lowerTags.has(tag));
}

export function EffectsIndexExplorer({
  effects,
  effectHrefPrefix,
  emptyState,
  introCopy,
  tabBlobs,
  initialView = EFFECT_INDEX_DEFAULT_VIEW,
}: EffectsIndexExplorerProps) {
  const router = useRouter();
  const t = useT();
  const [activeTab, setActiveTab] = useState<TabId>(initialView);

  const resolveLegacyHash = useCallback((hash: string) => {
    if (hash.replace(/^#/, "").trim().toLowerCase() === "gallery") {
      return { redirect: "/replications" } as const;
    }
    const view = parseLegacyEffectIndexHash(hash);
    return view ? { view, pathname: effectIndexViewPath(view) } : null;
  }, []);
  const redirectLegacyHash = useCallback(
    (pathname: string) => router.replace(pathname),
    [router],
  );
  useLegacyIndexHashRoute<EffectIndexView>({
    value: activeTab,
    setValue: setActiveTab,
    resolve: resolveLegacyHash,
    coverId: EFFECT_INDEX_LEGACY_COVER_ID,
    redirect: redirectLegacyHash,
  });

  const { count: columnCount, gate: columnGate, ref: panelRef } = useResponsiveColumnCount();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const activeTabConfig = TABS.find((tab) => tab.id === activeTab);

  const effectsWithLowerTags = useMemo<EffectWithLowerTags[]>(
    () =>
      effects.map((effect) => ({
        ...effect,
        lowerTags: getNormalizedEffectTags(effect.tags),
      })),
    [effects],
  );

  const filteredEffects = useMemo(() => {
    const tab = TABS.find((candidate) => candidate.id === activeTab);
    if (!tab || tab.filterTags.length === 0) {
      return effectsWithLowerTags;
    }

    return effectsWithLowerTags.filter((effect) =>
      tab.filterTags.some((tag) => effect.lowerTags.has(tag)),
    );
  }, [effectsWithLowerTags, activeTab]);

  const parentCategoryModels = useMemo<ParentCategoryModel[]>(() => {
    return PARENT_CATEGORIES.map((category) => {
      const uniqueSlugs = new Set<string>();
      const subcategories = category.subcategories
        .map((subcategory) => {
          const lowerTags = subcategory.tags.map((tag) => tag.toLowerCase());
          const matchingEffects = effectsWithLowerTags.filter((effect) =>
            matchesTags(effect, lowerTags),
          );
          for (const effect of matchingEffects) {
            uniqueSlugs.add(effect.slug);
          }

          const subcategorySlug = resolveSubcategorySlug(
            subcategory.tags,
            category.routeSlug,
          );
          return {
            ...subcategory,
            title: subcategory.title ? t(subcategory.title) : undefined,
            effects: matchingEffects,
            href: subcategorySlug
              ? publicHref.effectCategory(subcategorySlug)
              : undefined,
          };
        })
        .filter((subcategory) => subcategory.effects.length > 0);

      return {
        ...category,
        subcategories,
        totalEffects: uniqueSlugs.size,
      };
    }).filter((category) => category.totalEffects > 0);
  }, [effectsWithLowerTags, t]);

  const categoriesByColumn = useMemo(() => {
    if (activeTab !== "all") return new Map<number, ParentCategoryModel[]>();

    const columns = new Map<number, ParentCategoryModel[]>();

    for (let i = 0; i < columnCount; i++) {
      columns.set(i, []);
    }

    parentCategoryModels.forEach((category, index) => {
      const targetColumn =
        category.columns && category.columns[String(columnCount)] !== undefined
          ? category.columns[String(columnCount)] % columnCount
          : index % columnCount;
      columns.get(targetColumn)?.push(category);
    });

    return columns;
  }, [activeTab, parentCategoryModels, columnCount]);

  const flatCategoriesWithEffects = useMemo<FlatCategoryModel[]>(() => {
    if (activeTab === "all") return [];

    return FLAT_CATEGORIES
      .filter((category) => category.tab === activeTab)
      .map((category) => {
        const lowerTags = category.tags.map((tag) => tag.toLowerCase());
        const matchingEffects = filteredEffects.filter((effect) =>
          matchesTags(effect, lowerTags),
        );

        return {
          ...category,
          effects: matchingEffects,
        };
      })
      .filter((category) => category.effects.length > 0);
  }, [filteredEffects, activeTab]);

  const flatCategoriesByColumn = useMemo(() => {
    if (activeTab === "all") return new Map<number, typeof flatCategoriesWithEffects>();

    const columns = new Map<number, typeof flatCategoriesWithEffects>();

    for (let i = 0; i < columnCount; i++) {
      columns.set(i, []);
    }

    flatCategoriesWithEffects.forEach((category, index) => {
      const targetColumn = index % columnCount;
      columns.get(targetColumn)?.push(category);
    });

    return columns;
  }, [flatCategoriesWithEffects, activeTab, columnCount]);
  const { copiedKey, handleCopyFlatCategory, handleCopyParentCategory } =
    useEffectCategoryExport(effectsWithLowerTags);

  const visibleCardKeys = useMemo(() => {
    if (activeTab === "all") {
      return parentCategoryModels.map((category) => category.key);
    }

    return flatCategoriesWithEffects.map((category) => category.key);
  }, [activeTab, flatCategoriesWithEffects, parentCategoryModels]);

  useEffect(() => {
    setExpanded((previous) => {
      const nextState: Record<string, boolean> = {};
      visibleCardKeys.forEach((key) => {
        nextState[key] = previous[key] ?? true;
      });
      return nextState;
    });
  }, [visibleCardKeys]);


  const handleToggle = useCallback((key: string) => {
    setExpanded((previous) => ({
      ...previous,
      [key]: !(previous[key] ?? true),
    }));
  }, []);

  const getCategoryHref = useCallback(
    (routeSlug: string) => `/effects/category/${routeSlug}`,
    [],
  );

  const handleTabChange = (value: string) => {
    const nextView = value as EffectIndexView;
    setActiveTab(nextView);
    replaceCurrentIndexViewPath(effectIndexViewPath(nextView));
  };

  return (
    <>
      <div className="mx-auto max-w-3xl md:max-w-4xl">
        <div data-nosnippet>
          <PublicSegmentedTabs
            value={activeTab}
            onValueChange={handleTabChange}
            items={TABS.map((tab) => ({
              id: tab.id,
              icon: tab.icon,
              label: t(tab.label),
            }))}
            mobileVariant="appGrid"
            mobileClassName="-mt-4"
            listClassName="justify-center"
            ariaLabel={t("Effect categories")}
          />
        </div>

        {/* "All Effects" opens straight into the grid. The full thesis lives
            on the More Info tab; category tabs keep their one-paragraph blob. */}
        {activeTab === "info" ? (
          <SEIIntroSection effectCount={effects.length} copy={introCopy} />
        ) : activeTab !== "all" ? (
          <SEIIntroSection
            effectCount={effects.length}
            copy={introCopy}
            tabBlob={tabBlobs?.[activeTab] ?? activeTabConfig?.blob}
          />
        ) : null}
      </div>

      <div key={activeTab} className="theme-tab-panel-enter">
      {activeTab === "all" && (() => {
        const nonEmptyColumns = Array.from({ length: columnCount })
          .map((_, index) => ({ index, categories: categoriesByColumn.get(index) ?? [] }))
          .filter((column) => column.categories.length > 0);

        if (nonEmptyColumns.length === 0) {
          return null;
        }

        return (
          // With no standing intro on this tab, the grid supplies its own
          // offset from the tab strip — the same one the Substance Index
          // panels use — instead of hugging the pills.
          <div className="mt-6 sm:mt-10">
            <IndexPanelGrid ref={panelRef} columns={nonEmptyColumns.length} gate={columnGate}>
              {nonEmptyColumns.map((column) => (
                <div key={column.index} className={INDEX_PANEL_STACK_CLASS_NAME}>
                  {column.categories.map((category) => (
                    <ParentCategoryCard
                      key={category.key}
                      title={t(category.displayTitle ?? category.title)}
                      icon={category.icon}
                      subcategories={category.subcategories}
                      totalEffects={category.totalEffects}
                      effectHrefPrefix={effectHrefPrefix}
                      expanded={expanded[category.key] ?? true}
                      onExpandedChange={() => handleToggle(category.key)}
                      contentId={`${category.key}-list`}
                      titleHref={getCategoryHref(category.routeSlug)}
                      onIconClick={() => void handleCopyParentCategory(category)}
                      iconActionLabel={t("Copy {{category}} list to clipboard", {
                        category: t(category.title),
                      })}
                      iconActiveState={copiedKey === category.key}
                      toggleLabel={
                        (expanded[category.key] ?? true)
                          ? t("Collapse {{category}} category", { category: t(category.title) })
                          : t("Expand {{category}} category", { category: t(category.title) })
                      }
                    />
                  ))}
                </div>
              ))}
            </IndexPanelGrid>
          </div>
        );
      })()}

      {activeTab === "library" && (
        // Static curation, so no column measurement or hydration gate. Fourteen
        // links do not need a grid: one column on the intro's own 70ch measure
        // keeps every heading on the paragraph's left edge and never strands a
        // two-row panel beside a five-row one.
        <EffectsLibraryPanels />
      )}

      {activeTab !== "all" && activeTab !== "library" && (() => {
        const nonEmptyColumns = Array.from({ length: columnCount })
          .map((_, index) => ({ index, categories: flatCategoriesByColumn.get(index) ?? [] }))
          .filter((column) => column.categories.length > 0);

        if (nonEmptyColumns.length === 0) {
          return null;
        }

        return (
          <IndexPanelGrid ref={panelRef} columns={nonEmptyColumns.length} gate={columnGate}>
            {nonEmptyColumns.map((column) => (
              <div key={column.index} className={INDEX_PANEL_STACK_CLASS_NAME}>
                {column.categories.map((category) => (
                  <EffectCategoryCard
                    key={category.key}
                    title={t(category.title)}
                    icon={category.icon}
                    effects={category.effects}
                    effectHrefPrefix={effectHrefPrefix}
                    expanded={expanded[category.key] ?? true}
                    onExpandedChange={() => handleToggle(category.key)}
                    contentId={`${category.key}-list`}
                    titleHref={getCategoryHref(category.routeSlug)}
                    onIconClick={() => void handleCopyFlatCategory(category)}
                    iconActionLabel={t("Copy {{category}} list to clipboard", {
                      category: t(category.title),
                    })}
                    iconActiveState={copiedKey === category.key}
                    toggleLabel={
                      (expanded[category.key] ?? true)
                        ? t("Collapse {{category}} category", { category: t(category.title) })
                        : t("Expand {{category}} category", { category: t(category.title) })
                    }
                  />
                ))}
              </div>
            ))}
          </IndexPanelGrid>
        );
      })()}

      {/* The Library is curated config, not a filtered effect list, so an
          empty corpus must not paint "No effects found" under its panels. */}
      {activeTab !== "library" && filteredEffects.length === 0 && (
        <StateCard
          badge={emptyState?.badge ?? "No effects"}
          badgeVariant="secondary"
          title={emptyState?.title ?? "No effects found"}
          description={
              emptyState?.description ??
              "No subjective effects are published yet. They will appear here once the index is available."
            }
          icon={emptyState?.icon ?? "lucide:search-x"}
          tone="neutral"
        />
      )}
      </div>
    </>
  );
}
