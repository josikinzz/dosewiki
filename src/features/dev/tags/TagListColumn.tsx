"use client";

import { forwardRef, type RefObject } from "react";

import { HighlightedText } from "@/components/common/HighlightedText";
import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TOUCH_HALO_Y, TOUCH_ICON } from "@/components/ui/touchTargets";
import { EditorList, EditorListRow, Notice } from "@/features/dev/components";
import { cn } from "@/lib/utils";
import { TAG_FIELD_LABELS, TAG_FIELDS, type TagField, type TagUsage } from "@/data/tags/tagRegistry";

import { articleWord, usageKey } from "./tagEditorModel";

export type TagReloadState = "idle" | "busy" | "failed";

type TagListColumnProps = {
  totalTags: number;
  fieldCounts: Record<TagField, number>;
  activeField: TagField;
  onFieldChange: (field: TagField) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  searchRef: RefObject<HTMLInputElement | null>;
  filteredTags: TagUsage[];
  selectedKey: string | null;
  onSelectUsage: (usage: TagUsage) => void;
  changedKeys: ReadonlySet<string>;
  otherFieldMatches: { field: TagField; count: number }[];
  reload: TagReloadState;
  onReload: () => void;
  onDismissReloadFailure: () => void;
};

const ROW_ESTIMATE = 48;

export const TagListColumn = forwardRef<HTMLElement, TagListColumnProps>(function TagListColumn(
  {
    totalTags,
    fieldCounts,
    activeField,
    onFieldChange,
    searchQuery,
    onSearchChange,
    searchRef,
    filteredTags,
    selectedKey,
    onSelectUsage,
    changedKeys,
    otherFieldMatches,
    reload,
    onReload,
    onDismissReloadFailure,
  },
  ref,
) {
  const query = searchQuery.trim();
  const fieldLabel = TAG_FIELD_LABELS[activeField];
  const countLine = query
    ? `${filteredTags.length} ${filteredTags.length === 1 ? "match" : "matches"} in ${fieldLabel}`
    : `${filteredTags.length} ${filteredTags.length === 1 ? "tag" : "tags"} in ${fieldLabel}`;

  return (
    <section
      ref={ref}
      aria-labelledby="tag-list-heading"
      className="min-w-0 scroll-mt-24 space-y-3 lg:sticky lg:top-24"
    >
      <div className="flex items-center justify-between gap-3">
        <h3 id="tag-list-heading" className="type-meta-label theme-text-muted">
          By field
        </h3>
        <div className="flex items-center gap-1">
          <p className="theme-text-muted text-xs tabular-nums">{`${totalTags} in use`}</p>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn("size-8", TOUCH_ICON)}
            onClick={onReload}
            disabled={reload === "busy"}
            aria-busy={reload === "busy" || undefined}
            aria-label={reload === "busy" ? "Refreshing tags" : "Refresh tags"}
            title="Refresh tags"
          >
            <Icon icon="lucide:refresh-cw" size={15} className={reload === "busy" ? "animate-spin motion-reduce:animate-none" : undefined} />
          </Button>
        </div>
      </div>
      {reload === "busy" ? <span role="status" className="sr-only">Refreshing tags</span> : null}
      {reload === "failed" ? (
        <Notice
          placement="inline"
          tone="danger"
          dismiss={onDismissReloadFailure}
          actions={(
            <Button type="button" variant="link" size="auto" className={cn("text-xs", TOUCH_HALO_Y)} onClick={onReload}>
              Try again
            </Button>
          )}
        >
          Tags could not be reloaded. The list shows what loaded before.
        </Notice>
      ) : null}

      <div
        role="group"
        aria-label="Tag field"
        className="grid grid-cols-2 gap-1 rounded-card border border-[color:var(--editor-panel-border)] bg-[var(--editor-panel-bg-subtle)] p-1"
      >
        {TAG_FIELDS.map((field) => {
          const selected = field === activeField;
          return (
            <Button
              key={field}
              type="button"
              variant={selected ? "pillActive" : "ghostPill"}
              size="pill"
              aria-pressed={selected}
              onClick={() => onFieldChange(field)}
              className={cn(
                "h-auto min-h-10 w-full flex-col items-start gap-0 rounded-control px-2.5 py-1.5 text-left leading-tight [@media(pointer:coarse)]:min-h-11",
                TOUCH_HALO_Y,
              )}
            >
              <span className="w-full truncate text-xs font-medium">{TAG_FIELD_LABELS[field]}</span>
              <span className={cn("text-xs tabular-nums", selected ? "opacity-80" : "theme-text-faint")}>
                <span className="sr-only">, </span>
                {`${fieldCounts[field]} ${fieldCounts[field] === 1 ? "tag" : "tags"}`}
              </span>
            </Button>
          );
        })}
      </div>

      <div className="relative">
        <Icon icon="lucide:search" size={15} className="theme-text-faint pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" />
        <Input
          ref={searchRef}
          id="tag-search"
          type="search"
          aria-label="Search tags"
          aria-keyshortcuts="/"
          placeholder="Filter by label"
          value={searchQuery}
          onChange={(event) => onSearchChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape" && searchQuery) {
              event.preventDefault();
              onSearchChange("");
            }
          }}
          className="pl-9 pr-9 text-[16px] md:text-sm"
        />
        {searchQuery ? null : (
          <span aria-hidden className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 [@media(pointer:coarse)]:hidden">
            <kbd className="theme-dev-kbd">/</kbd>
          </span>
        )}
      </div>

      <p className="theme-text-muted text-xs tabular-nums" aria-live="polite">{countLine}</p>

      <EditorList
        items={filteredTags}
        getKey={(usage: TagUsage) => usageKey(usage)}
        selectedKey={selectedKey}
        onSelect={(key) => {
          const usage = filteredTags.find((candidate) => usageKey(candidate) === key);
          if (usage) onSelectUsage(usage);
        }}
        renderItem={(usage, { selected }) => (
          <TagRow usage={usage} active={selected} changed={changedKeys.has(usageKey(usage))} query={query} />
        )}
        estimateRowHeight={ROW_ESTIMATE}
        maxHeight="min(calc(100dvh - 26rem), 34rem)"
        emptyText={query ? `No tag in ${fieldLabel} matches that.` : `No tags in ${fieldLabel} yet.`}
        label={`${fieldLabel} tags`}
      />

      {query && filteredTags.length === 0 ? (
        <div className="theme-text-muted space-y-1 text-sm">
          {otherFieldMatches.length > 0 ? (
            <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span>Found in</span>
              {otherFieldMatches.map((entry) => (
                <Button
                  key={entry.field}
                  type="button"
                  variant="link"
                  size="auto"
                  className={cn("text-sm", TOUCH_HALO_Y)}
                  onClick={() => onFieldChange(entry.field)}
                >
                  {`${TAG_FIELD_LABELS[entry.field]} (${entry.count})`}
                </Button>
              ))}
            </p>
          ) : null}
          <p>
            <Button type="button" variant="link" size="auto" className={cn("text-sm", TOUCH_HALO_Y)} onClick={() => onSearchChange("")}>
              Clear the search
            </Button>
          </p>
        </div>
      ) : null}

      {filteredTags.length > 0 ? (
        <p className="theme-text-faint hidden text-xs [@media(pointer:fine)]:block">
          <kbd className="theme-dev-kbd">↑</kbd> <kbd className="theme-dev-kbd">↓</kbd> move, <kbd className="theme-dev-kbd">/</kbd> search, <kbd className="theme-dev-kbd">?</kbd> every key
        </p>
      ) : null}
    </section>
  );
});

function TagRow({ usage, active, changed, query }: { usage: TagUsage; active: boolean; changed: boolean; query: string }) {
  return (
    <EditorListRow active={active} className="h-11 overflow-hidden py-0">
      <span className={cn("min-w-0 flex-1 truncate text-sm font-medium", active ? "theme-accent-heading" : "theme-text-primary")}>
        {query ? <HighlightedText text={usage.tag} query={query} /> : usage.tag}
      </span>
      {changed ? (
        <span className="theme-text-muted flex shrink-0 items-center gap-1.5 text-xs">
          <span className="sr-only">, </span>
          <span aria-hidden className="theme-dev-unsaved-dot inline-block size-1.5 rounded-full" />
          <span>Changed</span>
        </span>
      ) : null}
      <span className="theme-text-faint shrink-0 text-xs tabular-nums">
        <span className="sr-only">, </span>
        {articleWord(usage.count)}
      </span>
    </EditorListRow>
  );
}
