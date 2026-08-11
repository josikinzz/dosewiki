"use client";

import dynamic from "next/dynamic";
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
import type { ContributorDirectory } from "@server/contributorDirectory";
import type { PublicRouteEmptyState } from "@server/next/publicRouteOutcomes";
import type { GalleryReplication } from "@/types/replications";
import { EffectCategoryCard } from "../components/EffectCategoryCard";
import { ParentCategoryCard } from "../components/ParentCategoryCard";
import { SEIIntroSection } from "../components/SEIIntroSection";
// Lazy-loaded: the gallery explorer only renders on the (non-default) "gallery"
// tab, so its chunk shouldn't ship on the default "all" view of /effects.
const ReplicationsGalleryExplorer = dynamic(
  () =>
    import("../gallery/ReplicationsGalleryExplorer").then((m) => ({
      default: m.ReplicationsGalleryExplorer,
    })),
  { ssr: false },
);
import {
  FLAT_CATEGORIES,
  PARENT_CATEGORIES,
  TABS,
  parseTabIdFromHash,
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
  replications?: GalleryReplication[];
  /** Passed through to the gallery so artist headings link to profile pages. */
  contributorDirectory?: ContributorDirectory;
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

/** The tab shown with no fragment in the URL, and the one an emptied fragment returns to. */
const DEFAULT_TAB: TabId = "all";

export function EffectsIndexExplorer({
  effects,
  effectHrefPrefix,
  emptyState,
  replications = [],
  contributorDirectory,
}: EffectsIndexExplorerProps) {
  const [activeTab, setActiveTab] = useState<TabId>(DEFAULT_TAB);
  const isGallery = activeTab === "gallery";

  // The fragment is this page's tab address: /effects#gallery is how the replications
  // landing page links the gallery, and the Effect Index header's Effects dropdown links
  // #sensory / #cognitive / #physical the same way.
  //
  // Listening matters as much as the initial read. A fragment link followed while this page
  // is already mounted does not remount it, and Next resolves hash-only navigations inside
  // its own router state — it rewrites the URL with `history.pushState`, which by
  // specification fires neither `hashchange` nor `popstate`, and it dispatches no event of
  // its own. So the signals worth listening for are the browser's: `hashchange` for a native
  // fragment navigation (what the header's fragment links perform when they are already on
  // this page), and `popstate` for back/forward between fragments.
  //
  // Seeded after mount rather than in the initial state so the prerendered markup and the
  // first client render still agree.
  useEffect(() => {
    const syncTabFromHash = () => {
      const tabFromHash = parseTabIdFromHash(window.location.hash);

      if (tabFromHash) {
        setActiveTab(tabFromHash);
        return;
      }

      // Back to an entry with no fragment: return to the default tab, which is what that
      // entry rendered. Any *other* unrecognised fragment (a deep link to an effect anchor,
      // say) leaves the current tab alone rather than blanking the view.
      if (window.location.hash.replace(/^#/, "").trim() === "") {
        setActiveTab(DEFAULT_TAB);
      }
    };

    syncTabFromHash();
    window.addEventListener("hashchange", syncTabFromHash);
    window.addEventListener("popstate", syncTabFromHash);

    return () => {
      window.removeEventListener("hashchange", syncTabFromHash);
      window.removeEventListener("popstate", syncTabFromHash);
    };
  }, []);

  const columnCount = useResponsiveColumnCount();
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

  return (
    <>
      <div className="mx-auto max-w-3xl md:max-w-4xl">
        <div data-nosnippet>
          <PublicSegmentedTabs
            value={activeTab}
            onValueChange={(value) => setActiveTab(value)}
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

        {!isGallery && (
          <SEIIntroSection
            effectCount={effects.length}
            tabBlob={activeTab !== "all" ? activeTabConfig?.blob : undefined}
          />
        )}
      </div>

      {isGallery && (
        <ReplicationsGalleryExplorer
          replications={replications}
          effects={effects}
          effectHrefPrefix={effectHrefPrefix}
          contributorDirectory={contributorDirectory}
        />
      )}

      {activeTab === "all" && (() => {
        const nonEmptyColumns = Array.from({ length: columnCount })
          .map((_, index) => ({ index, categories: categoriesByColumn.get(index) ?? [] }))
          .filter((column) => column.categories.length > 0);

        if (nonEmptyColumns.length === 0) {
          return null;
        }

        return (
          <IndexPanelGrid columns={nonEmptyColumns.length}>
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
        );
      })()}

      {activeTab !== "all" && !isGallery && (() => {
        const nonEmptyColumns = Array.from({ length: columnCount })
          .map((_, index) => ({ index, categories: flatCategoriesByColumn.get(index) ?? [] }))
          .filter((column) => column.categories.length > 0);

        if (nonEmptyColumns.length === 0) {
          return null;
        }

        return (
          <IndexPanelGrid columns={nonEmptyColumns.length}>
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

      {filteredEffects.length === 0 && !isGallery && (
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
