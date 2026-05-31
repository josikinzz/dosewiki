"use client";

import { useMemo, useState } from "react";
import { Icon } from "@/components/common/Icon";
import { StateCard } from "@/components/common/StateCard";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useResponsiveColumnCount } from "@/hooks/useResponsiveColumnCount";
import { cn } from "@/lib/utils";
import type { PublicRouteEmptyState } from "@server/next/publicRouteOutcomes";
import { EffectCategoryCard } from "../components/EffectCategoryCard";
import { ParentCategoryCard } from "../components/ParentCategoryCard";
import { SEIIntroSection } from "../components/SEIIntroSection";
import {
  FLAT_CATEGORIES,
  PARENT_CATEGORIES,
  TABS,
  type ParentCategoryConfig,
  type TabId,
} from "./effectsIndexConfig";

interface EffectSummary {
  slug: string;
  name: string;
  tags: string[];
}

interface EffectsIndexExplorerProps {
  effects: EffectSummary[];
  effectHrefPrefix?: string;
  emptyState?: PublicRouteEmptyState;
}

export function EffectsIndexExplorer({
  effects,
  effectHrefPrefix,
  emptyState,
}: EffectsIndexExplorerProps) {
  const [activeTab, setActiveTab] = useState<TabId>("all");
  const columnCount = useResponsiveColumnCount({ limitColumns: true });

  const activeTabConfig = TABS.find((tab) => tab.id === activeTab);

  const filteredEffects = useMemo(() => {
    const tab = TABS.find((candidate) => candidate.id === activeTab);
    if (!tab || tab.filterTags.length === 0) {
      return effects;
    }

    return effects.filter((effect) =>
      effect.tags.some((tag) => tab.filterTags.includes(tag.toLowerCase())),
    );
  }, [effects, activeTab]);

  const categoriesByColumn = useMemo(() => {
    if (activeTab !== "all") return new Map<number, ParentCategoryConfig[]>();

    const columns = new Map<number, ParentCategoryConfig[]>();

    for (let i = 0; i < columnCount; i++) {
      columns.set(i, []);
    }

    PARENT_CATEGORIES.forEach((category, index) => {
      const targetColumn =
        category.columns && category.columns[String(columnCount)] !== undefined
          ? category.columns[String(columnCount)] % columnCount
          : index % columnCount;
      columns.get(targetColumn)?.push(category);
    });

    return columns;
  }, [activeTab, columnCount]);

  const flatCategoriesWithEffects = useMemo(() => {
    if (activeTab === "all") return [];

    return FLAT_CATEGORIES
      .filter((category) => category.tab === activeTab)
      .map((category) => {
        const matchingEffects = filteredEffects.filter((effect) => {
          const effectTags = effect.tags.map((tag) => tag.toLowerCase());
          return category.tags.every((categoryTag) => effectTags.includes(categoryTag.toLowerCase()));
        });

        return {
          ...category,
          effects: matchingEffects.sort((a, b) => a.name.localeCompare(b.name)),
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

  return (
    <>
      <div className="mx-auto max-w-3xl md:max-w-4xl">
        <SEIIntroSection
          effectCount={effects.length}
          tabBlob={activeTab !== "all" ? activeTabConfig?.blob : undefined}
        />

        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as TabId)} className="mb-4 flex justify-center">
          <TabsList className="flex-wrap h-auto rounded-2xl bg-white/[0.035] p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_18px_36px_-28px_rgba(0,0,0,0.55)] gap-1">
            {TABS.map((tab) => (
              <TabsTrigger
                key={tab.id}
                value={tab.id}
                className={cn(
                  "gap-2.5 rounded-xl px-5 py-2.5 text-[0.9375rem] font-medium transition-[background-color,color,box-shadow] duration-300",
                  "text-white/68 hover:bg-white/[0.05] hover:text-white",
                  "data-[state=active]:bg-[color:var(--theme-surface-muted)] data-[state=active]:text-white data-[state=active]:shadow-[inset_0_0_0_1px_rgba(244,114,182,0.18)]",
                )}
              >
                <Icon icon={tab.icon} size={18} />
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {activeTab === "all" && (() => {
        const nonEmptyColumns = Array.from({ length: columnCount })
          .map((_, index) => ({ index, categories: categoriesByColumn.get(index) ?? [] }))
          .filter((column) => column.categories.length > 0);

        return (
          <div
            className="mx-auto grid w-full max-w-[1600px] gap-4 px-4"
            style={{ gridTemplateColumns: `repeat(${nonEmptyColumns.length}, minmax(0, 1fr))` }}
          >
            {nonEmptyColumns.map((column) => (
              <div key={column.index} className="flex flex-col gap-4">
                {column.categories.map((category) => (
                  <ParentCategoryCard
                    key={category.key}
                    title={category.title}
                    icon={category.icon}
                    subcategories={category.subcategories}
                    effects={effects}
                    effectHrefPrefix={effectHrefPrefix}
                  />
                ))}
              </div>
            ))}
          </div>
        );
      })()}

      {activeTab !== "all" && (() => {
        const nonEmptyColumns = Array.from({ length: columnCount })
          .map((_, index) => ({ index, categories: flatCategoriesByColumn.get(index) ?? [] }))
          .filter((column) => column.categories.length > 0);

        return (
          <div
            className="mx-auto grid w-full max-w-[1600px] gap-4 px-4"
            style={{ gridTemplateColumns: `repeat(${nonEmptyColumns.length}, minmax(0, 1fr))` }}
          >
            {nonEmptyColumns.map((column) => (
              <div key={column.index} className="flex flex-col gap-4">
                {column.categories.map((category) => (
                  <EffectCategoryCard
                    key={category.key}
                    title={category.title}
                    icon={category.icon}
                    effects={category.effects}
                    effectHrefPrefix={effectHrefPrefix}
                  />
                ))}
              </div>
            ))}
          </div>
        );
      })()}

      {filteredEffects.length === 0 && (
        <StateCard
          badge={emptyState?.badge ?? "No effects"}
          badgeVariant="secondary"
          title={emptyState?.title ?? "No effects found"}
          description={emptyState?.description ?? "No subjective effects have been imported yet. Run the migration flow to populate this index."}
          icon={emptyState?.icon ?? "lucide:search-x"}
          tone="neutral"
        />
      )}
    </>
  );
}
