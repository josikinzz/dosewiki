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
import { cn } from "@/lib/utils";
import type { ReviewStatus } from "../substance-editor/types";
import {
  REVIEW_FLAGS_UI,
  type ReviewQueueEntry,
  type ReviewQueueGroup,
} from "./reviewQueue";

/** Status colours shared by the picker rows and the command bar's own dot. */
export const STATUS_DOT: Record<ReviewStatus, { className: string; label: string }> = {
  completed: { className: "theme-review-status-completed", label: "Reviewed" },
  in_progress: { className: "theme-review-status-in-progress", label: "Flagged in progress" },
  needed: { className: "theme-review-status-needed", label: "Not reviewed" },
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

/** How many of a bucket's entries are already ticked off. */
function reviewedCount(entries: readonly PickerEntry[]): number {
  return entries.filter((entry) => entry.status === "completed").length;
}

/**
 * The category tree, narrowed to what the search box matches.
 *
 * A query that hits a category or subsection label keeps that whole bucket —
 * typing "tryptamine" should hand over the tryptamines, not nothing.
 */
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

/** Chevron + label + progress row that opens a category or subsection. */
function DisclosureRow({
  expanded,
  onToggle,
  icon,
  label,
  reviewed,
  total,
  depth,
}: {
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
        "theme-focus-ring-inset flex w-full items-center gap-2 rounded-xl py-1.5 pr-2 text-left transition [@media(pointer:coarse)]:min-h-11",
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
      <span className="truncate">{label}</span>
      {total > 0 && reviewed === total ? (
        /* The seal: a finished bucket swaps its counter for an emerald check
           chip, so completed classes read as *done* at a glance — and the
           remaining plain counters quietly ask to be turned green. Derived
           from live counts, so an undo un-seals it. */
        <span
          className="theme-review-seal ml-auto inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-px text-[10px] font-semibold tabular-nums"
          title={`All ${total} reviewed`}
        >
          <Icon icon="lucide:check" size={10} />
          {total}
        </span>
      ) : (
        <span
          className="theme-text-faint ml-auto shrink-0 text-[11px] tabular-nums"
          title={`${reviewed} of ${total} reviewed`}
        >
          {reviewed}/{total}
        </span>
      )}
    </button>
  );
}

/** One selectable article row, indented to its depth in the tree. */
function EntryItem({
  entry,
  isCurrent,
  depth,
  onSelect,
}: {
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
      <span className="truncate font-medium">{entry.name}</span>
      {/* The slug is near-duplicate of the name and search still matches on
          it, so below `sm` its width goes to the name instead. */}
      <span className="theme-text-faint ml-1 hidden shrink-0 text-xs sm:inline">
        {entry.slug}
      </span>
      {REVIEW_FLAGS_UI && entry.flagSummary ? (
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
      {/* Below `sm` the status pills yield to the row's status dot — same
          information, and the name needs the width more. */}
      {entry.status === "completed" ? (
        <EditorStatusPill
          tone="success"
          icon="lucide:badge-check"
          className={cn(
            "hidden sm:inline-flex",
            REVIEW_FLAGS_UI && entry.flagSummary ? undefined : "ml-auto",
          )}
        >
          reviewed
        </EditorStatusPill>
      ) : entry.status === "in_progress" ? (
        <EditorStatusPill
          tone="warning"
          icon="lucide:pencil-line"
          className={cn(
            "hidden sm:inline-flex",
            REVIEW_FLAGS_UI && entry.flagSummary ? undefined : "ml-auto",
          )}
        >
          in progress
        </EditorStatusPill>
      ) : null}
    </CommandItem>
  );
}

/**
 * The article name doubles as a jump-anywhere picker: the full public queue,
 * searchable, in the current order — the same Popover + Command combobox the
 * molecule editor's substance picker uses, so it reads as one system.
 *
 * Grouped, it mirrors the public index: psychoactive categories that expand
 * into their chemical-class subsections. Filtering happens here rather than in
 * cmdk (`shouldFilter={false}`) because a collapsed category renders no items,
 * and cmdk's own filter would treat that as an empty group and hide the row you
 * need to click to open it.
 */
export function ReviewSubstancePicker({
  entries,
  groups,
  grouped,
  current,
  onSelect,
}: {
  entries: readonly PickerEntry[];
  groups: readonly ReviewQueueGroup[];
  grouped: boolean;
  current: PickerEntry | null;
  onSelect: (slug: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  /** Sparse overrides; anything absent falls back to the current article's branch. */
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

  // The category and subsection holding the current article open themselves, so
  // the tree lands where the reviewer already is.
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

  // A search shows its hits outright: honouring collapse state during a query
  // would hide the very matches the reviewer is looking at.
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
        // Every visit starts clean: search cleared, tree back on the current
        // article's branch.
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
              ? `Current article: ${current.name}. Open the substance list`
              : "Open the substance list"
          }
          title="Jump to any article"
          // An explicit min-width is what lets the name actually truncate: a
          // flex item defaults to `min-width: auto` and would otherwise
          // refuse to shrink below its text, pushing the mobile row's other
          // controls off-screen.
          //
          // `sm:w-40 xl:w-48` is fixed, not a cap: the ←/→ buttons sit flush against
          // this trigger, so a content-sized width made → wander with
          // every article name — fatal to flipping quickly by mouse. Long
          // names truncate inside the fixed box. The phone row keeps
          // shrink-to-fit instead: the arrows, verdict, and overflow must all
          // stay on-screen, and a wandering → costs a tap less than it costs
          // a mouse run.
          //
          // `min-w-[6.5rem]` is the name's floor: 6ch of display-font name
          // plus the dot, chevron and padding. Below it the row's icon
          // controls give nothing back, so the trigger stops shrinking and
          // the name keeps its first six letters instead of collapsing to
          // one.
          className="min-w-[6.5rem] max-w-[18rem] gap-2 px-2 py-1 sm:w-40 xl:w-48 [@media(pointer:coarse)]:min-h-11"
        >
          {dot ? (
            <span
              aria-hidden
              title={dot.label}
              className={cn("h-2 w-2 shrink-0 rounded-full", dot.className)}
            />
          ) : null}
          {/* `flex-1 text-left` pins the chevron to the trigger's right edge
              instead of letting a short name float it mid-box. */}
          <span className="theme-text-primary font-display min-w-[6ch] flex-1 truncate text-left text-base font-semibold leading-none">
            {current?.name ?? "—"}
          </span>
          <Icon
            icon="lucide:chevrons-up-down"
            size={14}
            className="theme-text-faint shrink-0"
          />
        </Button>
      </PopoverTrigger>
      {/* Near-full-bleed below `sm`, matching the overflow sheet: the list
          rows carry name, flags and status, and the desktop cap forced the
          truncation this popover exists to avoid. */}
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
                ? "Search by name, slug or class…"
                : "Search by name or slug…"
            }
          />
          {grouped && !needle ? (
            <div className="theme-divider flex items-center justify-between border-b px-3 py-1.5">
              <span className="theme-text-faint text-[11px] uppercase tracking-[0.12em]">
                By category
              </span>
              <Button
                variant="textLink"
                size="auto"
                className="text-[11px]"
                onClick={() => setAll(!allExpanded)}
              >
                {allExpanded ? "Collapse all" : "Expand all"}
              </Button>
            </div>
          ) : null}
          <CommandList className="max-h-[min(26rem,60vh)]">
            {isEmpty ? (
              <div className="theme-text-muted py-6 text-center text-sm">
                No articles found
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
                                />
                                {sectionOpen
                                  ? section.entries.map((entry) => (
                                      <EntryItem
                                        key={entry.slug}
                                        entry={entry}
                                        isCurrent={entry.slug === current?.slug}
                                        depth={2}
                                        onSelect={choose}
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
