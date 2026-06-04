"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, memo, useCallback, type CSSProperties } from "react";
import { Icon } from "@/components/common/Icon";
import type { DosageCategoryGroup } from "@/data/builders/library";
import { Button } from "@/components/ui/button";
import { InteractiveSurface } from "@/components/ui/surface";
import { useResponsiveColumnCount } from "@/hooks/useResponsiveColumnCount";
import { IndexCardSection, IndexCardList, IndexCardListItem } from "@/components/common/IndexCard";

const formatDrugLabel = (drug: DosageCategoryGroup["drugs"][number]) => drug.name;

// Note: CategoryGrid maintains its own header implementation due to unique requirements:
// - Copy-to-clipboard on icon click
// - Selectable category titles (onSelectCategory)
// - External expand/collapse state management
// Content rendering uses shared IndexCard components for consistency.

// Memoized card component to prevent unnecessary re-renders
interface CategoryGroupCardProps {
  group: DosageCategoryGroup;
  isExpanded: boolean;
  isCopied: boolean;
  isCategorySelectable: boolean;
  categoryHref?: string;
  onToggle: (key: string) => void;
  onCopy: (group: DosageCategoryGroup) => void;
  onSelectCategory: (key: string) => void;
  onSelectDrug?: (slug: string) => void;
  getDrugHref: (slug: string) => string | undefined;
  formatLabel: (drug: DosageCategoryGroup["drugs"][number]) => string;
}

const CategoryGroupCard = memo(function CategoryGroupCard({
  group,
  isExpanded,
  isCopied,
  isCategorySelectable,
  categoryHref,
  onToggle,
  onCopy,
  onSelectCategory,
  onSelectDrug,
  getDrugHref,
  formatLabel,
}: CategoryGroupCardProps) {
  const chevronIcon = isExpanded ? "lucide:chevron-up" : "lucide:chevron-down";
  const toggleLabel = `${isExpanded ? "Collapse" : "Expand"} ${group.name} category`;
  const listId = `${group.key}-list`;
  const visibleSections = (group.sections ?? []).filter((section) => section.drugs.length > 0);
  const hasSections = visibleSections.length > 0;

  return (
    <InteractiveSurface
      asChild
      variant="index"
      padding="md"
      radius="index"
      className="group w-full transition-all duration-300"
    >
      <section>
        {/* Header */}
        <header className="flex items-start gap-4 pb-2">
          <button
            type="button"
            onClick={() => void onCopy(group)}
            aria-label={`Copy ${group.name} list to clipboard`}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-dose-surface-muted ring-1 ring-white/10 outline-none transition-colors duration-200 hover:bg-dose-surface-strong hover:ring-fuchsia-400/20 focus-visible:ring-2 focus-visible:ring-fuchsia-400"
          >
            <Icon
              icon={isCopied ? "lucide:check" : group.icon}
              size={20}
              className={isCopied ? "text-emerald-400" : "text-dose-accent-muted transition-colors group-hover:text-dose-accent-soft"}
            />
          </button>

          <div className="flex-1 min-w-0 pt-1">
            {isCategorySelectable ? (
              categoryHref ? (
                <Button
                  variant="ghost"
                  size="auto"
                  asChild
                  className="flex h-auto flex-1 flex-row items-baseline gap-4 whitespace-normal p-0 text-left hover:bg-transparent hover:no-underline sm:flex-col sm:items-start sm:gap-0"
                >
                  <Link href={categoryHref}>
                    <h2 className="theme-text-primary text-left text-lg font-bold tracking-tight transition-colors duration-200 group-hover:text-dose-accent-soft">
                      {group.name}
                      <span className="ml-2 text-[0.9em] font-medium text-dose-text-faint group-hover:text-dose-text-muted transition-colors">({group.total})</span>
                    </h2>
                  </Link>
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="auto"
                  onClick={() => onSelectCategory(group.key)}
                  className="flex h-auto flex-1 flex-row items-baseline gap-4 whitespace-normal p-0 text-left hover:bg-transparent hover:no-underline sm:flex-col sm:items-start sm:gap-0"
                >
                  <h2 className="theme-text-primary text-left text-lg font-bold tracking-tight transition-colors duration-200 group-hover:text-dose-accent-soft">
                    {group.name}
                    <span className="ml-2 text-[0.9em] font-medium text-dose-text-faint group-hover:text-dose-text-muted transition-colors">({group.total})</span>
                  </h2>
                </Button>
              )
            ) : (
              <h2 className="theme-text-primary text-lg font-bold tracking-tight transition-colors duration-200 group-hover:text-dose-accent-soft">
                {group.name}
                <span className="ml-2 text-[0.9em] font-medium text-dose-text-faint group-hover:text-dose-text-muted transition-colors">({group.total})</span>
              </h2>
            )}
          </div>

          <button
            type="button"
            onClick={() => onToggle(group.key)}
            aria-label={toggleLabel}
            aria-expanded={isExpanded}
            aria-controls={listId}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-dose-text-faint outline-none transition hover:bg-dose-surface-muted hover:text-dose-text focus-visible:ring-2 focus-visible:ring-fuchsia-400"
          >
            <Icon icon={chevronIcon} size={16} />
          </button>
        </header>

        {/* Content */}
        <div
          id={listId}
          className={`grid transition-all duration-300 ease-in-out ${isExpanded ? "grid-rows-[1fr] opacity-100 mt-2" : "grid-rows-[0fr] opacity-0 mt-0"}`}
        >
          <div className="overflow-hidden">
            {group.total === 0 ? (
              <p className="py-2 text-sm theme-text-faint italic pl-1">
                No missing substances right now.
              </p>
            ) : hasSections ? (
              <div className="space-y-6 pt-1">
                {visibleSections.map((section, index) => (
                  <IndexCardSection
                    key={section.name ?? `section-${index}`}
                    title={section.name}
                    count={section.drugs.length}
                    showDivider={index > 0}
                  >
                    <IndexCardList>
                      {section.drugs.map((drug) => (
                        <IndexCardListItem
                          key={drug.slug}
                          label={formatLabel(drug)}
                          href={getDrugHref(drug.slug)}
                          slug={drug.slug}
                          onSelect={onSelectDrug}
                        />
                      ))}
                    </IndexCardList>
                  </IndexCardSection>
                ))}
              </div>
            ) : (
              <div className="pt-1">
                <IndexCardList>
                  {group.drugs.map((drug) => (
                    <IndexCardListItem
                      key={drug.slug}
                      label={formatLabel(drug)}
                      href={getDrugHref(drug.slug)}
                      slug={drug.slug}
                      onSelect={onSelectDrug}
                    />
                  ))}
                </IndexCardList>
              </div>
            )}
          </div>
        </div>
      </section>
    </InteractiveSurface>
  );
});

interface CategoryGridProps {
  groups: DosageCategoryGroup[];
  onSelectDrug?: (slug: string) => void;
  onSelectCategory?: (categoryKey: string) => void;
  drugHrefPrefix?: string;
  categoryHrefPrefix?: string;
  defaultExpanded?: boolean;
  hideEmptyGroups?: boolean;
  limitColumns?: boolean;
  maxColumns?: number;
}

export function CategoryGrid({
  groups,
  onSelectDrug,
  onSelectCategory,
  drugHrefPrefix,
  categoryHrefPrefix,
  defaultExpanded = true,
  hideEmptyGroups = false,
  limitColumns = false,
  maxColumns,
}: CategoryGridProps) {
  const columnCount = useResponsiveColumnCount({ limitColumns, maxColumns });

  const visibleGroups = useMemo(() => {
    if (!hideEmptyGroups) {
      return groups;
    }
    return groups.filter((group) => {
      if (group.total > 0) {
        return true;
      }
      const sections = group.sections ?? [];
      return sections.some((section) => section.drugs.length > 0);
    });
  }, [groups, hideEmptyGroups]);

  // Group categories by their assigned column, using round-robin as fallback
  const columnGroups = useMemo(() => {
    const columns: Map<number, DosageCategoryGroup[]> = new Map();

    // Initialize all columns
    for (let i = 0; i < columnCount; i++) {
      columns.set(i, []);
    }

    visibleGroups.forEach((group, index) => {
      // Check new columns object first, fall back to legacy column, then round-robin
      let effectiveColumn: number;
      if (group.columns && group.columns[String(columnCount)] !== undefined) {
        effectiveColumn = group.columns[String(columnCount)] % columnCount;
      } else if (group.column !== undefined) {
        effectiveColumn = group.column % columnCount;
      } else {
        effectiveColumn = index % columnCount;
      }
      columns.get(effectiveColumn)?.push(group);
    });

    return columns;
  }, [visibleGroups, columnCount]);

  const groupKeys = useMemo(
    () => visibleGroups.map((group) => group.key),
    [visibleGroups],
  );
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    setExpanded((previous) => {
      const nextState: Record<string, boolean> = {};
      groupKeys.forEach((key) => {
        nextState[key] = previous[key] ?? defaultExpanded;
      });
      return nextState;
    });
  }, [groupKeys, defaultExpanded]);

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

  const buildMarkdownForGroup = (group: DosageCategoryGroup) => {
    const lines: string[] = [`### ${group.name}`];
    const sections = (group.sections ?? []).filter(
      (section) => section.drugs.length > 0,
    );

    if (sections.length > 0) {
      sections.forEach((section) => {
        lines.push("");
        if (section.name) {
          lines.push(`#### ${section.name}`);
        }
        section.drugs.forEach((drug) => {
          lines.push(`- ${formatDrugLabel(drug)}`);
        });
      });
    } else if (group.drugs.length > 0) {
      lines.push("");
      group.drugs.forEach((drug) => {
        lines.push(`- ${formatDrugLabel(drug)}`);
      });
    } else {
      lines.push("", "- _No substances_");
    }

    return lines.join("\n");
  };

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

  const handleCopyGroup = useCallback(async (group: DosageCategoryGroup) => {
    try {
      const markdown = buildMarkdownForGroup(group);
      const copied = await writeToClipboard(markdown);
      if (copied) {
        setCopiedKey(group.key);
      }
    } catch {
      console.error("Failed to copy category list");
    }
  }, []);

  const handleToggle = useCallback((key: string) => {
    setExpanded((previous) => ({
      ...previous,
      [key]: !(previous[key] ?? defaultExpanded),
    }));
  }, [defaultExpanded]);

  const handleSelectCategory = useCallback((key: string) => {
    onSelectCategory?.(key);
  }, [onSelectCategory]);

  const getDrugHref = useCallback(
    (slug: string) => drugHrefPrefix ? `${drugHrefPrefix}${slug}` : undefined,
    [drugHrefPrefix],
  );

  const getCategoryHref = useCallback(
    (key: string) => categoryHrefPrefix ? `${categoryHrefPrefix}${key}` : undefined,
    [categoryHrefPrefix],
  );

  // Stable reference for format function
  const memoizedFormatDrugLabel = useCallback(
    (drug: DosageCategoryGroup["drugs"][number]) => formatDrugLabel(drug),
    []
  );

  const isCategorySelectable = Boolean(onSelectCategory || categoryHrefPrefix);

  // Filter to only columns that have content
  const nonEmptyColumns = Array.from({ length: columnCount })
    .map((_, i) => ({ index: i, groups: columnGroups.get(i) ?? [] }))
    .filter(col => col.groups.length > 0);
  const gridStyle = {
    "--category-grid-columns": Math.max(nonEmptyColumns.length, 1),
  } as CSSProperties;

  return (
    <div
      className="mx-auto grid w-full max-w-[1600px] grid-cols-[repeat(var(--category-grid-columns),minmax(0,1fr))] gap-5 px-4 max-[639px]:grid-cols-1 lg:gap-6"
      style={gridStyle}
    >
      {nonEmptyColumns.map((col) => (
        <div key={col.index} className="flex flex-col gap-5 lg:gap-6">
          {col.groups.map((group) => (
            <CategoryGroupCard
              key={group.key}
              group={group}
              isExpanded={expanded[group.key] ?? defaultExpanded}
              isCopied={copiedKey === group.key}
              isCategorySelectable={isCategorySelectable}
              categoryHref={getCategoryHref(group.key)}
              onToggle={handleToggle}
              onCopy={handleCopyGroup}
              onSelectCategory={handleSelectCategory}
              onSelectDrug={onSelectDrug}
              getDrugHref={getDrugHref}
              formatLabel={memoizedFormatDrugLabel}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
