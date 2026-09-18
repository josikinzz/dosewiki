"use client";

import type { RefObject } from "react";

import { Input } from "@/components/ui/input";
import { EditorPanel } from "@/features/dev/components";
import {
  countBucket,
  countFacet,
  type PortalBucket,
  type PortalFacetKind,
  type PortalFacets,
  type PortalGroupBy,
  type PortalRow,
} from "./tripReportPortalModel";

const BUCKETS: { value: PortalBucket; label: string }[] = [
  { value: "needs", label: "Needs review" },
  { value: "published", label: "Published" },
  { value: "all", label: "All" },
];

const GROUPINGS: { value: PortalGroupBy; label: string }[] = [
  { value: "substance", label: "Substance" },
  { value: "author", label: "Author" },
  { value: "date", label: "Date" },
  { value: "none", label: "None" },
];

const FACETS: { kind: PortalFacetKind; label: string }[] = [
  { kind: "substance", label: "Substances" },
  { kind: "author", label: "Authors" },
  { kind: "tag", label: "Tags" },
];

export function PortalOrganizerRail({
  bucket,
  facets,
  groupBy,
  complete,
  needsComplete,
  onBucketChange,
  onClearFacet,
  onGroupByChange,
  onQueryChange,
  onToggleFacet,
  query,
  rows,
  searchInputRef,
}: {
  bucket: PortalBucket;
  complete: boolean;
  needsComplete: boolean;
  facets: PortalFacets;
  groupBy: PortalGroupBy;
  onBucketChange: (bucket: PortalBucket) => void;
  onClearFacet: (kind: PortalFacetKind) => void;
  onGroupByChange: (groupBy: PortalGroupBy) => void;
  onQueryChange: (query: string) => void;
  onToggleFacet: (kind: PortalFacetKind, value: string) => void;
  query: string;
  rows: readonly PortalRow[];
  searchInputRef?: RefObject<HTMLInputElement | null>;
}) {
  const needsReviewCount = countBucket(rows, "needs");

  return (
    <EditorPanel variant="subtle" className="space-y-5 p-3.5">
      <div>
        <label htmlFor="trip-report-portal-search" className="sr-only">
          Search reports
        </label>
        <Input
          id="trip-report-portal-search"
          ref={searchInputRef}
          type="search"
          value={query}
          placeholder="Search title, author, substance…"
          onChange={(event) => onQueryChange(event.target.value)}
        />
      </div>

      <section className="space-y-1">
        <RailHeading>Buckets</RailHeading>
        <ul className="space-y-0.5">
          {BUCKETS.map((entry) => (
            <li key={entry.value}>
              <button
                type="button"
                data-state={bucket === entry.value ? "active" : "idle"}
                aria-pressed={bucket === entry.value}
                onClick={() => onBucketChange(entry.value)}
                className="theme-portal-bucket flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors"
              >
                {entry.value === "needs" && needsReviewCount > 0 ? (
                  <span className="theme-portal-needs-dot h-1.5 w-1.5 shrink-0 rounded-full" aria-hidden="true" />
                ) : null}
                <span className="min-w-0 truncate">{entry.label}</span>
                <span className="ml-auto font-mono text-xs tabular-nums opacity-70">
                  {entry.value === "needs"
                    ? needsComplete ? countBucket(rows, entry.value) : "…"
                    : complete ? countBucket(rows, entry.value) : "…"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-2">
        <RailHeading>Group by</RailHeading>
        <div
          role="group"
          aria-label="Group reports by"
          className="theme-dev-rail flex gap-0.5 rounded-full border p-0.5"
        >
          {GROUPINGS.map((entry) => (
            <button
              key={entry.value}
              type="button"
              data-state={groupBy === entry.value ? "active" : "idle"}
              aria-pressed={groupBy === entry.value}
              onClick={() => onGroupByChange(entry.value)}
              className="theme-dev-rail-tab flex-1 rounded-full px-1 py-1 text-xs font-medium transition-colors"
            >
              {entry.label}
            </button>
          ))}
        </div>
        {!complete ? (
          <p className="theme-text-faint text-[11px]">Filters reflect currently loaded datasets.</p>
        ) : null}
      </section>

      {FACETS.map((facet) => {
        const entries = countFacet(rows, facet.kind);
        if (entries.length === 0) {
          return null;
        }

        const selected = facets[facet.kind];

        return (
          <section key={facet.kind} className="space-y-1">
            <RailHeading
              action={
                selected.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => onClearFacet(facet.kind)}
                    className="theme-text-faint hover:text-dose-text text-[11px] font-medium normal-case tracking-normal"
                  >
                    clear
                  </button>
                ) : null
              }
            >
              {facet.label}
            </RailHeading>
            <div className="max-h-48 space-y-0.5 overflow-y-auto pr-1">
              {entries.map((entry) => {
                const active = selected.includes(entry.value);
                return (
                  <button
                    key={entry.value}
                    type="button"
                    data-state={active ? "active" : "idle"}
                    aria-pressed={active}
                    onClick={() => onToggleFacet(facet.kind, entry.value)}
                    className="theme-replication-facet-option flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-[13px] transition-colors"
                  >
                    <span
                      aria-hidden="true"
                      data-state={active ? "active" : "idle"}
                      className={`h-3 w-3 shrink-0 rounded-[3px] border ${
                        active ? "theme-portal-count-badge border-transparent" : "theme-portal-rule"
                      }`}
                    />
                    <span className="min-w-0 truncate">{entry.value}</span>
                    <span className="text-dose-text-ghost ml-auto font-mono text-[11px] tabular-nums">
                      {entry.count}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
    </EditorPanel>
  );
}

function RailHeading({ action, children }: { action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <p className="theme-text-faint flex items-center justify-between gap-2 font-display text-[11px] font-semibold uppercase tracking-[0.16em]">
      <span>{children}</span>
      {action}
    </p>
  );
}
