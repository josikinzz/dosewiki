"use client";

import { useEffect, useId, useState } from "react";

import { ExpandButton } from "@/components/common/ExpandButton";
import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TOUCH_ICON } from "@/components/ui/touchTargets";
import {
  EditorField,
  EditorFieldRow,
  Notice,
  EditorStatusPill,
  type NoticeMessage,
  type SearchablePickerOption,
} from "@/features/dev/components";
import { SearchablePicker } from "@/features/dev/components/SearchablePicker";
import { ReplicationThumb } from "@/features/dev/tools/replication-studio/ReplicationThumb";
import { isValidReplicationSlug } from "@/features/dev/tools/replication-studio/replicationStudioModel";

import {
  CANDIDATE_QUERY_MAX,
  CANDIDATE_SEARCH_LIMIT,
  fetchCandidateSearch,
  type PlaylistCandidate,
} from "./playlistCandidates";
import { moveSlug, playlistKeyOf, type PlaylistDraft } from "./playlistsModel";
import type { WorkCards } from "./useWorkCards";

/**
 * Rows shown before the list folds behind "Show all". A long playlist then
 * stays about one screen tall instead of pushing the Save button off the page.
 */
const COLLAPSED_ROWS = 20;

/** Pause after the last keystroke before the search read goes out. */
const SEARCH_DEBOUNCE_MS = 250;

/**
 * What this editor lets the member do. Every surface that edits a playlist
 * renders this one editor and turns on only what it allows.
 */
type PlaylistEditorCapabilities = {
  /** Change the name (and, while creating, the key minted from it). */
  rename: boolean;
  /** Add and remove works; reordering is always allowed. */
  membership: boolean;
  /** Admin creating a playlist: choose the owning member, saved with it. */
  owner: boolean;
  /** Find works by thumbnail and title through the bounded candidates read. */
  search: boolean;
};

const DEFAULT_CAPABILITIES: PlaylistEditorCapabilities = {
  rename: true,
  membership: true,
  owner: false,
  search: false,
};

export type PlaylistEditorProps = {
  draft: PlaylistDraft;
  /** `null` while creating: the key follows the title until the first save. */
  isNew: boolean;
  isDirty: boolean;
  busy: boolean;
  /** Outcome of the last write. It sits beside the Save button so it is seen from wherever Save was pressed. */
  notice: NoticeMessage | null;
  onChange: (draft: PlaylistDraft) => void;
  onSave: () => void;
  onCancel: () => void;
  saveLabel?: string;
  capabilities?: Partial<PlaylistEditorCapabilities>;
  /** Thumbnail cards for the entries; required for `search`, and it also resolves slugs as they are added. */
  workCards?: WorkCards;
  /** Members an admin may hand the new playlist to (`owner`). */
  memberOptions?: readonly SearchablePickerOption[];
  /** Embedded in a page pane rather than the /dev shell. */
  contextual?: boolean;
};

/**
 * A title, a key, and an ordered list of works with up/down/remove controls.
 * With `search` on, entries show their thumbnail and title, a search finds
 * works by what they look like and are called, and a pasted slug is checked
 * against the published corpus the moment it is added, so a save never has
 * to drop anything the member did not see flagged first.
 */
export function PlaylistEditor({
  draft,
  isNew,
  isDirty,
  busy,
  notice,
  onChange,
  onSave,
  onCancel,
  saveLabel,
  capabilities: capabilityOverrides,
  workCards,
  memberOptions = [],
  contextual = false,
}: PlaylistEditorProps) {
  const capabilities = { ...DEFAULT_CAPABILITIES, ...capabilityOverrides };
  const visual = capabilities.search && workCards !== undefined;
  const [newSlug, setNewSlug] = useState("");
  const [slugError, setSlugError] = useState<string | null>(null);
  const [checkingSlug, setCheckingSlug] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const headingId = useId();
  const slugInputId = useId();
  const listId = useId();

  const canSave = !busy && isDirty && draft.title.trim().length > 0 && draft.key.length > 0;
  const hiddenCount = showAll ? 0 : Math.max(0, draft.slugs.length - COLLAPSED_ROWS);
  const visibleSlugs = hiddenCount > 0 ? draft.slugs.slice(0, COLLAPSED_ROWS) : draft.slugs;
  const unavailableCount = visual ? draft.slugs.filter((slug) => workCards.unavailable.has(slug)).length : 0;
  const labelOf = (slug: string) => (visual ? workCards.get(slug)?.title : undefined) || slug;

  /** Applies a list change; a row that lands in the folded tail unfolds it so the edit stays visible. */
  const updateSlugs = (slugs: string[], touchedIndex: number) => {
    if (!showAll && touchedIndex >= COLLAPSED_ROWS) setShowAll(true);
    onChange({ ...draft, slugs });
  };

  const appendSlug = (slug: string) => updateSlugs([...draft.slugs, slug], draft.slugs.length);

  const addSlug = async () => {
    const slug = newSlug.trim().toLowerCase();
    if (!isValidReplicationSlug(slug)) {
      setSlugError("A replication slug is lowercase words joined by hyphens.");
      return;
    }
    if (draft.slugs.includes(slug)) {
      setSlugError(`"${slug}" is already on this playlist.`);
      return;
    }
    if (visual) {
      setCheckingSlug(true);
      try {
        const card = await workCards.resolve(slug);
        if (!card) {
          setSlugError(`No published work a playlist can hold has the slug "${slug}". Check the address, or find the work by searching.`);
          return;
        }
      } catch (error) {
        setSlugError(error instanceof Error ? error.message : "Unable to check that slug right now.");
        return;
      } finally {
        setCheckingSlug(false);
      }
    }
    setSlugError(null);
    setNewSlug("");
    appendSlug(slug);
  };

  return (
    <section aria-labelledby={headingId} className="space-y-5">
      {/* Keep actions at the embedded pane's top, or just below the site header. */}
      <header className={`sticky ${contextual ? "top-0" : "top-[var(--site-header-height)]"} z-10 space-y-2 border-b border-[color:var(--editor-panel-border)] bg-[var(--editor-panel-bg)]/95 py-2 backdrop-blur`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id={headingId} className="theme-text-primary text-base font-semibold">
            {isNew ? "New playlist" : `Edit ${draft.title || draft.key}`}
          </h3>
          <div className={`flex items-center gap-2 ${contextual ? "flex-wrap" : ""}`}>
            {isDirty ? <EditorStatusPill tone="warning">Unsaved</EditorStatusPill> : null}
            {!contextual || isDirty ? <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={onCancel}>
              <Icon icon="lucide:x" size={14} />
              {isDirty ? "Discard" : "Close"}
            </Button> : null}
            <Button type="button" variant="accent" size="sm" disabled={!canSave} onClick={onSave}>
              <Icon icon={busy ? "lucide:loader-circle" : "lucide:save"} size={14} />
              {saveLabel ?? (isNew ? "Create playlist" : "Save changes")}
            </Button>
          </div>
        </div>
        {notice ? <Notice {...notice} /> : null}
      </header>

      {contextual && !capabilities.rename ? <p className="theme-text-muted text-sm">{draft.title} <span className="break-all">({draft.key})</span></p> : <EditorFieldRow layout="twoColumn">
        <EditorField label="Name" required>
          {(control) => (
            <Input
              {...control}
              value={draft.title}
              placeholder="Classic psychedelic opener"
              maxLength={120}
              disabled={busy || !capabilities.rename}
              onChange={(event) => {
                const title = event.target.value;
                onChange({ ...draft, title, key: isNew ? playlistKeyOf(title) : draft.key });
              }}
            />
          )}
        </EditorField>
        <EditorField
          label="Key"
          description={isNew ? "Minted from the name; it stays fixed after the first save." : "Fixed once saved."}
        >
          {(control) => (
            <Input {...control} value={draft.key} readOnly disabled className="font-mono text-xs" />
          )}
        </EditorField>
      </EditorFieldRow>}

      {capabilities.owner ? (
        <EditorField
          label="Owner"
          description="The member who may edit this playlist; saved with it. Leave it unset to keep the playlist admin-only."
        >
          {(control) => (
            <SearchablePicker
              id={control.id}
              ariaLabel="Owner"
              options={memberOptions}
              value={draft.ownerEmail || null}
              placeholder="Choose a member"
              emptyText="No member matches."
              disabled={busy}
              onChange={(email) => onChange({ ...draft, ownerEmail: email ?? "" })}
            />
          )}
        </EditorField>
      ) : null}

      <div className="space-y-2">
        <p className="theme-text-secondary text-sm font-medium">
          Works, in order ({draft.slugs.length})
        </p>
        {unavailableCount > 0 ? (
          <p className="text-sm text-dose-warning" role="status">
            {unavailableCount === 1 ? "1 entry is" : `${unavailableCount} entries are`} not a published work a playlist can hold. Saving leaves {unavailableCount === 1 ? "it" : "them"} out; remove {unavailableCount === 1 ? "it" : "them"} now to keep the list honest.
          </p>
        ) : null}
        {visual && workCards.error ? <p className="theme-text-faint text-xs">Thumbnails could not load: {workCards.error}</p> : null}
        {draft.slugs.length === 0 ? (
          <p className="theme-text-faint text-sm">
            {visual ? "No works yet. Search below, or paste a slug." : "No works yet. Add a replication slug below."}
          </p>
        ) : (
          <ol id={listId} className="border-y border-[color:var(--editor-panel-border)]" aria-label="Playlist order">
            {visibleSlugs.map((slug, index) => {
              const card = visual ? workCards.get(slug) : undefined;
              const label = labelOf(slug);
              return (
                <li
                  key={slug}
                  data-playlist-entry={slug}
                  className="flex items-center gap-2 border-b border-[color:var(--editor-panel-border)] py-2 last:border-b-0"
                >
                  <span className="theme-text-faint w-8 shrink-0 text-right font-mono text-xs tabular-nums">
                    {index + 1}
                  </span>
                  {visual ? (
                    <>
                      {card ? <ReplicationThumb row={card} className="aspect-square w-14 shrink-0" /> : <span className="theme-replication-media-well aspect-square w-14 shrink-0" aria-hidden="true" />}
                      <span className="min-w-0 flex-1">
                        <span className="theme-text-primary block truncate text-sm font-medium">{label}</span>
                        <span className="theme-text-faint block truncate text-xs">
                          {card ? card.artist : card === null ? `${slug} · not a published work; saving leaves it out` : slug}
                        </span>
                      </span>
                    </>
                  ) : (
                    <span className="theme-text-primary min-w-0 flex-1 truncate font-mono text-sm">{slug}</span>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className={`h-8 w-8 ${TOUCH_ICON}`}
                    disabled={busy || index === 0}
                    aria-label={`Move ${label} up`}
                    onClick={() => updateSlugs(moveSlug(draft.slugs, index, -1), index - 1)}
                  >
                    <Icon icon="lucide:arrow-up" size={14} />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className={`h-8 w-8 ${TOUCH_ICON}`}
                    disabled={busy || index === draft.slugs.length - 1}
                    aria-label={`Move ${label} down`}
                    onClick={() => updateSlugs(moveSlug(draft.slugs, index, 1), index + 1)}
                  >
                    <Icon icon="lucide:arrow-down" size={14} />
                  </Button>
                  {!contextual || capabilities.membership ? <Button
                    type="button"
                    variant="ghostDestructive"
                    size="icon"
                    className={`h-8 w-8 ${TOUCH_ICON}`}
                    disabled={busy || !capabilities.membership}
                    aria-label={`Remove ${label}`}
                    onClick={() => updateSlugs(draft.slugs.filter((entry) => entry !== slug), index)}
                  >
                    <Icon icon="lucide:x" size={14} />
                  </Button> : null}
                </li>
              );
            })}
          </ol>
        )}
        {draft.slugs.length > COLLAPSED_ROWS ? (
          <div className="flex justify-center pt-1">
            <ExpandButton
              isExpanded={showAll}
              onToggle={() => setShowAll((value) => !value)}
              variant="count"
              count={draft.slugs.length - COLLAPSED_ROWS}
              label={showAll ? `Show the first ${COLLAPSED_ROWS}` : "Show all"}
              ariaControls={listId}
              ariaLabel={
                showAll
                  ? `Show only the first ${COLLAPSED_ROWS} works`
                  : `Show all ${draft.slugs.length} works`
              }
            />
          </div>
        ) : null}

        {visual && capabilities.membership ? (
          <WorkSearch
            busy={busy}
            onList={draft.slugs}
            onFound={workCards.remember}
            onAdd={(card) => {
              setSlugError(null);
              appendSlug(card.slug);
            }}
          />
        ) : null}

        {!contextual || capabilities.membership ? <EditorFieldRow layout="actionTrailing">
          <EditorField
            id={slugInputId}
            label="Add a work"
            description={
              visual
                ? "Or paste the slug from a replication's address, for example glowing-fractal-tunnel. It is checked at once and goes to the end of the list."
                : "The slug from a replication's address, for example glowing-fractal-tunnel. It goes to the end of the list."
            }
            error={slugError}
          >
            {(control) => (
              <Input
                {...control}
                value={newSlug}
                placeholder="replication-slug"
                disabled={busy || !capabilities.membership}
                className="font-mono text-sm"
                onChange={(event) => {
                  setNewSlug(event.target.value);
                  if (slugError) setSlugError(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void addSlug();
                  }
                }}
              />
            )}
          </EditorField>
          <Button type="button" variant="secondary" size="sm" disabled={busy || checkingSlug || !capabilities.membership || newSlug.trim().length === 0} onClick={() => void addSlug()}>
            <Icon icon={checkingSlug ? "lucide:loader-circle" : "lucide:plus"} size={14} />
            Add
          </Button>
        </EditorFieldRow> : null}
      </div>
    </section>
  );
}

/**
 * Finds works by title, artist or slug and adds one with a click. The read is
 * bounded on the server, so this shows at most one page of matches and asks
 * for more words rather than paging through the corpus.
 */
function WorkSearch({
  busy,
  onList,
  onFound,
  onAdd,
}: {
  busy: boolean;
  onList: readonly string[];
  onFound: (candidates: readonly PlaylistCandidate[]) => void;
  onAdd: (card: PlaylistCandidate) => void;
}) {
  const searchId = useId();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlaylistCandidate[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const words = query.trim();
    if (!words) {
      setResults(null);
      setError(null);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      fetchCandidateSearch(words)
        .then((found) => {
          if (cancelled) return;
          setError(null);
          setResults(found);
          onFound(found);
        })
        .catch((failure: unknown) => {
          if (cancelled) return;
          setError(failure instanceof Error ? failure.message : "Unable to search right now.");
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, onFound]);

  const listed = new Set(onList);
  const offered = results?.filter((card) => !listed.has(card.slug)) ?? [];

  return (
    <section className="space-y-3 pt-2" aria-label="Find works">
      <EditorField label="Search works" htmlFor={searchId} description="By title, artist or slug. Only published works a playlist can hold appear.">
        <Input
          id={searchId}
          type="search"
          value={query}
          maxLength={CANDIDATE_QUERY_MAX}
          placeholder="fractal tunnel"
          disabled={busy}
          onChange={(event) => setQuery(event.target.value)}
        />
      </EditorField>
      {error ? <p className="text-sm text-dose-danger" role="alert">{error}</p> : null}
      {results === null ? null : offered.length === 0 ? (
        <p className="theme-text-faint text-sm" role="status">
          {results.length === 0 ? "No published work matches." : "Every match is already on this playlist."}
        </p>
      ) : (
        <>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="Search results">
            {offered.map((card) => (
              <li key={card.slug} className="min-w-0 space-y-2">
                <ReplicationThumb row={card} className="aspect-[4/3]" />
                <div className="flex items-start gap-2">
                  <span className="min-w-0 flex-1">
                    <span className="theme-text-primary block truncate text-sm font-medium">{card.title}</span>
                    <span className="theme-text-faint block truncate text-xs">{card.artist}</span>
                  </span>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="shrink-0"
                    disabled={busy}
                    aria-label={`Add ${card.title}`}
                    onClick={() => onAdd(card)}
                  >
                    <Icon icon="lucide:plus" size={14} />
                    Add
                  </Button>
                </div>
              </li>
            ))}
          </ul>
          {results.length >= CANDIDATE_SEARCH_LIMIT ? (
            <p className="theme-text-faint text-xs">Showing the first {CANDIDATE_SEARCH_LIMIT} matches. Add words to narrow the search.</p>
          ) : null}
        </>
      )}
    </section>
  );
}
