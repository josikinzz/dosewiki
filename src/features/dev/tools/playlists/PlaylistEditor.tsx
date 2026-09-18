"use client";

import { useId, useState } from "react";

import { ExpandButton } from "@/components/common/ExpandButton";
import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TOUCH_ICON } from "@/components/ui/touchTargets";
import {
  EditorField,
  EditorFieldRow,
  EditorNotice,
  EditorStatusPill,
  type EditorNoticeMessage,
} from "@/features/dev/components";
import { isValidReplicationSlug } from "@/features/dev/tools/replication-studio/replicationStudioModel";

import { moveSlug, playlistKeyOf, type PlaylistDraft } from "./playlistsModel";

/**
 * Rows shown before the list folds behind "Show all". A long playlist then
 * stays about one screen tall instead of pushing the Save button off the page.
 */
const COLLAPSED_ROWS = 20;

export type PlaylistEditorProps = {
  draft: PlaylistDraft;
  /** `null` while creating: the key follows the title until the first save. */
  isNew: boolean;
  isDirty: boolean;
  busy: boolean;
  /** Admin creating a playlist: the owner is part of the draft and is sent with the first save. */
  showOwner: boolean;
  /** Outcome of the last write. It sits beside the Save button so it is seen from wherever Save was pressed. */
  notice: EditorNoticeMessage | null;
  onChange: (draft: PlaylistDraft) => void;
  onSave: () => void;
  onCancel: () => void;
  saveLabel?: string;
  membershipEditable?: boolean;
  titleEditable?: boolean;
  contextual?: boolean;
};

/**
 * A title, a key, and an ordered slug list with up/down/remove controls. No
 * corpus browser: the studio's composer needs the whole replication corpus on
 * hand, which a contributor-facing tab has no reason to load. A slug pasted
 * from a replication's address is enough, and Postgres prunes anything that does
 * not resolve to a showcase-eligible work.
 */
export function PlaylistEditor({
  draft,
  isNew,
  isDirty,
  busy,
  showOwner,
  notice,
  onChange,
  onSave,
  onCancel,
  saveLabel,
  membershipEditable = true,
  titleEditable = true,
  contextual = false,
}: PlaylistEditorProps) {
  const [newSlug, setNewSlug] = useState("");
  const [slugError, setSlugError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const headingId = useId();
  const slugInputId = useId();
  const listId = useId();

  const canSave = !busy && isDirty && draft.title.trim().length > 0 && draft.key.length > 0;
  const hiddenCount = showAll ? 0 : Math.max(0, draft.slugs.length - COLLAPSED_ROWS);
  const visibleSlugs = hiddenCount > 0 ? draft.slugs.slice(0, COLLAPSED_ROWS) : draft.slugs;

  /** Applies a list change; a row that lands in the folded tail unfolds it so the edit stays visible. */
  const updateSlugs = (slugs: string[], touchedIndex: number) => {
    if (!showAll && touchedIndex >= COLLAPSED_ROWS) setShowAll(true);
    onChange({ ...draft, slugs });
  };

  const addSlug = () => {
    const slug = newSlug.trim().toLowerCase();
    if (!isValidReplicationSlug(slug)) {
      setSlugError("A replication slug is lowercase words joined by hyphens.");
      return;
    }
    if (draft.slugs.includes(slug)) {
      setSlugError(`"${slug}" is already on this playlist.`);
      return;
    }
    setSlugError(null);
    setNewSlug("");
    updateSlugs([...draft.slugs, slug], draft.slugs.length);
  };

  return (
    <section aria-labelledby={headingId} className="space-y-5">
      {/* Keep actions at the embedded pane's top, or below the standalone site header. */}
      <header className={`sticky ${contextual ? "top-0" : "top-[4.25rem]"} z-10 space-y-2 border-b border-[color:var(--editor-panel-border)] bg-[var(--editor-panel-bg)]/95 py-2 backdrop-blur`}>
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
        {notice ? <EditorNotice notice={notice} /> : null}
      </header>

      {contextual && !titleEditable ? <p className="theme-text-muted text-sm">{draft.title} <span className="break-all">({draft.key})</span></p> : <EditorFieldRow layout="twoColumn">
        <EditorField label="Name" required>
          {(control) => (
            <Input
              {...control}
              value={draft.title}
              placeholder="Classic psychedelic opener"
              maxLength={120}
              disabled={busy || !titleEditable}
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

      {showOwner ? (
        <EditorField
          label="Owner"
          description="The member who may edit this playlist; saved with it. Leave empty to keep it admin-only."
        >
          {(control) => (
            <Input
              {...control}
              type="email"
              value={draft.ownerEmail}
              placeholder="member@example.com"
              disabled={busy}
              onChange={(event) => onChange({ ...draft, ownerEmail: event.target.value })}
            />
          )}
        </EditorField>
      ) : null}

      <div className="space-y-2">
        <p className="theme-text-muted text-[11px] uppercase tracking-[0.24em]">
          Works, in order ({draft.slugs.length})
        </p>
        {draft.slugs.length === 0 ? (
          <p className="theme-text-faint text-sm">No works yet. Add a replication slug below.</p>
        ) : (
          <ol id={listId} className="border-y border-[color:var(--editor-panel-border)]" aria-label="Playlist order">
            {visibleSlugs.map((slug, index) => (
              <li
                key={slug}
                className="flex items-center gap-2 border-b border-[color:var(--editor-panel-border)] py-2 last:border-b-0"
              >
                <span className="theme-text-faint w-8 shrink-0 text-right font-mono text-xs tabular-nums">
                  {index + 1}
                </span>
                <span className="theme-text-primary min-w-0 flex-1 truncate font-mono text-sm">{slug}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className={`h-8 w-8 ${TOUCH_ICON}`}
                  disabled={busy || index === 0}
                  aria-label={`Move ${slug} up`}
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
                  aria-label={`Move ${slug} down`}
                  onClick={() => updateSlugs(moveSlug(draft.slugs, index, 1), index + 1)}
                >
                  <Icon icon="lucide:arrow-down" size={14} />
                </Button>
                {!contextual || membershipEditable ? <Button
                  type="button"
                  variant="ghostDestructive"
                  size="icon"
                  className={`h-8 w-8 ${TOUCH_ICON}`}
                  disabled={busy || !membershipEditable}
                  aria-label={`Remove ${slug}`}
                  onClick={() => updateSlugs(draft.slugs.filter((entry) => entry !== slug), index)}
                >
                  <Icon icon="lucide:x" size={14} />
                </Button> : null}
              </li>
            ))}
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

        {!contextual || membershipEditable ? <EditorFieldRow layout="actionTrailing">
          <EditorField
            id={slugInputId}
            label="Add a work"
            description="The slug from a replication's address, for example glowing-fractal-tunnel. It goes to the end of the list."
            error={slugError}
          >
            {(control) => (
              <Input
                {...control}
                value={newSlug}
                placeholder="replication-slug"
                disabled={busy || !membershipEditable}
                className="font-mono text-sm"
                onChange={(event) => {
                  setNewSlug(event.target.value);
                  if (slugError) setSlugError(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addSlug();
                  }
                }}
              />
            )}
          </EditorField>
          <Button type="button" variant="secondary" size="sm" disabled={busy || !membershipEditable || newSlug.trim().length === 0} onClick={addSlug}>
            <Icon icon="lucide:plus" size={14} />
            Add
          </Button>
        </EditorFieldRow> : null}
      </div>
    </section>
  );
}
