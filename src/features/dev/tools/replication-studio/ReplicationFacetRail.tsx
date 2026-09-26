"use client";

import { useId, useMemo, useState } from "react";

import { ExpandIndicator } from "@/components/common/ExpandButton";
import { Icon } from "@/components/common/Icon";
import { Input } from "@/components/ui/input";
import { EditorPanel } from "@/features/dev/components";
import { cn } from "@/lib/utils";

import {
  facetCounts,
  liveFacetCounts,
  type StudioFacetKind,
  type StudioFacets,
  type StudioGroupBy,
  type StudioRow,
} from "./replicationStudioModel";

export type ReplicationFacetRailProps = {
  rows: readonly StudioRow[];
  effectNames: ReadonlyMap<string, string>;
  query: string;
  onQueryChange: (query: string) => void;
  /** The Library's grouping; only read for the live counts' filter state. */
  group: StudioGroupBy;
  facets: StudioFacets;
  onToggleFacet: (kind: StudioFacetKind, key: string) => void;
  searchInputRef?: React.RefObject<HTMLInputElement | null>;
  /**
   * `column`: fills a height-bounded column and scrolls inside it (the
   * Library frame). `sticky`: rides beside a long workspace as the page
   * scrolls. `sheet`: the body of the narrow-width filter popover.
   */
  layout: "column" | "sticky" | "sheet";
};

/** Lists longer than this get their own filter box. */
const FILTERABLE_AFTER = 12;

function FacetSection({
  title,
  kind,
  entries,
  live,
  facets,
  onToggleFacet,
  defaultOpen = true,
}: {
  title: string;
  kind: StudioFacetKind;
  entries: { key: string; label: string; count: number }[];
  live: ReadonlyMap<string, number>;
  facets: StudioFacets;
  onToggleFacet: (kind: StudioFacetKind, key: string) => void;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [needle, setNeedle] = useState("");
  const listId = useId();
  const active = facets[kind];
  const filterable = entries.length > FILTERABLE_AFTER;
  const shown = useMemo(() => {
    const term = needle.trim().toLowerCase();
    if (!term) return entries;
    // A ticked value never hides behind the filter box: it is still in force.
    return entries.filter(
      (entry) => active.includes(entry.key) || entry.label.toLowerCase().includes(term),
    );
  }, [active, entries, needle]);

  return (
    <section className="border-t border-[color:var(--editor-panel-border)] first:border-t-0">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((value) => !value)}
        className="theme-replication-facet-heading flex w-full items-center gap-2 px-4 py-2.5 text-left"
      >
        <h3 className="type-meta-label theme-section-heading flex-1">
          {title}
        </h3>
        {active.length > 0 ? (
          <span className="theme-accent-emphasis text-xs tabular-nums">
            {active.length} on
          </span>
        ) : null}
        <ExpandIndicator isExpanded={open} className="theme-text-faint" />
      </button>
      {open ? (
        <div id={listId} className="space-y-2 px-3 pb-3">
          {filterable ? (
            <Input
              type="search"
              inputSize="sm"
              aria-label={`Filter ${title.toLowerCase()} list`}
              placeholder={`Filter ${entries.length} ${title.toLowerCase()}s`}
              autoComplete="off"
              value={needle}
              onChange={(event) => setNeedle(event.target.value)}
            />
          ) : null}
          <ul className="space-y-px">
            {shown.map((entry) => {
              const checked = active.includes(entry.key);
              const count = live.get(entry.key) ?? 0;
              return (
                <li key={entry.key}>
                  <label
                    data-state={checked ? "active" : undefined}
                    data-empty={count === 0 && !checked ? "" : undefined}
                    className="theme-replication-facet-option flex min-h-8 cursor-pointer items-center gap-2.5 rounded-lg px-2 text-sm transition"
                  >
                    <input
                      type="checkbox"
                      className="theme-replication-checkbox size-4 shrink-0"
                      checked={checked}
                      onChange={() => onToggleFacet(kind, entry.key)}
                    />
                    <span className="min-w-0 flex-1 truncate">{entry.label}</span>
                    <span className="theme-text-faint text-xs tabular-nums">{count}</span>
                  </label>
                </li>
              );
            })}
            {shown.length === 0 ? (
              <li className="theme-text-faint px-2 py-1 text-sm">No {title.toLowerCase()} matches.</li>
            ) : null}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

/**
 * The corpus filter every workspace shares: one search box and the four
 * facets. Counts are live (what each value would show under the other
 * filters) while the value list stays the whole corpus's, so a ticked value
 * never vanishes from under the pointer.
 */
export function ReplicationFacetRail({
  rows,
  effectNames,
  query,
  onQueryChange,
  group,
  facets,
  onToggleFacet,
  searchInputRef,
  layout,
}: ReplicationFacetRailProps) {
  const entries = useMemo(
    () => ({
      type: facetCounts(rows, "type", effectNames),
      role: facetCounts(rows, "role", effectNames),
      artist: facetCounts(rows, "artist", effectNames),
      effect: facetCounts(rows, "effect", effectNames),
    }),
    [rows, effectNames],
  );
  const live = useMemo(() => {
    const state = { query, group, facets };
    return {
      type: liveFacetCounts(rows, state, "type"),
      role: liveFacetCounts(rows, state, "role"),
      artist: liveFacetCounts(rows, state, "artist"),
      effect: liveFacetCounts(rows, state, "effect"),
    };
  }, [rows, query, group, facets]);

  const body = (
    <>
      <div className="px-3 py-3">
        <div className="relative">
          <Icon
            icon="lucide:search"
            size={15}
            className="theme-text-faint pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
          />
          <Input
            ref={searchInputRef}
            type="search"
            inputSize="sm"
            aria-label="Search replications"
            aria-keyshortcuts="/"
            placeholder="Title, artist, slug"
            autoComplete="off"
            className="pl-9 pr-8"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
          />
          {query ? null : (
            <span aria-hidden className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 [@media(pointer:coarse)]:hidden">
              <kbd className="theme-dev-kbd">/</kbd>
            </span>
          )}
        </div>
      </div>
      <div className="border-t border-[color:var(--editor-panel-border)]">
        <FacetSection title="Effect" kind="effect" entries={entries.effect} live={live.effect} facets={facets} onToggleFacet={onToggleFacet} />
        <FacetSection title="Artist" kind="artist" entries={entries.artist} live={live.artist} facets={facets} onToggleFacet={onToggleFacet} />
        <FacetSection title="Type" kind="type" entries={entries.type} live={live.type} facets={facets} onToggleFacet={onToggleFacet} />
        <FacetSection title="Role" kind="role" entries={entries.role} live={live.role} facets={facets} onToggleFacet={onToggleFacet} />
      </div>
    </>
  );

  if (layout === "sheet") {
    return <div className="max-h-[min(36rem,70dvh)] overflow-y-auto">{body}</div>;
  }

  return (
    <aside
      aria-label="Filters"
      className={layout === "column" ? "h-full min-h-0" : "sticky top-4 self-start"}
    >
      <EditorPanel
        className={cn(
          "overflow-y-auto overscroll-contain",
          layout === "column" ? "h-full" : "max-h-[calc(100dvh-2rem)]",
        )}
      >
        {body}
      </EditorPanel>
    </aside>
  );
}
