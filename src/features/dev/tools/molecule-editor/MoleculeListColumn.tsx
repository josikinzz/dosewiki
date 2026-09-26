"use client";

/**
 * The Molecules list column: which kind of structure (substances, generic
 * classes, class templates), what state each drawing is in, a search with
 * its `/` key, and the records as link rows grouped the way the old picker
 * grouped them (publicly listed first, then by psychoactive class). The open
 * row carries "Editing" and an unsaved dot. Sticky from `lg`, a capped scroll
 * well so the pane beside it keeps the canvas in view.
 */
import { forwardRef, useMemo, type RefObject } from "react";

import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { EditorStatusPill, LoadErrorState } from "@/features/dev/components";
import { ChoiceGrid, SearchField } from "@/features/dev/tools/glossary/workbenchParts";
import { LINK_LIST_CLASS, OnwardLink, RelativeDay, RowSkeletons } from "@/features/dev/tools/home/homeParts";
import { cn } from "@/lib/utils";
import { viewToPath } from "@/utils/routing";
import type { EditorMode } from "./moleculeEditorTypes";
import {
  countMoleculeFilters,
  countNoun,
  depictionLabel,
  FILTER_LABEL,
  MODE_NOUN,
  visibleMoleculeGroups,
  type DepictionState,
  type MoleculeListFilter,
  type MoleculeListRow,
} from "./moleculeListModel";

const MODE_CHOICES: ReadonlyArray<{ value: EditorMode; label: string; short: string }> = [
  { value: "substances", label: "Substances", short: "Substances" },
  { value: "classes", label: "Generic classes", short: "Classes" },
  { value: "templates", label: "Class templates", short: "Templates" },
];

/** The tone a row's state reads in: a missing drawing warns, a baseline is neutral, a finished one is quiet. */
const STATE_TONE: Record<DepictionState, "warning" | "neutral" | "success" | "info"> = {
  none: "warning",
  seeded: "neutral",
  template: "info",
  editor: "success",
  saved: "success",
};

export type MoleculeListColumnProps = {
  mode: EditorMode;
  onModeChange: (mode: string) => void;
  /** How many records each mode lists; null while unknown. */
  modeCounts: Record<EditorMode, number | null>;
  rows: MoleculeListRow[] | null;
  error: string | null;
  onRetry: () => void;
  loadTimedOut: boolean;
  selected: string | null;
  dirty: boolean;
  onSelect: (slug: string) => void;
  filter: MoleculeListFilter;
  onFilterChange: (filter: MoleculeListFilter) => void;
  query: string;
  onQueryChange: (query: string) => void;
  searchRef: RefObject<HTMLInputElement | null>;
};

export const MoleculeListColumn = forwardRef<HTMLElement, MoleculeListColumnProps>(function MoleculeListColumn(
  {
    mode,
    onModeChange,
    modeCounts,
    rows,
    error,
    onRetry,
    loadTimedOut,
    selected,
    dirty,
    onSelect,
    filter,
    onFilterChange,
    query,
    onQueryChange,
    searchRef,
  },
  ref,
) {
  const counts = useMemo(() => (rows ? countMoleculeFilters(rows) : null), [rows]);
  const groups = useMemo(() => (rows ? visibleMoleculeGroups(rows, filter, query) : []), [rows, filter, query]);
  const shown = groups.reduce((sum, group) => sum + group.items.length, 0);
  const openRow = rows?.find((row) => row.slug === selected);
  const noun = MODE_NOUN[mode];
  const labels = FILTER_LABEL[mode];

  return (
    <section
      ref={ref}
      aria-label="Structures"
      className="scroll-mt-24 space-y-4 lg:sticky lg:top-24"
    >
      <ChoiceGrid
        label="Kind of structure"
        columns={3}
        value={mode}
        onChange={onModeChange}
        choices={MODE_CHOICES.map((choice) => ({ ...choice, count: modeCounts[choice.value] }))}
      />

      <div className="space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="type-meta-label theme-text-muted">{mode === "templates" ? "Class templates" : mode === "classes" ? "Generic classes" : "Substances"}</h3>
          <p className="theme-text-faint text-xs tabular-nums" aria-live="polite">
            {rows && counts
              ? query || filter !== "all"
                ? `${shown} of ${countNoun(counts.all, mode)}`
                : `${countNoun(counts.all, mode)}, ${counts.edited} ${mode === "substances" ? "edited" : "saved"}`
              : null}
          </p>
        </div>
        <ChoiceGrid
          label="Show"
          columns={3}
          value={filter}
          onChange={onFilterChange}
          disabled={!rows}
          choices={(["all", "todo", "edited"] as const).map((value) => ({
            value,
            label: labels[value],
            count: counts ? counts[value] : null,
          }))}
        />
        <SearchField
          ref={searchRef}
          label={`Find a ${noun.one}`}
          value={query}
          onChange={onQueryChange}
          placeholder={mode === "substances" ? "Name or address" : "Name or key"}
        />
        {mode === "substances" && filter === "todo" ? (
          <p className="theme-text-faint text-xs">
            To do lists substances with no depiction and those still on the automatic layout.
          </p>
        ) : null}
      </div>

      {error ? (
        <LoadErrorState what={`the ${noun.many}`} message={error} onRetry={onRetry} />
      ) : !rows ? (
        loadTimedOut ? (
          <div className="space-y-2">
            <p role="status" className="theme-text-muted text-sm">
              The {noun.many} are taking longer than usual to load.
            </p>
            <Button type="button" variant="outline" size="sm" onClick={onRetry}>
              <Icon icon="lucide:rotate-cw" size={14} />
              Try again
            </Button>
          </div>
        ) : (
          <RowSkeletons rows={6} label={noun.many} />
        )
      ) : rows.length === 0 ? (
        <div className="space-y-2">
          <p className="theme-text-muted text-sm">
            {mode === "substances"
              ? "No substances yet. A depiction starts from an article's SMILES, so add the substance first."
              : `No ${noun.many} to list.`}
          </p>
          {mode === "substances" ? (
            <OnwardLink href={viewToPath({ type: "dev", tab: "articles" })}>Open Substances</OnwardLink>
          ) : null}
        </div>
      ) : shown === 0 ? (
        <div className="space-y-2">
          <p className="theme-text-muted text-sm">
            {query
              ? `No ${noun.one} matches “${query}”${filter !== "all" ? ` under ${labels[filter]}` : ""}.`
              : `Nothing under ${labels[filter]}.`}
          </p>
          <div className="flex flex-wrap gap-2">
            {query ? (
              <Button type="button" variant="link" size="quiet" onClick={() => onQueryChange("")}>
                Clear the search
              </Button>
            ) : null}
            {filter !== "all" ? (
              <Button type="button" variant="link" size="quiet" onClick={() => onFilterChange("all")}>
                Show all
              </Button>
            ) : null}
          </div>
        </div>
      ) : (
        <div
          className="-mx-1 overflow-y-auto overscroll-contain px-1 max-lg:max-h-[min(60dvh,32rem)] lg:max-h-[min(calc(100dvh-24rem),720px)]"
          tabIndex={-1}
        >
          {groups.map((group) => (
            <div key={group.key || "all"} className="pb-2">
              {group.heading ? (
                <p className="type-meta-label theme-text-faint pb-1 pt-2">
                  {group.heading}
                </p>
              ) : null}
              <ul className={LINK_LIST_CLASS}>
                {group.items.map((row) => (
                  <li key={row.slug}>
                    <MoleculeRow
                      row={row}
                      mode={mode}
                      isOpen={row.slug === selected}
                      isDirty={row.slug === selected && dirty}
                      onOpen={() => onSelect(row.slug)}
                    />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {selected && rows && !openRow && !error ? (
        <p role="status" className="theme-text-muted text-xs">
          “{selected}” is not in this list. It may have been renamed or removed.
        </p>
      ) : selected && openRow && (query || filter !== "all") && !groups.some((group) => group.items.includes(openRow)) ? (
        <p className="theme-text-muted text-xs">
          Your {query ? "search" : "filter"} hides {openRow.title} from the list.{" "}
          <Button
            type="button"
            variant="link"
            size="quiet"
            className="h-auto p-0 text-xs"
            onClick={() => {
              onQueryChange("");
              onFilterChange("all");
            }}
          >
            Show it
          </Button>
        </p>
      ) : null}
    </section>
  );
});

function MoleculeRow({
  row,
  mode,
  isOpen,
  isDirty,
  onOpen,
}: {
  row: MoleculeListRow;
  mode: EditorMode;
  isOpen: boolean;
  isDirty: boolean;
  onOpen: () => void;
}) {
  const updated =
    row.updatedAt != null && row.depiction !== "none"
      ? new Date(typeof row.updatedAt === "number" ? row.updatedAt : Date.parse(row.updatedAt))
      : null;
  return (
    <button
      type="button"
      aria-current={isOpen ? "true" : undefined}
      onClick={onOpen}
      className={cn(
        "theme-dev-link-row group flex min-h-11 w-full items-center gap-3 rounded-control px-2.5 py-2 text-left text-sm transition-colors motion-reduce:transition-none",
        isOpen && "theme-dev-link-lead",
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
          <span className="theme-text-primary break-words font-medium">{row.title}</span>
          <span className="theme-text-faint truncate font-mono text-xs">
            <span className="sr-only">, </span>
            {row.slug}
          </span>
        </span>
        <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          <span className="sr-only">, </span>
          <EditorStatusPill inline tone={STATE_TONE[row.depiction]}>
            {depictionLabel(row.depiction, mode)}
          </EditorStatusPill>
          {row.publiclyListed === false ? (
            <span className="theme-text-faint">
              <span className="sr-only">, </span>Not publicly listed
            </span>
          ) : null}
          {updated && !Number.isNaN(updated.getTime()) ? (
            <span className="theme-text-faint">
              <span className="sr-only">, </span>
              <RelativeDay iso={updated.toISOString()} />
            </span>
          ) : null}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-1.5 text-xs">
        {isOpen ? (
          <>
            <span className="sr-only">, </span>
            {isDirty ? <span aria-hidden className="theme-dev-unsaved-dot inline-block size-1.5 rounded-full" /> : null}
            <span className="text-dose-accent-strong font-medium">{isDirty ? "Editing, unsaved" : "Editing"}</span>
          </>
        ) : (
          <Icon icon="lucide:chevron-right" size={16} className="theme-dev-link-row-chevron" />
        )}
      </span>
    </button>
  );
}
