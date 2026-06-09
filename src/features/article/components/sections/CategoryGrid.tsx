"use client";

import { useEffect, useMemo, useState, memo, useCallback } from "react";
import type { DosageCategoryGroup } from "@/data/builders/library";
import { IndexCard, IndexCardSection, IndexCardList, IndexCardListItem } from "@/components/common/IndexCard";
import { IndexPanelMasonry, INDEX_PANEL_MASONRY_ITEM_CLASS_NAME } from "@/components/common/IndexPanelLayout";

const formatDrugLabel = (drug: DosageCategoryGroup["drugs"][number]) => drug.name;

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
  const toggleLabel = `${isExpanded ? "Collapse" : "Expand"} ${group.name} category`;
  const listId = `${group.key}-list`;
  const visibleSections = (group.sections ?? []).filter((section) => section.drugs.length > 0);
  const hasSections = visibleSections.length > 0;

  return (
    <IndexCard
      title={group.name}
      icon={group.icon}
      count={group.total}
      expanded={isExpanded}
      onExpandedChange={() => onToggle(group.key)}
      contentId={listId}
      titleHref={isCategorySelectable ? categoryHref : undefined}
      onTitleClick={
        isCategorySelectable && !categoryHref
          ? () => onSelectCategory(group.key)
          : undefined
      }
      onIconClick={() => void onCopy(group)}
      iconActionLabel={`Copy ${group.name} list to clipboard`}
      iconActiveState={isCopied}
      toggleLabel={toggleLabel}
    >
      {group.total === 0 ? (
        <p className="py-2 pl-1 text-sm italic theme-text-faint">
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
    </IndexCard>
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
}: CategoryGridProps) {
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

  return (
    <IndexPanelMasonry>
      {visibleGroups.map((group) => (
        <div key={group.key} className={INDEX_PANEL_MASONRY_ITEM_CLASS_NAME}>
          <CategoryGroupCard
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
        </div>
      ))}
    </IndexPanelMasonry>
  );
}
