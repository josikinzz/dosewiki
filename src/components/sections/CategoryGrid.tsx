import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { DosageCategoryGroup } from "../../data/library";
import { IconBadge } from "../common/IconBadge";

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
          lines.push(`- ${drug.name}`);
        });
      });
    } else if (group.drugs.length > 0) {
      lines.push("");
      group.drugs.forEach((drug) => {
        lines.push(`- ${drug.name}`);
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
    } catch (error) {
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
    } catch (error) {
      console.error("Failed to copy category list", error);
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

  const containerClassName = limitColumns
    ? "columns-1 gap-6 space-y-6 sm:columns-2 lg:columns-3 [column-width:320px]"
    : "gap-6 space-y-6 [column-width:320px]";

  return (
    <div className={containerClassName}>
      {visibleGroups.map((group) => {
        const isExpanded = expanded[group.key] ?? defaultExpanded;
        const ChevronIcon = isExpanded ? ChevronDown : ChevronRight;
        const listId = `${group.key}-list`;
        const visibleSections = (group.sections ?? []).filter((section) => section.drugs.length > 0);
        const hasSections = visibleSections.length > 0;
        const listClass = isExpanded ? "mt-4 space-y-1 text-sm text-white/80" : "hidden";
        const sectionsClass = isExpanded ? "mt-4 space-y-[30px] text-sm text-white/80" : "hidden";

        const isCategorySelectable = Boolean(onSelectCategory);

        const titleContent = (
          <>
            <h2 className="hyphenate break-words text-lg font-semibold text-fuchsia-300">{group.name}</h2>
            <p className="hyphenate break-words text-xs uppercase tracking-wide text-white/50">
              {group.total} substance{group.total === 1 ? "" : "s"}
            </p>
          </>
        );

        return (
          <section
            key={group.key}
            className="mb-6 break-inside-avoid rounded-2xl border border-white/10 bg-white/5 p-6 shadow-[0_10px_30px_-12px_rgba(0,0,0,0.35)] backdrop-blur transition hover:border-fuchsia-400/30 hover:shadow-[0_18px_50px_-12px_rgba(0,0,0,0.45)]"
          >
            <header className="flex items-start justify-between gap-4 pb-2 text-white/90">
              <div className="flex flex-1 items-start gap-3">
                <div className="flex flex-col items-center gap-1">
                  <button
                    type="button"
                    onClick={() => void handleCopyGroup(group)}
                    className="rounded-xl p-1.5 text-white/70 transition hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-400"
                    aria-label={`Copy ${group.name} list to clipboard`}
                  >
                    <IconBadge
                      icon={group.icon}
                      className={
                        copiedKey === group.key
                          ? "ring-1 ring-emerald-400/80 bg-emerald-500/10"
                          : ""
                      }
                    />
                  </button>
                  {copiedKey === group.key ? (
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-300">
                      Copied
                    </span>
                  ) : null}
                </div>
                {isCategorySelectable ? (
                  <button
                    type="button"
                    className="flex flex-1 flex-col items-start text-left"
                    onClick={() => handleSelectCategory(group.key)}
                  >
                    {titleContent}
                  </button>
                ) : (
                  <div className="flex flex-1 flex-col items-start text-left">
                    {titleContent}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => handleToggle(group.key)}
                className="rounded-full p-2 text-white/60 transition hover:bg-white/10 hover:text-white/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-400"
                aria-expanded={isExpanded}
                aria-controls={listId}
              >
                <ChevronIcon className="h-4 w-4" aria-hidden="true" focusable="false" />
              </button>
            </header>
            {group.total === 0 ? (
              <p id={listId} className="mt-4 text-sm text-white/70">
                No missing substances right now.
              </p>
            ) : hasSections ? (
              <div id={listId} className={sectionsClass}>
                {visibleSections.map((section, index) => (
                  <div
                    key={section.name ?? `section-${index}`}
                    className={
                      index > 0
                        ? "relative pt-[30px] before:absolute before:left-0 before:right-0 before:top-0 before:h-px before:bg-[linear-gradient(90deg,rgba(255,255,255,0)_0%,rgba(255,255,255,0.1)_20%,rgba(255,255,255,0.1)_80%,rgba(255,255,255,0)_100%)] before:content-['']"
                        : ""
                    }
                  >
                    {section.name && (
                      <p className="hyphenate break-words text-sm font-semibold uppercase tracking-wide text-fuchsia-200">
                        {section.name}
                      </p>
                    )}
                    <ul className="mt-3 space-y-1">
                      {section.drugs.map((drug) => (
                        <li key={drug.slug}>
                          <button
                            type="button"
                            onClick={() => onSelectDrug(drug.slug)}
                            className="hyphenate w-full break-words rounded-xl px-3 py-2 text-left text-white/85 transition hover:bg-white/10 hover:text-fuchsia-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-400"
                          >
                            {drug.name}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ) : (
              <ul id={listId} className={listClass}>
                {group.drugs.map((drug) => (
                  <li key={drug.slug}>
                    <button
                      type="button"
                      onClick={() => onSelectDrug(drug.slug)}
                      className="hyphenate w-full break-words rounded-xl px-3 py-2 text-left text-white/85 transition hover:bg-white/10 hover:text-fuchsia-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-400"
                    >
                      {drug.name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
