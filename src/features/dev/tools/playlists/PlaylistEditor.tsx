"use client";

import { useId, useState } from "react";

import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EditorField, EditorFieldRow, EditorStatusPill } from "@/features/dev/components";
import { isValidReplicationSlug } from "@/features/dev/tools/replication-studio/replicationStudioModel";

import { moveSlug, playlistKeyOf, type PlaylistDraft } from "./playlistsModel";

export type PlaylistEditorProps = {
  draft: PlaylistDraft;
  /** `null` while creating: the key follows the title until the first save. */
  isNew: boolean;
  isDirty: boolean;
  busy: boolean;
  /** Admin only: shows the owner field. On an existing playlist it saves through its own action. */
  showOwner: boolean;
  onChange: (draft: PlaylistDraft) => void;
  onSave: () => void;
  onCancel: () => void;
  onAssignOwner?: () => void;
};

/**
 * A title, a key, and an ordered slug list with up/down/remove controls. No
 * corpus browser: the studio's composer needs the whole replication corpus on
 * hand, which a contributor-facing tab has no reason to load. A slug pasted
 * from a replication's address is enough, and Convex prunes anything that does
 * not resolve to a showcase-eligible work.
 */
export function PlaylistEditor({
  draft,
  isNew,
  isDirty,
  busy,
  showOwner,
  onChange,
  onSave,
  onCancel,
  onAssignOwner,
}: PlaylistEditorProps) {
  const [newSlug, setNewSlug] = useState("");
  const [slugError, setSlugError] = useState<string | null>(null);
  const headingId = useId();
  const slugInputId = useId();

  const canSave = !busy && isDirty && draft.title.trim().length > 0 && draft.key.length > 0;

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
    onChange({ ...draft, slugs: [...draft.slugs, slug] });
  };

  return (
    <section aria-labelledby={headingId} className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={headingId} className="theme-text-primary text-base font-semibold">
          {isNew ? "New playlist" : `Edit ${draft.title || draft.key}`}
        </h3>
        <div className="flex items-center gap-2">
          {isDirty ? <EditorStatusPill tone="warning">Unsaved</EditorStatusPill> : null}
          <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={onCancel}>
            <Icon icon="lucide:x" size={14} />
            {isDirty ? "Discard" : "Close"}
          </Button>
          <Button type="button" variant="accent" size="sm" disabled={!canSave} onClick={onSave}>
            <Icon icon={busy ? "lucide:loader-circle" : "lucide:save"} size={14} />
            {isNew ? "Create playlist" : "Save changes"}
          </Button>
        </div>
      </div>

      <EditorFieldRow layout="twoColumn">
        <EditorField label="Name" required>
          {(control) => (
            <Input
              {...control}
              value={draft.title}
              placeholder="Classic psychedelic opener"
              maxLength={120}
              disabled={busy}
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
      </EditorFieldRow>

      {showOwner ? (
        <EditorFieldRow layout="actionTrailing">
          <EditorField
            label="Owner"
            description="The member who may edit this playlist. Leave empty to keep it admin-only."
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
          {!isNew && onAssignOwner ? (
            <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={onAssignOwner}>
              <Icon icon="lucide:user-check" size={14} />
              Assign owner
            </Button>
          ) : null}
        </EditorFieldRow>
      ) : null}

      <div className="space-y-2">
        <p className="theme-text-muted text-[11px] uppercase tracking-[0.24em]">
          Works, in order ({draft.slugs.length})
        </p>
        {draft.slugs.length === 0 ? (
          <p className="theme-text-faint text-sm">No works yet. Add a replication slug below.</p>
        ) : (
          <ol className="border-y border-[color:var(--editor-panel-border)]" aria-label="Playlist order">
            {draft.slugs.map((slug, index) => (
              <li
                key={slug}
                className="flex items-center gap-2 border-b border-[color:var(--editor-panel-border)] py-2 last:border-b-0"
              >
                <span className="theme-text-faint w-6 shrink-0 text-right font-mono text-xs">{index + 1}</span>
                <span className="theme-text-primary min-w-0 flex-1 truncate font-mono text-sm">{slug}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  disabled={busy || index === 0}
                  aria-label={`Move ${slug} up`}
                  onClick={() => onChange({ ...draft, slugs: moveSlug(draft.slugs, index, -1) })}
                >
                  <Icon icon="lucide:arrow-up" size={14} />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  disabled={busy || index === draft.slugs.length - 1}
                  aria-label={`Move ${slug} down`}
                  onClick={() => onChange({ ...draft, slugs: moveSlug(draft.slugs, index, 1) })}
                >
                  <Icon icon="lucide:arrow-down" size={14} />
                </Button>
                <Button
                  type="button"
                  variant="ghostDestructive"
                  size="icon"
                  className="h-8 w-8"
                  disabled={busy}
                  aria-label={`Remove ${slug}`}
                  onClick={() => onChange({ ...draft, slugs: draft.slugs.filter((entry) => entry !== slug) })}
                >
                  <Icon icon="lucide:x" size={14} />
                </Button>
              </li>
            ))}
          </ol>
        )}

        <EditorFieldRow layout="actionTrailing">
          <EditorField
            id={slugInputId}
            label="Add a work"
            description="The slug from a replication's address, for example glowing-fractal-tunnel."
            error={slugError}
          >
            {(control) => (
              <Input
                {...control}
                value={newSlug}
                placeholder="replication-slug"
                disabled={busy}
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
          <Button type="button" variant="secondary" size="sm" disabled={busy || newSlug.trim().length === 0} onClick={addSlug}>
            <Icon icon="lucide:plus" size={14} />
            Add
          </Button>
        </EditorFieldRow>
      </div>
    </section>
  );
}
