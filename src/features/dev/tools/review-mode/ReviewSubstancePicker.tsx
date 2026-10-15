"use client";

import { useMemo, useState } from "react";

import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { getCategoryIcon } from "@/data/config/categoryIcons";
import { EditorStatusPill } from "@/features/dev/components";
import { StatusBadge, type StatusBadgeTone } from "@/components/common/StatusBadge";
import { HighlightedText } from "@/components/common/HighlightedText";
import { TOUCH_HALO } from "@/components/ui/touchTargets";
import { cn } from "@/lib/utils";
import type { ReviewState } from "@/schema/substance/editorial";
import {
  type ReviewQueueEntry,
  type ReviewQueueGroup,
} from "./reviewQueue";
import { REVIEW_STATUS_NAMES } from "./reviewStatusNames";
import { REVIEW_STATE_TONE } from "./reviewDockModel";

export const STATUS_DOT: Record<ReviewState, { className: string; label: string }> = {
  completed: { className: "theme-review-status-completed", label: REVIEW_STATUS_NAMES.completed },
  stale: { className: "theme-review-status-stale", label: REVIEW_STATUS_NAMES.stale },
  in_progress: { className: "theme-review-status-in-progress", label: REVIEW_STATUS_NAMES.in_progress },
  needed: { className: "theme-review-status-needed", label: REVIEW_STATUS_NAMES.needed },
};

type PickerEntry = Pick<ReviewQueueEntry, "slug" | "name" | "status" | "flagSummary">;

const FLAG_BADGE_TONE: Record<NonNullable<PickerEntry["flagSummary"]>["highestSeverity"], StatusBadgeTone> = {
  major: "red",
  minor: "orange",
  note: "blue",
};

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function entryMatches(entry: PickerEntry, query: string): boolean {
  return (
    entry.name.toLowerCase().includes(query) ||
    entry.slug.toLowerCase().includes(query)
  );
}

function reviewedCount(entries: readonly PickerEntry[]): number {
  return entries.filter((entry) => entry.status === "completed").length;
}

function filterGroups(
  groups: readonly ReviewQueueGroup[],
  query: string,
): ReviewQueueGroup[] {
  if (!query) return [...groups];
  return groups.flatMap((group) => {
    const groupHit = group.label.toLowerCase().includes(query);
    const sections = group.sections.flatMap((section) => {
      const keepAll = groupHit || section.label.toLowerCase().includes(query);
      const entries = keepAll
        ? section.entries
        : section.entries.filter((entry) => entryMatches(entry, query));
      return entries.length > 0 ? [{ ...section, entries }] : [];
    });
    const entries = groupHit
      ? group.entries
      : group.entries.filter((entry) => entryMatches(entry, query));
    const count =
      entries.length +
      sections.reduce((total, section) => total + section.entries.length, 0);
    return count > 0 ? [{ ...group, sections, entries, count }] : [];
  });
}

function DisclosureRow({
  expanded,
  onToggle,
  icon,
  label,
  reviewed,
  total,
  depth,
  query = "",
}: {
  query?: string;
  expanded: boolean;
  onToggle: () => void;
  icon?: string;
  label: string;
  reviewed: number;
  total: number;
  depth: 0 | 1;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      className={cn(
        "theme-focus-ring-inset flex w-full items-center gap-2 rounded-control py-1.5 pr-2 text-left transition [@media(pointer:coarse)]:min-h-11",
        "hover:[background:var(--theme-frosted-control-on-panel-bg)]",
        depth === 0
          ? "theme-text-primary pl-2 text-sm font-semibold"
          : "theme-text-secondary pl-6 text-xs font-medium",
      )}
    >
      <Icon
        icon={expanded ? "lucide:chevron-down" : "lucide:chevron-right"}
        size={depth === 0 ? 14 : 12}
        className="theme-text-faint shrink-0"
      />
      {icon ? (
        <Icon icon={icon} size={14} className="theme-text-faint shrink-0" />
      ) : null}
      <HighlightedText text={label} query={query} className="truncate" markClassName="px-0" />
      {total > 0 && reviewed === total ? (
        <span
          className="theme-review-seal ml-auto inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-px text-xs font-semibold tabular-nums"
          title={`All ${total} reviewed`}
        >
          <Icon icon="lucide:check" size={11} aria-hidden />
          {total}
          <span className="sr-only"> of {total} reviewed</span>
        </span>
      ) : (
        <span
          className="theme-text-faint ml-auto shrink-0 text-xs tabular-nums"
          title={`${reviewed} of ${total} reviewed`}
        >
          <span aria-hidden>{reviewed}/{total}</span>
          <span className="sr-only">, {reviewed} of {total} reviewed</span>
        </span>
      )}
    </button>
  );
}

function EntryItem({
  entry,
  isCurrent,
  depth,
  onSelect,
  query = "",
}: {
  query?: string;
  entry: PickerEntry;
  isCurrent: boolean;
  depth: 0 | 1 | 2;
  onSelect: (slug: string) => void;
}) {
  return (
    <CommandItem
      value={entry.slug}
      onSelect={() => onSelect(entry.slug)}
      className={cn(
        depth === 1 && "pl-6",
        depth === 2 && "pl-9",
        isCurrent && "theme-text-primary font-semibold",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "h-2 w-2 shrink-0 rounded-full",
          STATUS_DOT[entry.status].className,
        )}
      />
      <HighlightedText text={entry.name} query={query} className="truncate font-medium" markClassName="px-0" />
      <span className="theme-text-faint ml-1 hidden shrink-0 text-xs sm:inline">
        {entry.slug}
      </span>
      {entry.flagSummary ? (
        <StatusBadge
          tone={FLAG_BADGE_TONE[entry.flagSummary.highestSeverity]}
          className="ml-auto shrink-0 gap-1 whitespace-nowrap tabular-nums"
          title={`${entry.flagSummary.count} Review ${entry.flagSummary.count === 1 ? "Flag" : "Flags"}; highest severity ${entry.flagSummary.highestSeverity}`}
        >
          <Icon icon="lucide:flag" size={10} className="sm:hidden" />
          {entry.flagSummary.count}
          <span className="hidden sm:inline">
            {entry.flagSummary.count === 1 ? "flag" : "flags"}
          </span>
        </StatusBadge>
      ) : null}
      {entry.status !== "needed" ? (
        <EditorStatusPill
          inline
          tone={REVIEW_STATE_TONE[entry.status]}
          className={cn("hidden sm:inline-flex", entry.flagSummary ? undefined : "ml-auto")}
        >
          {REVIEW_STATUS_NAMES[entry.status]}
        </EditorStatusPill>
      ) : null}
    </CommandItem>
  );
}

export function ReviewSubstancePicker({
  entries,
  groups,
  grouped,
  current,
  onSelect,
  open: controlledOpen,
  onOpenChange,
}: {
  entries: readonly PickerEntry[];
  groups: readonly ReviewQueueGroup[];
  grouped: boolean;
  current: PickerEntry | null;
  onSelect: (slug: string) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [ownOpen, setOwnOpen] = useState(false);
  const open = controlledOpen ?? ownOpen;
  const setOpen = (next: boolean) => {
    setOwnOpen(next);
    onOpenChange?.(next);
  };
  const [query, setQuery] = useState("");
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  const dot = current ? STATUS_DOT[current.status] : null;

  const needle = normalize(query);
  const visibleGroups = useMemo(
    () => (grouped ? filterGroups(groups, needle) : []),
    [grouped, groups, needle],
  );
  const visibleEntries = useMemo(
    () =>
      grouped || !needle
        ? entries
        : entries.filter((entry) => entryMatches(entry, needle)),
    [grouped, entries, needle],
  );

  const currentPath = useMemo(() => {
    const path = new Set<string>();
    if (!current) return path;
    for (const group of groups) {
      if (group.entries.some((entry) => entry.slug === current.slug)) {
        path.add(group.key);
      }
      for (const section of group.sections) {
        if (section.entries.some((entry) => entry.slug === current.slug)) {
          path.add(group.key);
          path.add(`${group.key}/${section.key}`);
        }
      }
    }
    return path;
  }, [current, groups]);

  const isExpanded = (key: string) =>
    needle !== "" || (toggled[key] ?? currentPath.has(key));
  const toggle = (key: string) =>
    setToggled((previous) => ({
      ...previous,
      [key]: !(previous[key] ?? currentPath.has(key)),
    }));

  const allExpanded =
    visibleGroups.length > 0 &&
    visibleGroups.every((group) => isExpanded(group.key));
  const setAll = (expanded: boolean) =>
    setToggled(
      Object.fromEntries(
        groups.flatMap((group) => [
          [group.key, expanded] as const,
          ...group.sections.map(
            (section) => [`${group.key}/${section.key}`, expanded] as const,
          ),
        ]),
      ),
    );

  const choose = (slug: string) => {
    onSelect(slug);
    setOpen(false);
  };

  const isEmpty = grouped ? visibleGroups.length === 0 : visibleEntries.length === 0;

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setQuery("");
          setToggled({});
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="auto"
          role="combobox"
          aria-expanded={open}
          aria-label={
            current
              ? `Current article: ${current.name}, ${STATUS_DOT[current.status].label}. Open the article list`
              : "Open the article list"
          }
          title="Find any article (/)"
          aria-keyshortcuts="/"
          className="min-w-[6.5rem] max-w-[18rem] gap-2 px-2 py-1 sm:w-40 xl:w-48 [@media(pointer:coarse)]:min-h-11"
        >
          {dot ? (
            <span
              aria-hidden
              title={dot.label}
              className={cn("h-2 w-2 shrink-0 rounded-full", dot.className)}
            />
          ) : null}
          <span className="theme-text-primary font-display min-w-[6ch] flex-1 truncate text-left text-base font-semibold leading-none">
            {current?.name ?? "–"}
          </span>
          <Icon
            icon="lucide:chevrons-up-down"
            size={14}
            className="theme-text-faint shrink-0"
          />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[calc(100vw-1rem)] p-0 sm:w-[26rem]"
        align="start"
        collisionPadding={8}
      >
        <Command shouldFilter={false}>
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder={
              grouped
                ? "Search by name, slug or class"
                : "Search by name or slug"
            }
          />
          {grouped && !needle ? (
            <div className="theme-divider flex items-center justify-between border-b px-3 py-1.5">
              <span className="type-meta-label theme-text-muted">
                By category
              </span>
              <Button
                variant="textLink"
                size="auto"
                className={cn("text-xs", TOUCH_HALO)}
                onClick={() => setAll(!allExpanded)}
              >
                {allExpanded ? "Collapse all" : "Expand all"}
              </Button>
            </div>
          ) : null}
          <CommandList className="max-h-[min(26rem,60vh)]">
            {isEmpty ? (
              <div className="theme-text-muted space-y-2 px-4 py-6 text-center text-sm">
                <p>{needle ? <>No article matches “{query.trim()}”.</> : "No articles in this view."}</p>
                {needle ? (
                  <Button variant="link" size="quiet" className="h-auto p-0" onClick={() => setQuery("")}>
                    Clear the search
                  </Button>
                ) : null}
              </div>
            ) : null}
            {grouped
              ? visibleGroups.map((group) => {
                  const groupOpen = isExpanded(group.key);
                  const groupEntries = [
                    ...group.sections.flatMap((section) => section.entries),
                    ...group.entries,
                  ];
                  return (
                    <div key={group.key} className="p-1">
                      <DisclosureRow
                        expanded={groupOpen}
                        onToggle={() => toggle(group.key)}
                        icon={getCategoryIcon(group.iconKey ?? group.key)}
                        label={group.label}
                        reviewed={reviewedCount(groupEntries)}
                        total={group.count}
                        depth={0}
                        query={query.trim()}
                      />
                      {groupOpen
                        ? group.sections.map((section) => {
                            const sectionKey = `${group.key}/${section.key}`;
                            const sectionOpen = isExpanded(sectionKey);
                            return (
                              <div key={sectionKey}>
                                <DisclosureRow
                                  expanded={sectionOpen}
                                  onToggle={() => toggle(sectionKey)}
                                  label={section.label}
                                  reviewed={reviewedCount(section.entries)}
                                  total={section.entries.length}
                                  depth={1}
                                  query={query.trim()}
                                />
                                {sectionOpen
                                  ? section.entries.map((entry) => (
                                      <EntryItem
                                        key={entry.slug}
                                        entry={entry}
                                        isCurrent={entry.slug === current?.slug}
                                        depth={2}
                                        onSelect={choose}
                                        query={query.trim()}
                                      />
                                    ))
                                  : null}
                              </div>
                            );
                          })
                        : null}
                      {groupOpen
                        ? group.entries.map((entry) => (
                            <EntryItem
                              key={entry.slug}
                              entry={entry}
                              isCurrent={entry.slug === current?.slug}
                              depth={1}
                              onSelect={choose}
                                        query={query.trim()}
                            />
                          ))
                        : null}
                    </div>
                  );
                })
              : (
                  <div className="p-1">
                    {visibleEntries.map((entry) => (
                      <EntryItem
                        key={entry.slug}
                        entry={entry}
                        isCurrent={entry.slug === current?.slug}
                        depth={0}
                        onSelect={choose}
                                        query={query.trim()}
                      />
                    ))}
                  </div>
                )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
