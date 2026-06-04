"use client";

import { useMemo, useState } from "react";
import { StateCard } from "@/components/common/StateCard";
import { PublicSegmentedTabs } from "@/components/layout/PublicSegmentedTabs";
import { useResponsiveColumnCount } from "@/hooks/useResponsiveColumnCount";
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

const EFFECT_FAMILY_COLOR_CLASS: Record<string, string> = {
  sensory: "[--effect-family-heading:oklch(44%_0.14_238)] [--effect-family-heading-hover:oklch(52%_0.16_238)] [--effect-family-icon:oklch(58%_0.16_238)] [--effect-family-icon-strong:oklch(66%_0.17_238)] [--effect-family-ring:oklch(70%_0.11_238_/_0.38)] [--effect-family-ring-strong:oklch(63%_0.15_238_/_0.58)] [--effect-family-surface:oklch(95%_0.025_238_/_0.78)] [--effect-family-surface-hover:oklch(92%_0.04_238_/_0.9)] [--effect-family-shadow:oklch(62%_0.15_238_/_0.14)] dark:[--effect-family-heading:oklch(78%_0.11_238)] dark:[--effect-family-heading-hover:oklch(84%_0.12_238)] dark:[--effect-family-icon:oklch(74%_0.13_238)] dark:[--effect-family-icon-strong:oklch(82%_0.13_238)] dark:[--effect-family-ring:oklch(69%_0.13_238_/_0.28)] dark:[--effect-family-ring-strong:oklch(75%_0.14_238_/_0.45)] dark:[--effect-family-surface:oklch(58%_0.12_238_/_0.12)] dark:[--effect-family-surface-hover:oklch(62%_0.13_238_/_0.17)] dark:[--effect-family-shadow:oklch(68%_0.14_238_/_0.18)]",
  cognitive: "[--effect-family-heading:oklch(43%_0.15_306)] [--effect-family-heading-hover:oklch(50%_0.17_306)] [--effect-family-icon:oklch(57%_0.17_306)] [--effect-family-icon-strong:oklch(64%_0.18_306)] [--effect-family-ring:oklch(70%_0.12_306_/_0.38)] [--effect-family-ring-strong:oklch(64%_0.16_306_/_0.58)] [--effect-family-surface:oklch(95%_0.026_306_/_0.78)] [--effect-family-surface-hover:oklch(92%_0.043_306_/_0.9)] [--effect-family-shadow:oklch(62%_0.16_306_/_0.14)] dark:[--effect-family-heading:oklch(80%_0.13_306)] dark:[--effect-family-heading-hover:oklch(85%_0.13_306)] dark:[--effect-family-icon:oklch(76%_0.15_306)] dark:[--effect-family-icon-strong:oklch(83%_0.15_306)] dark:[--effect-family-ring:oklch(72%_0.14_306_/_0.28)] dark:[--effect-family-ring-strong:oklch(78%_0.15_306_/_0.45)] dark:[--effect-family-surface:oklch(59%_0.12_306_/_0.12)] dark:[--effect-family-surface-hover:oklch(63%_0.13_306_/_0.17)] dark:[--effect-family-shadow:oklch(70%_0.15_306_/_0.18)]",
  physical: "[--effect-family-heading:oklch(39%_0.12_151)] [--effect-family-heading-hover:oklch(46%_0.14_151)] [--effect-family-icon:oklch(50%_0.14_151)] [--effect-family-icon-strong:oklch(57%_0.15_151)] [--effect-family-ring:oklch(66%_0.11_151_/_0.42)] [--effect-family-ring-strong:oklch(58%_0.14_151_/_0.6)] [--effect-family-surface:oklch(95%_0.028_151_/_0.78)] [--effect-family-surface-hover:oklch(91%_0.043_151_/_0.9)] [--effect-family-shadow:oklch(57%_0.14_151_/_0.14)] dark:[--effect-family-heading:oklch(77%_0.12_151)] dark:[--effect-family-heading-hover:oklch(83%_0.13_151)] dark:[--effect-family-icon:oklch(72%_0.14_151)] dark:[--effect-family-icon-strong:oklch(80%_0.14_151)] dark:[--effect-family-ring:oklch(69%_0.13_151_/_0.28)] dark:[--effect-family-ring-strong:oklch(75%_0.14_151_/_0.45)] dark:[--effect-family-surface:oklch(56%_0.12_151_/_0.12)] dark:[--effect-family-surface-hover:oklch(61%_0.13_151_/_0.17)] dark:[--effect-family-shadow:oklch(66%_0.14_151_/_0.18)]",
};

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

        <PublicSegmentedTabs
          value={activeTab}
          onValueChange={(value) => setActiveTab(value)}
          items={TABS.map((tab) => ({
            id: tab.id,
            icon: tab.icon,
            label: tab.label,
          }))}
          className="mb-4"
          ariaLabel="Effect categories"
        />
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
                    colorClassName={EFFECT_FAMILY_COLOR_CLASS[category.tab]}
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
                    colorClassName={EFFECT_FAMILY_COLOR_CLASS[category.tab]}
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
