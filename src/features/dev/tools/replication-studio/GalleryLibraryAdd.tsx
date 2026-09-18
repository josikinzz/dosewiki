"use client";

/**
 * Add a direct association or ordering priority from the studio library.
 *
 * Automatic placement comes from reviewed title taxonomy. This surface never
 * mutates effect tags to force a match: unmatched standalone work can be
 * associated directly, while combinations and non-showcase media stay absent.
 */

import { useEffect, useMemo, useState } from "react";

import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { EmptyStateSurface, InteractiveContentCard } from "@/components/ui/surface";
import { TOUCH_ICON } from "@/components/ui/touchTargets";
import { EditorSection, EditorStatusPill } from "@/features/dev/components";
import { isCombinationReplication } from "@/data/substanceReplicationGallery";

import { ReplicationThumb } from "./ReplicationThumb";
import type { StudioRow } from "./replicationStudioModel";

const PAGE_SIZE = 12;

export type GalleryLibraryAddProps = {
  rows: readonly StudioRow[];
  railNarrowed: boolean;
  matchedSlugs: ReadonlySet<string>;
  curatedSlugs: readonly string[];
  removedSlugs: readonly string[];
  onCurate: (slug: string) => void;
  onInspectRow: (slug: string) => void;
  onOpenLibrary: () => void;
};

function InspectButton({
  row,
  onInspectRow,
}: {
  row: StudioRow;
  onInspectRow: (slug: string) => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={`h-8 w-8 shrink-0 ${TOUCH_ICON}`}
      aria-label={`Open ${row.title} in the editor`}
      title="Open in the editor"
      onClick={() => onInspectRow(row.slug)}
    >
      <Icon icon="lucide:pen-line" size={14} />
    </Button>
  );
}

function AddActions({
  row,
  automatic,
  removed,
  onCurate,
  onInspectRow,
}: {
  row: StudioRow;
  automatic: boolean;
  removed: boolean;
  onCurate: (slug: string) => void;
  onInspectRow: (slug: string) => void;
}) {
  const label = removed
    ? "Restore & prioritize"
    : automatic
      ? "Prioritize"
      : "Associate & prioritize";
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        aria-label={`${label} ${row.title}`}
        onClick={() => onCurate(row.slug)}
      >
        <Icon icon={automatic ? "lucide:pin" : "lucide:link"} size={14} />
        {label}
      </Button>
      <InspectButton row={row} onInspectRow={onInspectRow} />
    </div>
  );
}

export function GalleryLibraryAdd({
  rows,
  railNarrowed,
  matchedSlugs,
  curatedSlugs,
  removedSlugs,
  onCurate,
  onInspectRow,
  onOpenLibrary,
}: GalleryLibraryAddProps) {
  const [shown, setShown] = useState(PAGE_SIZE);
  const curatedSet = useMemo(() => new Set(curatedSlugs), [curatedSlugs]);
  const removedSet = useMemo(() => new Set(removedSlugs), [removedSlugs]);

  const addable = useMemo(
    () =>
      rows.filter(
        (row) =>
          row.role === "replication"
          && (row.type === "image" || row.type === "video")
          && !isCombinationReplication(row)
          && !curatedSet.has(row.slug),
      ),
    [rows, curatedSet],
  );

  useEffect(() => {
    setShown(PAGE_SIZE);
  }, [rows]);

  const visible = addable.slice(0, shown);
  const remaining = addable.length - visible.length;

  return (
    <EditorSection
      icon="lucide:library-big"
      title="Add from the studio library"
      headingLevel="h3"
      animate={false}
      description={
        railNarrowed
          ? "Following the studio's current search and filters. Prioritize an automatic placement or add a direct standalone association."
          : "Prioritize an automatic placement or add a direct standalone association. Combinations cannot join a single-substance showcase."
      }
      actions={
        addable.length > 0 ? (
          <EditorStatusPill tone="neutral">
            {visible.length === addable.length
              ? `${addable.length} eligible row${addable.length === 1 ? "" : "s"}`
              : `Showing ${visible.length} of ${addable.length} filtered rows`}
          </EditorStatusPill>
        ) : null
      }
    >
      {railNarrowed ? null : (
        <EmptyStateSurface padding="md" radius="lg" className="flex flex-wrap items-center gap-3">
          <Icon icon="lucide:library-big" size={18} className="theme-text-faint shrink-0" />
          <p className="theme-text-muted min-w-0 flex-1 text-xs">
            This is the whole corpus in default order. Search and filter it in the Library, then come
            back—the list below follows the rail.
          </p>
          <Button type="button" variant="secondary" size="sm" className="shrink-0" onClick={onOpenLibrary}>
            <Icon icon="lucide:search" size={14} />
            Open the Library
          </Button>
        </EmptyStateSurface>
      )}

      {addable.length === 0 ? (
        <EmptyStateSurface padding="md" radius="lg" className="space-y-2">
          <p className="theme-text-muted text-xs">
            Nothing addable here. Every eligible standalone row in this view already has priority.
          </p>
          <Button type="button" variant="secondary" size="sm" onClick={onOpenLibrary}>
            <Icon icon="lucide:search" size={14} />
            Widen the search in the Library
          </Button>
        </EmptyStateSurface>
      ) : (
        <ul className="space-y-2">
          {visible.map((row) => (
            <li key={row.id} className="list-none">
              <InteractiveContentCard variant="public" padding="sm" radius="lg">
                <div className="flex items-center gap-3">
                  <ReplicationThumb
                    row={{
                      slug: row.slug,
                      title: row.title,
                      type: row.type,
                      thumbnail_url: row.thumbnail_url,
                      url: row.url,
                      duration: row.duration,
                    }}
                    className="size-14 shrink-0"
                  />
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <p className="theme-text-primary truncate text-sm font-medium">{row.title}</p>
                    <p className="theme-text-faint truncate text-xs">
                      {row.artist} · {row.type}
                    </p>
                  </div>
                  <AddActions
                    row={row}
                    automatic={matchedSlugs.has(row.slug)}
                    removed={removedSet.has(row.slug)}
                    onCurate={onCurate}
                    onInspectRow={onInspectRow}
                  />
                </div>
              </InteractiveContentCard>
            </li>
          ))}
        </ul>
      )}

      {remaining > 0 ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setShown((count) => count + PAGE_SIZE)}
        >
          <Icon icon="lucide:chevron-down" size={14} />
          Show {Math.min(remaining, PAGE_SIZE)} more ({remaining} left)
        </Button>
      ) : null}
    </EditorSection>
  );
}
