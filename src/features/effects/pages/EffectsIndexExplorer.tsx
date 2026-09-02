"use client";

import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { IndexPanelGrid, INDEX_PANEL_STACK_CLASS_NAME } from "@/components/common/IndexPanelLayout";
import { StateCard } from "@/components/common/StateCard";
import { PublicSegmentedTabs } from "@/components/layout/PublicSegmentedTabs";
import { useResponsiveColumnCount } from "@/hooks/useResponsiveColumnCount";
import { useLegacyIndexHashRoute } from "@/hooks/useLegacyIndexHashRoute";
import type { PublicRouteEmptyState } from "@server/next/publicRouteOutcomes";
import { EffectCategoryCard } from "../components/EffectCategoryCard";
import { ParentCategoryCard } from "../components/ParentCategoryCard";
import { SEIIntroSection } from "../components/SEIIntroSection";
import type { SEIIntroCopy } from "../components/seiIntroCopy";
import {
  FLAT_CATEGORIES,
  PARENT_CATEGORIES,
  TABS,
  type ParentCategoryConfig,
  type TabId,
} from "./effectsIndexConfig";
import {
  EFFECT_INDEX_DEFAULT_VIEW,
  EFFECT_INDEX_LEGACY_COVER_ID,
  effectIndexViewPath,
  parseLegacyEffectIndexHash,
  replaceCurrentIndexViewPath,
  type EffectIndexView,
} from "@/utils/indexViewRoutes";

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

type ParentCategoryModel = ParentCategoryConfig & {
  totalEffects: number;
};

type FlatCategoryModel = (typeof FLAT_CATEGORIES)[number] & {
  effects: EffectSummary[];
};

function matchesTags(effect: EffectWithLowerTags, tags: string[]) {
  return tags.every((tag) => effect.lowerTags.has(tag.toLowerCase()));
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

  const { count: columnCount, gate: columnGate } = useResponsiveColumnCount();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

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

  const effectsWithLowerTags = useMemo<EffectWithLowerTags[]>(
    () =>
      effects.map((effect) => ({
        ...effect,
        lowerTags: new Set(effect.tags.map((tag) => tag.toLowerCase())),
      })),
    [effects],
  );

  const parentCategoryModels = useMemo<ParentCategoryModel[]>(() => {
    return PARENT_CATEGORIES.map((category) => {
      const uniqueSlugs = new Set(
        category.subcategories.flatMap((subcategory) =>
          effectsWithLowerTags
            .filter((effect) => matchesTags(effect, subcategory.tags))
            .map((effect) => effect.slug),
        ),
      );

      return {
        ...category,
        totalEffects: uniqueSlugs.size,
      };
    }).filter((category) => category.totalEffects > 0);
  }, [effectsWithLowerTags]);

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
        const matchingEffects = filteredEffects.filter((effect) => {
          const effectTags = effect.tags.map((tag) => tag.toLowerCase());
          return category.tags.every((categoryTag) => effectTags.includes(categoryTag.toLowerCase()));
        });

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

  useEffect(() => {
    if (!copiedKey) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setCopiedKey(null);
    }, 2000);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [copiedKey]);

  const writeToClipboard = async (text: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }

    if (typeof document === "undefined") {
      return false;
    }

    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "absolute";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);

    const selection = document.getSelection?.();
    const previousRange = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;

    textarea.select();

    let successful = false;
    try {
      successful = document.execCommand("copy");
    } catch {
      successful = false;
    }

    document.body.removeChild(textarea);

    if (selection) {
      selection.removeAllRanges();
      if (previousRange) {
        selection.addRange(previousRange);
      }
    }

    return successful;
  };

  const getParentCategorySections = useCallback((category: ParentCategoryModel) => {
    return category.subcategories
      .map((subcategory) => {
        const lowerSubTags = subcategory.tags.map((tag) => tag.toLowerCase());
        const sectionEffects = effectsWithLowerTags.filter((effect) =>
          lowerSubTags.every((tag) => effect.lowerTags.has(tag)),
        );

        return {
          title: subcategory.title,
          effects: sectionEffects,
        };
      })
      .filter((section) => section.effects.length > 0);
  }, [effectsWithLowerTags]);

  const buildMarkdownForParentCategory = useCallback((category: ParentCategoryModel) => {
    const lines: string[] = [`### ${category.title}`];
    const sections = getParentCategorySections(category);

    if (sections.length > 0) {
      sections.forEach((section) => {
        lines.push("");
        if (section.title) {
          lines.push(`#### ${section.title}`);
        }
        section.effects.forEach((effect) => {
          lines.push(`- ${effect.name}`);
        });
      });
    } else {
      lines.push("", "- _No effects_");
    }

    return lines.join("\n");
  }, [getParentCategorySections]);

  const buildMarkdownForFlatCategory = useCallback((category: FlatCategoryModel) => {
    const lines: string[] = [`### ${category.title}`];

    if (category.effects.length > 0) {
      lines.push("");
      category.effects.forEach((effect) => {
        lines.push(`- ${effect.name}`);
      });
    } else {
      lines.push("", "- _No effects_");
    }

    return lines.join("\n");
  }, []);

  const handleCopyParentCategory = useCallback(async (category: ParentCategoryModel) => {
    try {
      const copied = await writeToClipboard(buildMarkdownForParentCategory(category));
      if (copied) {
        setCopiedKey(category.key);
      }
    } catch {
      console.error("Failed to copy effect category list");
    }
  }, [buildMarkdownForParentCategory]);

  const handleCopyFlatCategory = useCallback(async (category: FlatCategoryModel) => {
    try {
      const copied = await writeToClipboard(buildMarkdownForFlatCategory(category));
      if (copied) {
        setCopiedKey(category.key);
      }
    } catch {
      console.error("Failed to copy effect category list");
    }
  }, [buildMarkdownForFlatCategory]);

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
              label: tab.label,
            }))}
            mobileVariant="appGrid"
            mobileClassName="-mt-4"
            listClassName="justify-center"
            ariaLabel="Effect categories"
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
            <IndexPanelGrid columns={nonEmptyColumns.length} gate={columnGate}>
              {nonEmptyColumns.map((column) => (
                <div key={column.index} className={INDEX_PANEL_STACK_CLASS_NAME}>
                  {column.categories.map((category) => (
                    <ParentCategoryCard
                      key={category.key}
                      title={category.displayTitle ?? category.title}
                      icon={category.icon}
                      subcategories={category.subcategories}
                      parentRouteSlug={category.routeSlug}
                      effects={effects}
                      effectHrefPrefix={effectHrefPrefix}
                      expanded={expanded[category.key] ?? true}
                      onExpandedChange={() => handleToggle(category.key)}
                      contentId={`${category.key}-list`}
                      titleHref={getCategoryHref(category.routeSlug)}
                      onIconClick={() => void handleCopyParentCategory(category)}
                      iconActionLabel={`Copy ${category.title} list to clipboard`}
                      iconActiveState={copiedKey === category.key}
                      toggleLabel={`${(expanded[category.key] ?? true) ? "Collapse" : "Expand"} ${category.title} category`}
                    />
                  ))}
                </div>
              ))}
            </IndexPanelGrid>
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
          <IndexPanelGrid columns={nonEmptyColumns.length} gate={columnGate}>
            {nonEmptyColumns.map((column) => (
              <div key={column.index} className={INDEX_PANEL_STACK_CLASS_NAME}>
                {column.categories.map((category) => (
                  <EffectCategoryCard
                    key={category.key}
                    title={category.title}
                    icon={category.icon}
                    effects={category.effects}
                    effectHrefPrefix={effectHrefPrefix}
                    expanded={expanded[category.key] ?? true}
                    onExpandedChange={() => handleToggle(category.key)}
                    contentId={`${category.key}-list`}
                    titleHref={getCategoryHref(category.routeSlug)}
                    onIconClick={() => void handleCopyFlatCategory(category)}
                    iconActionLabel={`Copy ${category.title} list to clipboard`}
                    iconActiveState={copiedKey === category.key}
                    toggleLabel={`${(expanded[category.key] ?? true) ? "Collapse" : "Expand"} ${category.title} category`}
                  />
                ))}
              </div>
            ))}
          </IndexPanelGrid>
        );
      })()}

      {filteredEffects.length === 0 && (
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
    </>
  );
}
