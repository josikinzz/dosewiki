"use client";

import Link from "next/link";
import { useState, useMemo, memo } from "react";
import { AppImage } from "@/components/common/AppImage";
import { Icon } from "@/components/common/Icon";
import { StateCard } from "@/components/common/StateCard";
import { PageHeader } from "@/components/layout/PageHeader";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EffectCategoryCard } from "../components/EffectCategoryCard";
import { ParentCategoryCard } from "../components/ParentCategoryCard";
import { SEIIntroSection } from "../components/SEIIntroSection";
import { useResponsiveColumnCount } from "@/hooks/useResponsiveColumnCount";
import { cn } from "@/lib/utils";
import {
  FLAT_CATEGORIES,
  PARENT_CATEGORIES,
  TABS,
  type ParentCategoryConfig,
  type TabId,
} from "./effectsIndexConfig";

/**
 * Minimal effect type for index display.
 */
interface EffectSummary {
  slug: string;
  name: string;
  tags: string[];
}

interface EffectsIndexPageProps {
  effects: EffectSummary[];
  effectHrefPrefix?: string;
  onSelectEffect?: (slug: string) => void;
}

/**
 * Tabbed effects index page.
 *
 * "All" tab: 3-column layout with hierarchical parent category cards.
 * Sensory/Cognitive/Physical tabs: Flat card layout with subcategories as individual cards.
 */
export const EffectsIndexPage = memo(function EffectsIndexPage({
  effects,
  effectHrefPrefix,
  onSelectEffect,
}: EffectsIndexPageProps) {
  const [activeTab, setActiveTab] = useState<TabId>("all");
  const columnCount = useResponsiveColumnCount({ limitColumns: true });

  const activeTabConfig = TABS.find(t => t.id === activeTab);

  // Filter effects by tab
  const filteredEffects = useMemo(() => {
    const tab = TABS.find(t => t.id === activeTab);
    if (!tab || tab.filterTags.length === 0) {
      return effects;
    }

    return effects.filter(effect =>
      effect.tags.some(tag =>
        tab.filterTags.includes(tag.toLowerCase())
      )
    );
  }, [effects, activeTab]);

  // For "all" tab: get categories grouped by responsive column
  const categoriesByColumn = useMemo(() => {
    if (activeTab !== "all") return new Map<number, ParentCategoryConfig[]>();

    const columns = new Map<number, ParentCategoryConfig[]>();

    // Initialize all columns
    for (let i = 0; i < columnCount; i++) {
      columns.set(i, []);
    }

    // Distribute categories to columns based on responsive assignments
    PARENT_CATEGORIES.forEach((cat, index) => {
      let targetColumn: number;
      if (cat.columns && cat.columns[String(columnCount)] !== undefined) {
        targetColumn = cat.columns[String(columnCount)] % columnCount;
      } else {
        // Fallback to round-robin
        targetColumn = index % columnCount;
      }
      columns.get(targetColumn)?.push(cat);
    });

    return columns;
  }, [activeTab, columnCount]);

  // For other tabs: get flat categories with effects
  const flatCategoriesWithEffects = useMemo(() => {
    if (activeTab === "all") return [];

    return FLAT_CATEGORIES
      .filter(cat => cat.tab === activeTab)
      .map(cat => {
        const matchingEffects = filteredEffects.filter(effect => {
          const effectTags = effect.tags.map(t => t.toLowerCase());
          return cat.tags.every(catTag => effectTags.includes(catTag.toLowerCase()));
        });

        return {
          ...cat,
          effects: matchingEffects.sort((a, b) => a.name.localeCompare(b.name)),
        };
      })
      .filter(cat => cat.effects.length > 0);
  }, [filteredEffects, activeTab]);

  // Distribute flat categories across columns
  const flatCategoriesByColumn = useMemo(() => {
    if (activeTab === "all") return new Map<number, typeof flatCategoriesWithEffects>();

    const columns = new Map<number, typeof flatCategoriesWithEffects>();

    // Initialize all columns
    for (let i = 0; i < columnCount; i++) {
      columns.set(i, []);
    }

    // Round-robin distribution for flat categories
    flatCategoriesWithEffects.forEach((cat, index) => {
      const targetColumn = index % columnCount;
      columns.get(targetColumn)?.push(cat);
    });

    return columns;
  }, [flatCategoriesWithEffects, activeTab, columnCount]);

  return (
    <div className="mx-auto w-full px-4 pb-20 pt-12 2xl:px-8">
      <div className="mx-auto max-w-3xl md:max-w-4xl">
        <div>
          <PageHeader
            title="Subjective Effect Index"
            icon="lucide:sparkles"
            showSpotlight={false}
          />

          {/* Creator Attribution - Moved closer to title */}
          <div className="-mt-14 mb-12 flex justify-center relative z-10">
            <Link
              href="/contributors/josie"
              className="group flex cursor-pointer items-center gap-2.5 rounded-full bg-white/[0.025] py-1.5 pl-2 pr-4 ring-1 ring-white/10 transition-all hover:bg-white/[0.05] hover:ring-fuchsia-400/25 backdrop-blur-md"
            >
              <AppImage
                src="/profile-avatars/josie/avatar.webp"
                alt="Josie Kins"
                width={24}
                height={24}
                className="h-6 w-6 rounded-full object-cover ring-2 ring-white/10 transition group-hover:ring-fuchsia-400/40"
              />
              <span className="text-xs font-medium text-white/56 transition group-hover:text-white/74">
                created by <span className="font-semibold text-fuchsia-200/90 group-hover:text-fuchsia-100">Josie Kins</span>, 2011
              </span>
            </Link>
          </div>
        </div>

        {/* Intro Section */}
        <div>
          <SEIIntroSection
            effectCount={effects.length}
            tabBlob={activeTab !== "all" ? activeTabConfig?.blob : undefined}
          />
        </div>

        {/* Tab Navigation */}
        <div>
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabId)} className="mb-4 flex justify-center">
            <TabsList className="flex-wrap h-auto rounded-2xl bg-white/[0.035] p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_18px_36px_-28px_rgba(0,0,0,0.55)] gap-1">
              {TABS.map(tab => (
                <TabsTrigger
                  key={tab.id}
                  value={tab.id}
                  className={cn(
                    "gap-2.5 rounded-xl px-5 py-2.5 text-[0.9375rem] font-medium transition-[background-color,color,box-shadow] duration-300",
                    "text-white/68 hover:bg-white/[0.05] hover:text-white",
                    "data-[state=active]:bg-[color:var(--theme-surface-muted)] data-[state=active]:text-white data-[state=active]:shadow-[inset_0_0_0_1px_rgba(244,114,182,0.18)]"
                  )}
                >
                  <Icon icon={tab.icon} size={18} />
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

        </div>
      </div>

      {/* ALL TAB: Responsive column layout */}
      {activeTab === "all" && (() => {
        const nonEmptyCols = Array.from({ length: columnCount })
          .map((_, i) => ({ index: i, cats: categoriesByColumn.get(i) ?? [] }))
          .filter(col => col.cats.length > 0);
        return (
          <div
            className="mx-auto grid w-full max-w-[1600px] gap-4 px-4"
            style={{ gridTemplateColumns: `repeat(${nonEmptyCols.length}, minmax(0, 1fr))` }}
          >
            {nonEmptyCols.map((col) => (
              <div key={col.index} className="flex flex-col gap-4">
                {col.cats.map(cat => (
                  <ParentCategoryCard
                    key={cat.key}
                    title={cat.title}
                    icon={cat.icon}
                    subcategories={cat.subcategories}
                    effects={effects}
                    effectHrefPrefix={effectHrefPrefix}
                    onSelectEffect={onSelectEffect}
                  />
                ))}
              </div>
            ))}
          </div>
        );
      })()}

      {/* SENSORY/COGNITIVE/PHYSICAL TABS: Responsive column layout */}
      {activeTab !== "all" && (() => {
        const nonEmptyCols = Array.from({ length: columnCount })
          .map((_, i) => ({ index: i, cats: flatCategoriesByColumn.get(i) ?? [] }))
          .filter(col => col.cats.length > 0);
        return (
          <div
            className="mx-auto grid w-full max-w-[1600px] gap-4 px-4"
            style={{ gridTemplateColumns: `repeat(${nonEmptyCols.length}, minmax(0, 1fr))` }}
          >
            {nonEmptyCols.map((col) => (
              <div key={col.index} className="flex flex-col gap-4">
                {col.cats.map(cat => (
                  <EffectCategoryCard
                    key={cat.key}
                    title={cat.title}
                    icon={cat.icon}
                    effects={cat.effects}
                    effectHrefPrefix={effectHrefPrefix}
                    onSelectEffect={onSelectEffect}
                  />
                ))}
              </div>
            ))}
          </div>
        );
      })()}

      {/* Empty State */}
      {filteredEffects.length === 0 && (
        <StateCard
          badge="No effects"
          badgeVariant="secondary"
          title="No effects found"
          description="No subjective effects have been imported yet. Run the migration flow to populate this index."
          icon="lucide:search-x"
          tone="neutral"
        />
      )}
    </div>
  );
});
