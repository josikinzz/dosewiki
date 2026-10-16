"use client";

import { useId, useMemo, useState, type ReactNode, type RefObject } from "react";

import { Icon } from "@/components/common/Icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TOUCH_HALO_Y } from "@/components/ui/touchTargets";
import { EditorField, EditorSelect, TagToken } from "@/features/dev/components";
import { SearchableMultiPicker } from "@/features/dev/components/SearchablePicker";
import { cn } from "@/lib/utils";

import { PortalReportList } from "./PortalReportList";
import {
  activeFacetCount,
  bucketOf,
  countBucket,
  countFacet,
  EMPTY_PORTAL_FACETS,
  PORTAL_BUCKET_LABELS,
  PORTAL_FACET_LABELS,
  PORTAL_GROUP_LABELS,
  PORTAL_SORT_LABELS,
  type PortalBucket,
  type PortalEmpty,
  type PortalFacetKind,
  type PortalFacets,
  type PortalGroup,
  type PortalGroupBy,
  type PortalRow,
  type PortalSort,
} from "./tripReportPortalModel";

const BUCKETS: readonly PortalBucket[] = ["needs", "published", "all"];
const FACET_KINDS: readonly PortalFacetKind[] = ["substance", "author", "tag"];
const SORTS: readonly PortalSort[] = ["waiting", "newest", "oldest", "title"];
const GROUPINGS: readonly PortalGroupBy[] = ["none", "substance", "author", "date"];

function BucketChoices({
  value,
  counts,
  onChange,
}: {
  value: PortalBucket;
  counts: Record<PortalBucket, number | null>;
  onChange: (bucket: PortalBucket) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Show"
      className="grid grid-cols-3 gap-1 rounded-card border border-[color:var(--editor-panel-border)] bg-[var(--editor-panel-bg-subtle)] p-1"
    >
      {BUCKETS.map((bucket) => {
        const selected = bucket === value;
        const count = counts[bucket];
        return (
          <Button
            key={bucket}
            type="button"
            variant={selected ? "pillActive" : "ghostPill"}
            size="pill"
            aria-pressed={selected}
            onClick={() => onChange(bucket)}
            className={cn(
              "h-auto min-h-11 w-full min-w-0 flex-col gap-0 rounded-control px-1 py-1 leading-tight",
              TOUCH_HALO_Y,
            )}
          >
            <span className="max-w-full truncate text-xs font-medium">{PORTAL_BUCKET_LABELS[bucket]}</span>
            {count === null ? (
              <span className="sr-only">, not loaded</span>
            ) : (
              <span className={cn("text-xs tabular-nums", selected ? "opacity-80" : "theme-text-faint")}>
                <span className="sr-only">,</span> {count}
              </span>
            )}
          </Button>
        );
      })}
    </div>
  );
}

export type PortalListColumnProps = {
  listRef: RefObject<HTMLElement | null>;
  rows: readonly PortalRow[];
  visibleCount: number;
  groups: readonly PortalGroup[];
  bucket: PortalBucket;
  onBucketChange: (bucket: PortalBucket) => void;
  needsKnown: boolean;
  publishedKnown: boolean;
  query: string;
  onQueryChange: (query: string) => void;
  searchInputRef: RefObject<HTMLInputElement | null>;
  sort: PortalSort;
  onSortChange: (sort: PortalSort) => void;
  groupBy: PortalGroupBy;
  onGroupByChange: (groupBy: PortalGroupBy) => void;
  facets: PortalFacets;
  onFacetsChange: (facets: PortalFacets) => void;
  refreshing: boolean;
  onRefresh: () => void;
  notice: ReactNode;
  bulk: ReactNode;
  error: ReactNode;
  loading: boolean;
  hideList: boolean;
  empty: PortalEmpty | null;
  onShowEverything: () => void;
  onClearSearch: () => void;
  selectedId: string | null;
  dirtyId: string | null;
  onSelect: (row: PortalRow) => void;
  checkedIds: ReadonlySet<string>;
  canCheck: (row: PortalRow) => boolean;
  onToggleChecked: (id: string) => void;
};

export function PortalListColumn(props: PortalListColumnProps) {
  const {
    listRef,
    rows,
    visibleCount,
    groups,
    bucket,
    onBucketChange,
    needsKnown,
    publishedKnown,
    query,
    onQueryChange,
    searchInputRef,
    sort,
    onSortChange,
    groupBy,
    onGroupByChange,
    facets,
    onFacetsChange,
    refreshing,
    onRefresh,
    notice,
    bulk,
    error,
    loading,
    hideList,
    empty,
    onShowEverything,
    onClearSearch,
    selectedId,
    dirtyId,
    onSelect,
    checkedIds,
    canCheck,
    onToggleChecked,
  } = props;
  const headingId = useId();
  const searchId = useId();
  const filtersId = useId();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const facetCount = activeFacetCount(facets);

  const counts: Record<PortalBucket, number | null> = {
    needs: needsKnown ? countBucket(rows, "needs") : null,
    published: publishedKnown ? countBucket(rows, "published") : null,
    all: needsKnown && publishedKnown ? rows.length : null,
  };

  const bucketRows = useMemo(
    () => (bucket === "all" ? rows : rows.filter((row) => bucketOf(row) === bucket)),
    [bucket, rows],
  );
  const facetOptions = useMemo(
    () =>
      Object.fromEntries(
        FACET_KINDS.map((kind) => [
          kind,
          countFacet(bucketRows, kind).map((entry) => ({
            value: entry.value,
            label: entry.value,
            hint: `${entry.count} ${entry.count === 1 ? "report" : "reports"}`,
          })),
        ]),
      ) as Record<PortalFacetKind, { value: string; label: string; hint: string }[]>,
    [bucketRows],
  );

  const countLine = loading
    ? "Loading"
    : `${visibleCount} ${bucket === "all" ? "in all" : `in ${PORTAL_BUCKET_LABELS[bucket]}`}`;
  const showStatus = bucket !== "published";

  return (
    <section ref={listRef} aria-labelledby={headingId} className="scroll-mt-24 space-y-3 lg:sticky lg:top-24">
      <div className="flex items-center justify-between gap-3">
        <h3 id={headingId} className="type-meta-label theme-text-muted">
          Reports
        </h3>
        <div className="flex items-center gap-2">
          <p className="theme-text-muted text-xs tabular-nums" aria-live="polite">
            {countLine}
          </p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="-mr-2"
            onClick={onRefresh}
            disabled={refreshing}
            aria-busy={refreshing || undefined}
          >
            <Icon icon="lucide:refresh-cw" size={14} className={cn(refreshing && "motion-safe:animate-spin")} />
            {refreshing ? "Refreshing" : "Refresh"}
          </Button>
        </div>
      </div>

      <BucketChoices value={bucket} counts={counts} onChange={onBucketChange} />

      <div className="flex items-start gap-2">
        <div className="relative min-w-0 flex-1">
          <Icon
            icon="lucide:search"
            size={15}
            className="theme-text-faint pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
          />
          <Input
            ref={searchInputRef}
            id={searchId}
            type="search"
            inputSize="sm"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape" && query) {
                event.preventDefault();
                event.stopPropagation();
                onQueryChange("");
              }
            }}
            placeholder="Search reports"
            aria-label="Search reports"
            aria-keyshortcuts="/"
            className="pl-9 pr-9"
          />
          {query ? null : (
            <span
              aria-hidden
              className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 [@media(pointer:coarse)]:hidden"
            >
              <kbd className="theme-dev-kbd">/</kbd>
            </span>
          )}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-10 shrink-0"
          aria-expanded={filtersOpen}
          aria-controls={filtersId}
          onClick={() => setFiltersOpen((open) => !open)}
        >
          <Icon icon="lucide:sliders-horizontal" size={14} />
          Filters
          {facetCount > 0 ? (
            <>
              <Badge variant="secondary" aria-hidden>
                {facetCount}
              </Badge>
              <span className="sr-only">{`, ${facetCount} active`}</span>
            </>
          ) : null}
        </Button>
      </div>

      <div
        id={filtersId}
        hidden={!filtersOpen}
        className="space-y-4 rounded-card border border-[color:var(--editor-panel-border)] bg-[var(--editor-panel-bg-subtle)] p-3"
      >
        <div className="flex items-center justify-between gap-3">
          <h4 className="type-meta-label theme-text-muted">Filters</h4>
          {facetCount > 0 ? (
            <Button type="button" variant="link" size="auto" className="text-sm" onClick={() => onFacetsChange(EMPTY_PORTAL_FACETS)}>
              Clear all
            </Button>
          ) : null}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <EditorField label="Order">
            {(control) => (
              <EditorSelect
                {...control}
                selectSize="sm"
                value={sort}
                onChange={(event) => onSortChange(event.target.value as PortalSort)}
                options={SORTS.map((option) => ({ value: option, label: PORTAL_SORT_LABELS[option] }))}
              />
            )}
          </EditorField>
          <EditorField label="Group by">
            {(control) => (
              <EditorSelect
                {...control}
                selectSize="sm"
                value={groupBy}
                onChange={(event) => onGroupByChange(event.target.value as PortalGroupBy)}
                options={GROUPINGS.map((option) => ({ value: option, label: PORTAL_GROUP_LABELS[option] }))}
              />
            )}
          </EditorField>
        </div>
        {FACET_KINDS.map((kind) => (
          <EditorField key={kind} label={PORTAL_FACET_LABELS[kind]}>
            {(control) => (
              <SearchableMultiPicker
                id={control.id}
                ariaLabel={PORTAL_FACET_LABELS[kind]}
                options={facetOptions[kind]}
                value={facets[kind]}
                placeholder={`Any ${PORTAL_FACET_LABELS[kind].toLowerCase().replace(/s$/, "")}`}
                emptyText={`No ${PORTAL_FACET_LABELS[kind].toLowerCase()} in this view.`}
                onChange={(values) => onFacetsChange({ ...facets, [kind]: values })}
              />
            )}
          </EditorField>
        ))}
        {!needsKnown || !publishedKnown ? (
          <p className="theme-text-muted text-xs">Counts cover the lists that loaded; one did not.</p>
        ) : null}
      </div>

      {facetCount > 0 && !filtersOpen ? (
        <div role="group" aria-label={`Active filters, ${facetCount}`} className="flex flex-wrap items-center gap-1.5">
          {FACET_KINDS.flatMap((kind) =>
            facets[kind].map((value) => (
              <TagToken
                key={`${kind}:${value}`}
                label={value}
                variant="compact"
                removeLabel={`Remove the ${value} filter`}
                onRemove={() => onFacetsChange({ ...facets, [kind]: facets[kind].filter((entry) => entry !== value) })}
              />
            )),
          )}
          <Button type="button" variant="link" size="auto" className="ml-1 text-xs" onClick={() => onFacetsChange(EMPTY_PORTAL_FACETS)}>
            Clear all
          </Button>
        </div>
      ) : null}

      {notice}
      {bulk}
      {error}

      {hideList ? null : loading && visibleCount === 0 ? (
        <ListSkeleton />
      ) : visibleCount === 0 && empty ? (
        <EmptyList empty={empty} onShowEverything={onShowEverything} onClearSearch={onClearSearch} onBucketChange={onBucketChange} />
      ) : (
        <PortalReportList
          groups={groups}
          selectedId={selectedId}
          dirtyId={dirtyId}
          onSelect={onSelect}
          checkedIds={checkedIds}
          canCheck={canCheck}
          onToggleChecked={onToggleChecked}
          showStatus={showStatus}
          maxHeight="min(calc(100dvh - 22rem), 720px)"
        />
      )}

      <p className="theme-text-faint hidden text-xs [@media(pointer:fine)]:block">
        <kbd className="theme-dev-kbd">j</kbd> <kbd className="theme-dev-kbd">k</kbd> move,{" "}
        <kbd className="theme-dev-kbd">a</kbd> accept, <kbd className="theme-dev-kbd">/</kbd> search,{" "}
        <kbd className="theme-dev-kbd">?</kbd> every key
      </p>
    </section>
  );
}

function EmptyList({
  empty,
  onShowEverything,
  onClearSearch,
  onBucketChange,
}: {
  empty: PortalEmpty;
  onShowEverything: () => void;
  onClearSearch: () => void;
  onBucketChange: (bucket: PortalBucket) => void;
}) {
  return (
    <div className="rounded-card border border-dashed border-[color:var(--editor-panel-border)] px-4 py-5 text-sm">
      <p className="theme-text-secondary flex items-start gap-2">
        <Icon
          icon={empty.kind === "filtered" ? "lucide:search-x" : "lucide:circle-check"}
          size={16}
          className={cn("mt-0.5 shrink-0", empty.kind === "filtered" ? "theme-text-faint" : "theme-icon-accent")}
        />
        <span>{empty.message}</span>
      </p>
      {empty.kind === "filtered" ? (
        <div className="ml-6 mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          {empty.found.length > 0 ? (
            <span className="theme-text-muted flex flex-wrap items-center gap-x-3 gap-y-1">
              Found under
              {empty.found.map((entry) => (
                <Button
                  key={entry.bucket}
                  type="button"
                  variant="link"
                  size="auto"
                  className="text-sm"
                  onClick={() => onBucketChange(entry.bucket)}
                >
                  {`${PORTAL_BUCKET_LABELS[entry.bucket]} (${entry.count})`}
                </Button>
              ))}
            </span>
          ) : null}
          <Button type="button" variant="link" size="auto" className="text-sm" onClick={onClearSearch}>
            Clear the search and filters
          </Button>
        </div>
      ) : empty.kind === "bucket" ? (
        <Button type="button" variant="link" size="auto" className="ml-6 mt-2 text-sm" onClick={onShowEverything}>
          Show everything
        </Button>
      ) : (
        <p className="theme-text-muted ml-6 mt-2">
          <a
            href="/reports/submit"
            target="_blank"
            rel="noreferrer"
            className="text-dose-accent-strong theme-accent-underline underline-offset-4 hover:underline"
          >
            Open the public submission form
          </a>
        </p>
      )}
    </div>
  );
}

function ListSkeleton() {
  return (
    <div aria-busy="true" className="space-y-1">
      <span className="sr-only">Loading trip reports</span>
      {Array.from({ length: 4 }, (_, index) => (
        <div
          key={index}
          aria-hidden
          className="space-y-2 rounded-xl px-3 py-3 [background:var(--theme-frosted-control-on-panel-bg)]"
        >
          <span className="theme-skeleton-pulse block h-3.5 rounded-chip" style={{ width: `${72 - index * 9}%` }} />
          <span className="theme-skeleton-pulse block h-3 w-2/5 rounded-chip" />
        </div>
      ))}
    </div>
  );
}

