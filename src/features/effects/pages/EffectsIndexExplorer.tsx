"use client";

import { useCallback, useMemo, useState } from "react";
import { StateCard } from "@/components/common/StateCard";
import { Icon, type IconName } from "@/components/common/Icon";
import { IndexCardList, IndexCardListItem } from "@/components/common/IndexCard";
import { PublicSegmentedTabs } from "@/components/layout/PublicSegmentedTabs";
import { Button } from "@/components/ui/button";
import { InteractiveSurface } from "@/components/ui/surface";
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

const PREVIEW_EFFECT_LIMIT = 3;

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

type EffectWithLowerTags = EffectSummary & {
  lowerTags: Set<string>;
};

type ParentCategoryPreviewModel = ParentCategoryConfig & {
  previewGroups: EffectPreviewGroup[];
  totalEffects: number;
};

type FlatCategoryPreviewModel = (typeof FLAT_CATEGORIES)[number] & {
  effects: EffectSummary[];
};

interface EffectPreviewGroup {
  key: string;
  title?: string;
  effects: EffectSummary[];
}

interface ProgressiveEffectPreviewCardProps {
  cardKey: string;
  title: string;
  icon: IconName;
  count: number;
  previewGroups: EffectPreviewGroup[];
  effectHrefPrefix?: string;
  colorClassName?: string;
  onReveal: (key: string) => void;
}

function matchesTags(effect: EffectWithLowerTags, tags: string[]) {
  return tags.every((tag) => effect.lowerTags.has(tag.toLowerCase()));
}

function sortEffectsByName(effects: EffectSummary[]) {
  return [...effects].sort((a, b) => a.name.localeCompare(b.name));
}

function ProgressiveEffectPreviewCard({
  cardKey,
  title,
  icon,
  count,
  previewGroups,
  effectHrefPrefix,
  colorClassName,
  onReveal,
}: ProgressiveEffectPreviewCardProps) {
  const contentId = `${cardKey.replace(/[^a-z0-9-]/gi, "-")}-preview`;
  const previewedCount = previewGroups.reduce(
    (total, group) =>
      total + Math.min(group.effects.length, PREVIEW_EFFECT_LIMIT),
    0,
  );
  const hasHiddenEffects = previewGroups.some(
    (group) => group.effects.length > PREVIEW_EFFECT_LIMIT,
  );

  return (
    <InteractiveSurface
      asChild
      variant="index"
      padding="md"
      radius="index"
      className="group w-full transition-all duration-300"
    >
      <section className={colorClassName}>
        <header className="flex items-start gap-4 pb-2">
          <div
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-dose-surface-muted ring-1 ring-dose-divider transition-colors duration-200 group-hover:bg-dose-surface-strong group-hover:ring-dose-card-border",
              colorClassName
                ? "bg-[color:color-mix(in_srgb,var(--effect-family-surface)_72%,transparent)] ring-[color:color-mix(in_srgb,var(--effect-family-ring)_66%,transparent)] group-hover:bg-[color:var(--effect-family-surface-hover)] group-hover:ring-[color:color-mix(in_srgb,var(--effect-family-ring-strong)_58%,transparent)]"
                : undefined,
            )}
          >
            <Icon
              icon={icon}
              size={20}
              className={cn(
                "text-dose-accent-soft transition-colors group-hover:text-dose-accent-soft",
                colorClassName
                  ? "text-[color:var(--effect-family-icon)]"
                  : undefined,
              )}
            />
          </div>
          <div className="min-w-0 flex-1 pt-0.5">
            <h2
              className={cn(
                "theme-text-primary text-lg font-bold tracking-tight transition-colors duration-200 group-hover:text-dose-accent-soft",
                colorClassName
                  ? "group-hover:text-[color:var(--effect-family-heading-hover)]"
                  : undefined,
              )}
            >
              {title}
              <span className="theme-text-faint ml-2 text-[0.9em] font-medium transition-colors group-hover:text-dose-text-secondary">
                ({count})
              </span>
            </h2>
            <p className="theme-text-faint mt-1 text-xs">
              Showing {Math.min(previewedCount, count)} of {count} effects
            </p>
          </div>
          {hasHiddenEffects ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => onReveal(cardKey)}
              aria-expanded={false}
              aria-controls={contentId}
              aria-label={`Show all ${title}`}
              className="theme-text-faint h-11 w-11 shrink-0 rounded-xl transition-[background-color,color,transform] hover:-translate-y-px hover:bg-dose-surface-muted hover:text-dose-text"
            >
              <Icon icon="lucide:chevrons-down" size={16} />
            </Button>
          ) : null}
        </header>

        <div id={contentId} className="mt-3 space-y-5">
          {previewGroups.map((group, groupIndex) => {
            const visibleEffects = group.effects.slice(0, PREVIEW_EFFECT_LIMIT);
            const hiddenCount = group.effects.length - visibleEffects.length;

            return (
              <div
                key={group.key}
                className={cn(
                  groupIndex > 0
                    ? "relative pt-5 before:absolute before:left-0 before:right-0 before:top-0 before:h-px before:bg-[image:var(--theme-horizontal-divider-image)] before:content-['']"
                    : undefined,
                )}
              >
                {group.title ? (
                  <p className="theme-text-secondary mb-3 flex items-center gap-2 text-[0.78rem] font-semibold uppercase tracking-[0.18em]">
                    {group.title}
                    <span className="theme-text-faint text-xs font-normal normal-case">
                      ({group.effects.length})
                    </span>
                  </p>
                ) : null}
                <IndexCardList>
                  {visibleEffects.map((effect) => (
                    <IndexCardListItem
                      key={effect.slug}
                      label={effect.name}
                      href={
                        effectHrefPrefix
                          ? `${effectHrefPrefix}${effect.slug}`
                          : undefined
                      }
                      slug={effect.slug}
                    />
                  ))}
                </IndexCardList>
                {hiddenCount > 0 ? (
                  <p className="theme-text-faint mt-2 px-3 text-xs">
                    +{hiddenCount} more in this group
                  </p>
                ) : null}
              </div>
            );
          })}
          {hasHiddenEffects ? (
            <Button
              type="button"
              variant="ghostPill"
              size="pill"
              onClick={() => onReveal(cardKey)}
              aria-expanded={false}
              aria-controls={contentId}
              className="mt-1 w-full justify-center"
            >
              Show all {count} effects
            </Button>
          ) : null}
        </div>
      </section>
    </InteractiveSurface>
  );
}

export function EffectsIndexExplorer({
  effects,
  effectHrefPrefix,
  emptyState,
}: EffectsIndexExplorerProps) {
  const [activeTab, setActiveTab] = useState<TabId>("all");
  const [expandedCards, setExpandedCards] = useState<Set<string>>(
    () => new Set(),
  );
  const columnCount = useResponsiveColumnCount({ limitColumns: true });

  const activeTabConfig = TABS.find((tab) => tab.id === activeTab);

  const revealCard = useCallback((cardKey: string) => {
    setExpandedCards((previous) => {
      const next = new Set(previous);
      next.add(cardKey);
      return next;
    });
  }, []);

  const filteredEffects = useMemo(() => {
    const tab = TABS.find((candidate) => candidate.id === activeTab);
    if (!tab || tab.filterTags.length === 0) {
      return effects;
    }

    return effects.filter((effect) =>
      effect.tags.some((tag) => tab.filterTags.includes(tag.toLowerCase())),
    );
  }, [effects, activeTab]);

  const effectsWithLowerTags = useMemo<EffectWithLowerTags[]>(
    () =>
      effects.map((effect) => ({
        ...effect,
        lowerTags: new Set(effect.tags.map((tag) => tag.toLowerCase())),
      })),
    [effects],
  );

  const parentCategoryModels = useMemo<ParentCategoryPreviewModel[]>(() => {
    return PARENT_CATEGORIES.map((category) => {
      const previewGroups = category.subcategories
        .map((subcategory) => ({
          ...subcategory,
          effects: sortEffectsByName(
            effectsWithLowerTags.filter((effect) =>
              matchesTags(effect, subcategory.tags),
            ),
          ),
        }))
        .filter((subcategory) => subcategory.effects.length > 0);

      const uniqueSlugs = new Set(
        previewGroups.flatMap((group) =>
          group.effects.map((effect) => effect.slug),
        ),
      );

      return {
        ...category,
        previewGroups,
        totalEffects: uniqueSlugs.size,
      };
    }).filter((category) => category.totalEffects > 0);
  }, [effectsWithLowerTags]);

  const categoriesByColumn = useMemo(() => {
    if (activeTab !== "all") return new Map<number, ParentCategoryPreviewModel[]>();

    const columns = new Map<number, ParentCategoryPreviewModel[]>();

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

  const flatCategoriesWithEffects = useMemo<FlatCategoryPreviewModel[]>(() => {
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
          effects: sortEffectsByName(matchingEffects),
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

        if (nonEmptyColumns.length === 0) {
          return null;
        }

        return (
          <div
            className="mx-auto grid w-full max-w-[1600px] gap-5 px-4 lg:gap-6"
            style={{ gridTemplateColumns: `repeat(${nonEmptyColumns.length}, minmax(0, 1fr))` }}
          >
            {nonEmptyColumns.map((column) => (
              <div key={column.index} className="flex flex-col gap-5 lg:gap-6">
                {column.categories.map((category) => (
                  expandedCards.has(`all:${category.key}`) ? (
                    <ParentCategoryCard
                      key={category.key}
                      title={category.title}
                      icon={category.icon}
                      subcategories={category.subcategories}
                      effects={effects}
                      effectHrefPrefix={effectHrefPrefix}
                      colorClassName={EFFECT_FAMILY_COLOR_CLASS[category.tab]}
                    />
                  ) : (
                    <ProgressiveEffectPreviewCard
                      key={category.key}
                      cardKey={`all:${category.key}`}
                      title={category.title}
                      icon={category.icon}
                      count={category.totalEffects}
                      previewGroups={category.previewGroups}
                      effectHrefPrefix={effectHrefPrefix}
                      colorClassName={EFFECT_FAMILY_COLOR_CLASS[category.tab]}
                      onReveal={revealCard}
                    />
                  )
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

        if (nonEmptyColumns.length === 0) {
          return null;
        }

        return (
          <div
            className="mx-auto grid w-full max-w-[1600px] gap-5 px-4 lg:gap-6"
            style={{ gridTemplateColumns: `repeat(${nonEmptyColumns.length}, minmax(0, 1fr))` }}
          >
            {nonEmptyColumns.map((column) => (
              <div key={column.index} className="flex flex-col gap-5 lg:gap-6">
                {column.categories.map((category) => (
                  expandedCards.has(`${activeTab}:${category.key}`) ? (
                    <EffectCategoryCard
                      key={category.key}
                      title={category.title}
                      icon={category.icon}
                      effects={category.effects}
                      effectHrefPrefix={effectHrefPrefix}
                      colorClassName={EFFECT_FAMILY_COLOR_CLASS[category.tab]}
                    />
                  ) : (
                    <ProgressiveEffectPreviewCard
                      key={category.key}
                      cardKey={`${activeTab}:${category.key}`}
                      title={category.title}
                      icon={category.icon}
                      count={category.effects.length}
                      previewGroups={[
                        {
                          key: category.key,
                          effects: category.effects,
                        },
                      ]}
                      effectHrefPrefix={effectHrefPrefix}
                      colorClassName={EFFECT_FAMILY_COLOR_CLASS[category.tab]}
                      onReveal={revealCard}
                    />
                  )
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
