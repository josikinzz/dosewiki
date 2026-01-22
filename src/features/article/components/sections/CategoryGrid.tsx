import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/common/Icon";
import type { DosageCategoryGroup } from "@/data/builders/library";
import { Button } from "@/components/ui/button";
import { useResponsiveColumnCount } from "@/hooks/useResponsiveColumnCount";
import { IndexCardSection, IndexCardList, IndexCardListItem } from "@/components/common/IndexCard";

// Note: CategoryGrid maintains its own header implementation due to unique requirements:
// - Copy-to-clipboard on icon click
// - Selectable category titles (onSelectCategory)
// - External expand/collapse state management
// Content rendering uses shared IndexCard components for consistency.

interface CategoryGridProps {
  groups: DosageCategoryGroup[];
  onSelectDrug: (slug: string) => void;
  onSelectCategory?: (categoryKey: string) => void;
  defaultExpanded?: boolean;
  hideEmptyGroups?: boolean;
  limitColumns?: boolean;
}

export function CategoryGrid({
  groups,
  onSelectDrug,
  onSelectCategory,
  defaultExpanded = true,
  hideEmptyGroups = false,
  limitColumns = false,
}: CategoryGridProps) {
  const columnCount = useResponsiveColumnCount({ limitColumns });

  const formatDrugLabel = (drug: DosageCategoryGroup["drugs"][number]) =>
    drug.name;

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

  const handleCopyGroup = async (group: DosageCategoryGroup) => {
    try {
      const markdown = buildMarkdownForGroup(group);
      const copied = await writeToClipboard(markdown);
      if (copied) {
        setCopiedKey(group.key);
      }
    } catch {
      console.error("Failed to copy category list");
    }
  };

  const handleToggle = (key: string) => {
    setExpanded((previous) => ({
      ...previous,
      [key]: !(previous[key] ?? defaultExpanded),
    }));
  };

  const handleSelectCategory = (key: string) => {
    if (onSelectCategory) {
      onSelectCategory(key);
    }
  };

  const renderCard = (group: DosageCategoryGroup) => {
    const isExpanded = expanded[group.key] ?? defaultExpanded;
    const chevronIcon = isExpanded ? "lucide:chevron-up" : "lucide:chevron-down";
    const listId = `${group.key}-list`;
    const visibleSections = (group.sections ?? []).filter((section) => section.drugs.length > 0);
    const hasSections = visibleSections.length > 0;

    const isCategorySelectable = Boolean(onSelectCategory);

    return (
      <section
        key={group.key}
        className="group w-full rounded-[20px] border border-white/10 bg-white/[0.02] p-5 shadow-lg shadow-black/20 backdrop-blur-md backdrop-safe transition-all duration-300 hover:bg-white/[0.04] hover:border-fuchsia-500/20 hover:shadow-xl hover:shadow-fuchsia-500/5 hover:-translate-y-0.5"
      >
        {/* Header - matching effects index structure */}
        <header className="flex items-start gap-4 pb-2">
          <button
            type="button"
            onClick={() => void handleCopyGroup(group)}
            aria-label={`Copy ${group.name} list to clipboard`}
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/5 ring-1 ring-white/10 shadow-inner shadow-black/20 outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-400 transition duration-300 hover:bg-white/10 hover:ring-fuchsia-400/30 hover:shadow-fuchsia-500/10 hover:scale-105`}
          >
            <Icon
              icon={copiedKey === group.key ? "lucide:check" : group.icon}
              size={20}
              className={copiedKey === group.key ? "text-emerald-400" : "text-fuchsia-300/80 transition-colors group-hover:text-fuchsia-300"}
            />
          </button>

          <div className="flex-1 min-w-0 pt-1">
            {isCategorySelectable ? (
              <Button
                variant="categoryHeader"
                size="auto"
                onClick={() => handleSelectCategory(group.key)}
                className="h-auto p-0 hover:no-underline"
              >
                <h2 className="text-lg font-bold tracking-tight text-fuchsia-300 group-hover:text-fuchsia-200 transition-colors duration-300 text-left">
                  {group.name}
                  <span className="ml-2 text-[0.9em] font-medium text-white/40 group-hover:text-white/60 transition-colors">({group.total})</span>
                </h2>
              </Button>
            ) : (
              <h2 className="text-lg font-bold tracking-tight text-fuchsia-300 group-hover:text-fuchsia-200 transition-colors duration-300">
                {group.name}
                <span className="ml-2 text-[0.9em] font-medium text-white/40 group-hover:text-white/60 transition-colors">({group.total})</span>
              </h2>
            )}
          </div>

          <button
            type="button"
            onClick={() => handleToggle(group.key)}
            aria-expanded={isExpanded}
            aria-controls={listId}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-white/40 transition hover:bg-white/10 hover:text-white"
          >
            <Icon icon={chevronIcon} size={16} />
          </button>
        </header>

        {/* Content */}
        <div
          id={listId}
          className={`grid transition-all duration-300 ease-in-out ${isExpanded ? "grid-rows-[1fr] opacity-100 mt-2" : "grid-rows-[0fr] opacity-0 mt-0"
            }`}
        >
          <div className="overflow-hidden">
            {group.total === 0 ? (
              <p className="py-2 text-sm text-white/40 italic pl-1">
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
                          label={formatDrugLabel(drug)}
                          onClick={() => onSelectDrug(drug.slug)}
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
                      label={formatDrugLabel(drug)}
                      onClick={() => onSelectDrug(drug.slug)}
                    />
                  ))}
                </IndexCardList>
              </div>
            )}
          </div>
        </div>
      </section>
    );
  };

  // Filter to only columns that have content
  const nonEmptyColumns = Array.from({ length: columnCount })
    .map((_, i) => ({ index: i, groups: columnGroups.get(i) ?? [] }))
    .filter(col => col.groups.length > 0);

  return (
    <div
      className="mx-auto grid w-full max-w-[1600px] gap-4 px-4"
      style={{
        gridTemplateColumns: `repeat(${nonEmptyColumns.length}, minmax(0, 1fr))`
      }}
    >
      {nonEmptyColumns.map((col) => (
        <div key={col.index} className="flex flex-col gap-4">
          {col.groups.map((group) => renderCard(group))}
        </div>
      ))}
    </div>
  );
}
