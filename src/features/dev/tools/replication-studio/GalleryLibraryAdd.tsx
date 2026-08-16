"use client";

/**
 * "Add from the studio library" — the gallery portal's intake region.
 *
 * The curation board can only reorder what the matcher already found. This is
 * the other door: the studio's rail-filtered corpus, narrowed to rows that are
 * *eligible* for a showcase (publishable image/video replications that are not
 * already curated), each with the one action that gets it onto the stage.
 *
 * Two actions, because there are exactly two reasons a row is not curated:
 *
 *   - It matches this substance already → `Curate` (or `Restore & curate` when
 *     it sits on the excluded shelf).
 *   - It does not match → `Tag & curate`: pick one of the substance's visual
 *     effects, POST it as an `effect_tags` addition through the studio's own
 *     bulk editorial endpoint, then let the panel refetch and curate it. The
 *     old surface printed a dead sentence here telling the editor to go tag it
 *     somewhere else.
 *
 * Every row also opens in the full editor drawer, and the list pages rather
 * than silently truncating at twelve.
 */

import { useEffect, useMemo, useState } from "react";

import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { EmptyStateSurface, InteractiveContentCard } from "@/components/ui/surface";
import {
  ActionNotice,
  EditorSection,
  EditorSelect,
  EditorStatusPill,
  TagToken,
} from "@/features/dev/components";

import { ReplicationThumb } from "./ReplicationThumb";
import type { StudioRow } from "./replicationStudioModel";

const EDITORIAL_API = "/api/dev/replications/editorial";

/** Rows shown before the first `Show more`; the same step reveals each page. */
const PAGE_SIZE = 12;

export type GalleryEffectOption = { slug: string; name: string };

export type GalleryLibraryAddProps = {
  rows: readonly StudioRow[];
  railNarrowed: boolean;
  matchedSlugs: ReadonlySet<string>;
  curatedSlugs: readonly string[];
  removedSlugs: readonly string[];
  effectOptions: readonly GalleryEffectOption[];
  onCurate: (slug: string) => void;
  /** A row was tagged server-side; the panel refetches the detail then curates it. */
  onTagged: (replicationSlug: string) => void | Promise<void>;
  onInspectRow: (slug: string) => void;
  onOpenLibrary: () => void;
};

async function readError(response: Response, fallback: string): Promise<string> {
  try {
    const payload = (await response.json()) as { error?: string };
    return payload.error ?? fallback;
  } catch {
    return fallback;
  }
}

function InspectButton({ row, onInspectRow }: { row: StudioRow; onInspectRow: (slug: string) => void }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="h-8 w-8 shrink-0"
      aria-label={`Open ${row.title} in the editor`}
      title="Open in the editor"
      onClick={() => onInspectRow(row.slug)}
    >
      <Icon icon="lucide:pen-line" size={14} />
    </Button>
  );
}

/**
 * A row the matcher already returns for this substance: one click puts it in
 * the curated head. `removed` means it is on the excluded shelf, so the click
 * has to lift the exclusion first — `curateSlug` already does, the label just
 * has to say so.
 */
function MatchedAddRow({
  row,
  removed,
  onCurate,
  onInspectRow,
}: {
  row: StudioRow;
  removed: boolean;
  onCurate: (slug: string) => void;
  onInspectRow: (slug: string) => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        aria-label={`${removed ? "Restore and curate" : "Curate"} ${row.title}`}
        onClick={() => onCurate(row.slug)}
      >
        <Icon icon="lucide:pin" size={14} />
        {removed ? "Restore & curate" : "Curate"}
      </Button>
      <InspectButton row={row} onInspectRow={onInspectRow} />
    </div>
  );
}

/**
 * A row the matcher does not return: it carries none of this substance's visual
 * effects. Adding one as an `effect_tags` entry is exactly what makes it
 * matchable, so the intake does it in place rather than sending the editor to
 * the drawer and back.
 */
function UnmatchedAddRow({
  row,
  effectOptions,
  onTagged,
  onInspectRow,
}: {
  row: StudioRow;
  effectOptions: readonly GalleryEffectOption[];
  onTagged: (replicationSlug: string) => void | Promise<void>;
  onInspectRow: (slug: string) => void;
}) {
  const [effectSlug, setEffectSlug] = useState(() => effectOptions[0]?.slug ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The substance changes under this row when the portal navigates; fall back
  // to the new first effect rather than posting a slug from the old article.
  useEffect(() => {
    setEffectSlug((current) =>
      effectOptions.some((option) => option.slug === current) ? current : (effectOptions[0]?.slug ?? ""),
    );
  }, [effectOptions]);

  const single = effectOptions.length === 1 ? effectOptions[0] : null;

  async function handleTag() {
    if (!effectSlug || pending) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch(EDITORIAL_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "bulk", ids: [row.id], addEffectTags: [effectSlug] }),
      });
      if (!response.ok) {
        setError(await readError(response, `Could not tag ${row.title} with ${effectSlug}.`));
        return;
      }
      await onTagged(row.slug);
    } catch {
      setError(`Could not reach the editorial endpoint to tag ${row.title}.`);
    } finally {
      setPending(false);
    }
  }

  if (effectOptions.length === 0) {
    return (
      <div className="flex shrink-0 items-center gap-1.5">
        <EditorStatusPill tone="warning" title="This article resolves no visual effects to tag against.">
          no effects to tag
        </EditorStatusPill>
        <InspectButton row={row} onInspectRow={onInspectRow} />
      </div>
    );
  }

  return (
    <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
      {single ? (
        <TagToken variant="compact" label={single.name} title={single.slug} />
      ) : (
        <EditorSelect
          selectSize="sm"
          className="w-[9.5rem]"
          aria-label={`Effect to tag ${row.title} with`}
          value={effectSlug}
          disabled={pending}
          onChange={(event) => setEffectSlug(event.target.value)}
          options={effectOptions.map((option) => ({ value: option.slug, label: option.name }))}
        />
      )}
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={pending || !effectSlug}
        aria-label={`Tag ${row.title} with ${effectSlug} and curate it`}
        onClick={handleTag}
      >
        <Icon
          icon={pending ? "lucide:loader-2" : "lucide:tag"}
          size={14}
          className={pending ? "animate-spin" : undefined}
        />
        {pending ? "Tagging…" : "Tag & curate"}
      </Button>
      <InspectButton row={row} onInspectRow={onInspectRow} />
      {error ? (
        <ActionNotice tone="danger" className="basis-full" onDismiss={() => setError(null)}>
          {error}
        </ActionNotice>
      ) : null}
    </div>
  );
}

export function GalleryLibraryAdd({
  rows,
  railNarrowed,
  matchedSlugs,
  curatedSlugs,
  removedSlugs,
  effectOptions,
  onCurate,
  onTagged,
  onInspectRow,
  onOpenLibrary,
}: GalleryLibraryAddProps) {
  const [shown, setShown] = useState(PAGE_SIZE);

  const curatedSet = useMemo(() => new Set(curatedSlugs), [curatedSlugs]);
  const removedSet = useMemo(() => new Set(removedSlugs), [removedSlugs]);

  // Eligible = publishable image/video replication that is not already curated;
  // figures and audio can never appear in a public showcase.
  const addable = useMemo(
    () =>
      rows.filter(
        (row) =>
          row.role === "replication"
          && (row.type === "image" || row.type === "video")
          && !curatedSet.has(row.slug),
      ),
    [rows, curatedSet],
  );

  // A new rail filter is a new question; it should not inherit the last
  // question's expanded page count.
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
          ? "Following the studio's current search and filters. Only publishable image and video replications can join a showcase; curating appends to the head."
          : "Only publishable image and video replications can join a showcase; curating appends to the head."
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
            back — the list below follows whatever the rail is showing.
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
            Nothing addable here — every eligible row the rail is showing is already curated.
          </p>
          <Button type="button" variant="secondary" size="sm" onClick={onOpenLibrary}>
            <Icon icon="lucide:search" size={14} />
            Widen the search in the Library
          </Button>
        </EmptyStateSurface>
      ) : (
        <ul className="space-y-2">
          {visible.map((row) => {
            const matched = matchedSlugs.has(row.slug);
            return (
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
                        {row.artist} · {row.effect_name ?? "no effect"} · {row.type}
                      </p>
                    </div>
                    {matched ? (
                      <MatchedAddRow
                        row={row}
                        removed={removedSet.has(row.slug)}
                        onCurate={onCurate}
                        onInspectRow={onInspectRow}
                      />
                    ) : (
                      <UnmatchedAddRow
                        row={row}
                        effectOptions={effectOptions}
                        onTagged={onTagged}
                        onInspectRow={onInspectRow}
                      />
                    )}
                  </div>
                </InteractiveContentCard>
              </li>
            );
          })}
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
