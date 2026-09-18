"use client";

import { useMemo } from "react";

import { Icon } from "@/components/common/Icon";
import { Input } from "@/components/ui/input";
import { EditorPanel, EditorSegmentedControl } from "@/features/dev/components";
import { cn } from "@/lib/utils";

import {
  facetCounts,
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
  group: StudioGroupBy;
  onGroupChange: (group: StudioGroupBy) => void;
  facets: StudioFacets;
  onToggleFacet: (kind: StudioFacetKind, key: string) => void;
  searchInputRef?: React.RefObject<HTMLInputElement | null>;
};

const GROUP_OPTIONS = [
  { value: "effect", label: "Effect" },
  { value: "artist", label: "Artist" },
  { value: "type", label: "Type" },
  { value: "none", label: "None" },
];

function FacetSection({
  title,
  kind,
  counts,
  facets,
  onToggleFacet,
  scroll = false,
}: {
  title: string;
  kind: StudioFacetKind;
  counts: { key: string; label: string; count: number }[];
  facets: StudioFacets;
  onToggleFacet: (kind: StudioFacetKind, key: string) => void;
  scroll?: boolean;
}) {
  return (
    <section className="space-y-2 border-t border-[color:var(--editor-panel-border)] px-4 py-3 first:border-t-0">
      <h3 className="theme-section-heading text-[11px] font-semibold uppercase tracking-[0.24em]">
        {title}
      </h3>
      <ul className={cn("space-y-0.5", scroll ? "max-h-56 overflow-y-auto pr-1" : undefined)}>
        {counts.map((entry) => {
          const checked = facets[kind].includes(entry.key);
          return (
            <li key={entry.key}>
              <label
                data-state={checked ? "active" : undefined}
                className="theme-replication-facet-option flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-sm transition"
              >
                <input
                  type="checkbox"
                  className="theme-replication-checkbox"
                  checked={checked}
                  onChange={() => onToggleFacet(kind, entry.key)}
                />
                <span className="min-w-0 flex-1 truncate">{entry.label}</span>
                <span className="theme-text-faint font-mono text-[11px]">{entry.count}</span>
              </label>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** The organizer: search, grouping, and the four facet lists with live counts. */
export function ReplicationFacetRail({
  rows,
  effectNames,
  query,
  onQueryChange,
  group,
  onGroupChange,
  facets,
  onToggleFacet,
  searchInputRef,
}: ReplicationFacetRailProps) {
  const counts = useMemo(
    () => ({
      type: facetCounts(rows, "type", effectNames),
      role: facetCounts(rows, "role", effectNames),
      artist: facetCounts(rows, "artist", effectNames),
      effect: facetCounts(rows, "effect", effectNames),
    }),
    [rows, effectNames],
  );

  return (
    <EditorPanel className="sticky top-4 max-h-[calc(100vh-2rem)] overflow-y-auto">
      <section className="space-y-2 px-4 py-3">
        <h3 className="theme-section-heading text-[11px] font-semibold uppercase tracking-[0.24em]">
          Find
        </h3>
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
            placeholder="Title, artist, slug…"
            autoComplete="off"
            className="pl-9"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
          />
        </div>
      </section>

      <section className="space-y-2 border-t border-[color:var(--editor-panel-border)] px-4 py-3">
        <h3 className="theme-section-heading text-[11px] font-semibold uppercase tracking-[0.24em]">
          Group by
        </h3>
        <EditorSegmentedControl
          label="Group by"
          options={GROUP_OPTIONS}
          value={group}
          onChange={(value) => onGroupChange(value as StudioGroupBy)}
        />
      </section>

      <FacetSection title="Type" kind="type" counts={counts.type} facets={facets} onToggleFacet={onToggleFacet} />
      <FacetSection title="Role" kind="role" counts={counts.role} facets={facets} onToggleFacet={onToggleFacet} />
      <FacetSection title="Artist" kind="artist" counts={counts.artist} facets={facets} onToggleFacet={onToggleFacet} scroll />
      <FacetSection title="Effect" kind="effect" counts={counts.effect} facets={facets} onToggleFacet={onToggleFacet} scroll />
    </EditorPanel>
  );
}
