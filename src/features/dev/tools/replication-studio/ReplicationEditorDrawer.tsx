"use client";

import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  EditorField,
  EditorPanel,
  EditorPanelBody,
  EditorPanelHeader,
  EditorSelect,
} from "@/features/dev/components";
import { Badge } from "@/components/ui/badge";

import { EffectTagInput } from "./EffectTagInput";
import { ReplicationAssociationsPanel } from "./ReplicationAssociationsPanel";
import { ReplicationThumb } from "./ReplicationThumb";
import {
  NO_EFFECT_KEY,
  type StudioEffectOption,
  type StudioRole,
  type StudioRow,
} from "./replicationStudioModel";

export type SingleEditDraft = {
  title: string;
  artist: string;
  role: StudioRole;
  effect_slug: string | null;
  credit_line: string | null;
  effect_tags: string[];
  source_url?: string | null;
};

export type BulkEdit = {
  effectSlug?: string;
  artist?: string;
  role?: StudioRole;
  addEffectTags?: string[];
};

export type ReplicationEditorDrawerProps = {
  selected: readonly StudioRow[];
  effects: readonly StudioEffectOption[];
  artists: readonly string[];
  busy: boolean;
  /**
   * `aside`: the xl third column, pinned beside the grid and scrolling on its
   * own. `below`: a full-width panel under the grid box at narrower widths,
   * flowing with the page.
   */
  placement: "aside" | "below";
  onSaveSingle: (row: StudioRow, draft: SingleEditDraft) => void;
  onApplyBulk: (rows: readonly StudioRow[], edit: BulkEdit) => void;
  onDeselect: () => void;
};

const ROLE_OPTIONS: StudioRole[] = ["replication", "figure"];

function draftOf(row: StudioRow): SingleEditDraft {
  return {
    title: row.title,
    artist: row.artist,
    role: row.role,
    effect_slug: row.effect_slug,
    credit_line: row.credit_line,
    effect_tags: [...row.effect_tags],
    source_url: row.source_url ?? null,
  };
}

function RolePills({
  value,
  onChange,
  includeUnchanged = false,
}: {
  value: StudioRole | "";
  onChange: (role: StudioRole | "") => void;
  includeUnchanged?: boolean;
}) {
  const options: (StudioRole | "")[] = includeUnchanged ? ["", ...ROLE_OPTIONS] : ROLE_OPTIONS;
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((option) => (
        <Button
          key={option || "unchanged"}
          type="button"
          size="pill"
          variant={option === value ? "pillActive" : "ghostPill"}
          aria-pressed={option === value}
          onClick={() => onChange(option)}
        >
          {option === "" ? "Unchanged" : option === "figure" ? "Figure" : "Replication"}
        </Button>
      ))}
    </div>
  );
}

export function ReplicationSingleEditor({
  row,
  effects,
  artists,
  busy,
  onSave,
  onDraftChange,
  showSource = false,
  saveLabel = "Save",
  value,
}: {
  row: StudioRow;
  effects: readonly StudioEffectOption[];
  artists: readonly string[];
  busy: boolean;
  onSave: (row: StudioRow, draft: SingleEditDraft) => void;
  onDraftChange?: (draft: SingleEditDraft, dirty: boolean) => void;
  showSource?: boolean;
  saveLabel?: string;
  value?: SingleEditDraft;
}) {
  const [localDraft, setLocalDraft] = useState<SingleEditDraft>(() => draftOf(row));
  const draft = value ?? localDraft;
  const setDraft = (next: SingleEditDraft) => {
    setLocalDraft(next);
    onDraftChange?.(next, JSON.stringify(next) !== JSON.stringify(draftOf(row)));
  };

  // A new selection is a new subject, not an edit of the current one.
  useEffect(() => {
    setLocalDraft(draftOf(row));
  }, [row]);


  const effectOptions = useMemo(
    () => [
      { value: NO_EFFECT_KEY, label: "No owning effect" },
      ...effects.map((effect) => ({ value: effect.slug, label: effect.name })),
    ],
    [effects],
  );

  return (
    <div className="space-y-4">
      <ReplicationThumb row={row} className="aspect-[4/3]" />

      <EditorField label="Title" htmlFor="studio-title">
        <Input
          id="studio-title"
          inputSize="sm"
          value={draft.title}
          onChange={(event) => setDraft({ ...draft, title: event.target.value })}
        />
      </EditorField>

      <EditorField label="Slug (read-only)" description="Rename slugs with the replication maintenance scripts: the slug is the public URL and the gallery-order key.">
        <div className="flex items-center gap-2 rounded-xl border border-[color:var(--editor-panel-border)] theme-replication-field px-3 py-2">
          <span className="theme-text-secondary min-w-0 flex-1 truncate font-mono text-xs">{row.slug}</span>
          <Badge variant="secondary">{row.format}</Badge>
        </div>
      </EditorField>

      <EditorField label="Artist" htmlFor="studio-artist">
        <Input
          id="studio-artist"
          inputSize="sm"
          list="studio-artist-list"
          value={draft.artist}
          onChange={(event) => setDraft({ ...draft, artist: event.target.value })}
        />
      </EditorField>
      <datalist id="studio-artist-list">
        {artists.map((artist) => (
          <option key={artist} value={artist} />
        ))}
      </datalist>

      <EditorField label="Role">
        <RolePills value={draft.role} onChange={(role) => setDraft({ ...draft, role: (role || "replication") as StudioRole })} />
      </EditorField>

      <EditorField label="Primary effect" htmlFor="studio-effect">
        <EditorSelect
          id="studio-effect"
          value={draft.effect_slug ?? NO_EFFECT_KEY}
          options={effectOptions}
          onChange={(event) =>
            setDraft({
              ...draft,
              effect_slug: event.target.value === NO_EFFECT_KEY ? null : event.target.value,
            })
          }
        />
      </EditorField>

      <EditorField
        label="Subjective effect tags"
        htmlFor="studio-tags"
        description="Everything else this asset depicts. Stored on the row; no public surface reads them yet."
      >
        <EffectTagInput
          id="studio-tags"
          value={draft.effect_tags}
          options={effects}
          onChange={(next) => setDraft({ ...draft, effect_tags: next })}
        />
      </EditorField>

      <EditorField label="Rights / credit" htmlFor="studio-credit">
        <Textarea
          id="studio-credit"
          rows={3}
          placeholder="Credit line as it should appear beside the work"
          value={draft.credit_line ?? ""}
          onChange={(event) => setDraft({ ...draft, credit_line: event.target.value })}
        />
      </EditorField>

      {showSource ? (
        <EditorField label="Source URL" htmlFor="studio-source">
          <Input id="studio-source" type="url" value={draft.source_url ?? ""} onChange={(event) => setDraft({ ...draft, source_url: event.target.value || null })} />
        </EditorField>
      ) : null}

      <div className="flex items-center gap-2">
        <Button type="button" variant="accent" disabled={busy} onClick={() => onSave(row, draft)}>
          {saveLabel}
        </Button>
        <Button type="button" variant="ghost" disabled={busy} onClick={() => setDraft(draftOf(row))}>
          Revert
        </Button>
      </div>
    </div>
  );
}

function BulkEditor({
  rows,
  effects,
  artists,
  busy,
  onApply,
  onDeselect,
}: {
  rows: readonly StudioRow[];
  effects: readonly StudioEffectOption[];
  artists: readonly string[];
  busy: boolean;
  onApply: (rows: readonly StudioRow[], edit: BulkEdit) => void;
  onDeselect: () => void;
}) {
  const [effectSlug, setEffectSlug] = useState("");
  const [artist, setArtist] = useState("");
  const [role, setRole] = useState<StudioRole | "">("");
  const [addTags, setAddTags] = useState<string[]>([]);

  const effectOptions = useMemo(
    () => [
      { value: "", label: "Leave unchanged" },
      ...effects.map((effect) => ({ value: effect.slug, label: effect.name })),
    ],
    [effects],
  );

  const nothingToApply = !effectSlug && !artist.trim() && !role && addTags.length === 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {rows.slice(0, 11).map((row) => (
          <ReplicationThumb key={row.id} row={row} showGlyph={false} className="size-12" />
        ))}
        {rows.length > 11 ? (
          <span className="theme-text-faint flex size-12 items-center justify-center rounded-lg border border-[color:var(--editor-panel-border)] font-mono text-xs">
            +{rows.length - 11}
          </span>
        ) : null}
      </div>

      <EditorField label="Set effect for all" htmlFor="studio-bulk-effect">
        <EditorSelect
          id="studio-bulk-effect"
          value={effectSlug}
          options={effectOptions}
          onChange={(event) => setEffectSlug(event.target.value)}
        />
      </EditorField>

      <EditorField label="Set artist for all" htmlFor="studio-bulk-artist">
        <Input
          id="studio-bulk-artist"
          inputSize="sm"
          list="studio-artist-list"
          placeholder="Leave unchanged"
          value={artist}
          onChange={(event) => setArtist(event.target.value)}
        />
      </EditorField>
      <datalist id="studio-artist-list">
        {artists.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>

      <EditorField label="Set role for all">
        <RolePills value={role} onChange={setRole} includeUnchanged />
      </EditorField>

      <EditorField
        label="Add tags to all"
        description="Tags are added, never replaced: a selection's rows rarely depict the same things."
      >
        <EffectTagInput id="studio-bulk-tags" value={addTags} options={effects} onChange={setAddTags} />
      </EditorField>

      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="accent"
          disabled={busy || nothingToApply}
          onClick={() =>
            onApply(rows, {
              effectSlug: effectSlug || undefined,
              artist: artist.trim() || undefined,
              role: role || undefined,
              addEffectTags: addTags.length > 0 ? addTags : undefined,
            })
          }
        >
          Apply to {rows.length}
        </Button>
        <Button type="button" variant="ghost" disabled={busy} onClick={onDeselect}>
          Deselect
        </Button>
      </div>
    </div>
  );
}

const KEYBOARD_HINTS: [string, string][] = [
  ["/", "focus search"],
  ["Esc", "clear selection"],
  ["← →", "move selection"],
  ["Shift + click", "select a range"],
  ["Ctrl / ⌘ + click", "toggle one"],
];

/** The editor drawer: empty coach, single-row form, or bulk panel. */
export function ReplicationEditorDrawer({
  selected,
  effects,
  artists,
  busy,
  placement,
  onSaveSingle,
  onApplyBulk,
  onDeselect,
}: ReplicationEditorDrawerProps) {
  const eyebrow = selected.length === 0
    ? "Editor"
    : selected.length === 1
      ? "Editing 1 replication"
      : "Bulk edit";
  const title = selected.length === 0
    ? "Nothing selected"
    : selected.length === 1
      ? selected[0].title || "Untitled"
      : `${selected.length} replications selected`;

  return (
    <EditorPanel
      className={
        placement === "aside" ? "sticky top-4 max-h-[calc(100vh-2rem)] overflow-y-auto" : undefined
      }
    >
      <EditorPanelHeader eyebrow={eyebrow} title={title} />
      <EditorPanelBody>
        {selected.length === 0 ? (
          <div className="space-y-4">
            <p className="theme-text-muted text-sm">
              Select a replication to edit it. Drag files anywhere to upload.
            </p>
            <ul className="space-y-1.5">
              {KEYBOARD_HINTS.map(([key, description]) => (
                <li key={key} className="flex items-center gap-2 text-sm">
                  <kbd className="theme-replication-muted-panel theme-text-secondary rounded-md border border-[color:var(--editor-panel-border)] px-1.5 py-0.5 font-mono text-[11px]">
                    {key}
                  </kbd>
                  <span className="theme-text-faint">{description}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : selected.length === 1 ? (
          <div className="space-y-5">
            <ReplicationSingleEditor
              key={selected[0].id}
              row={selected[0]}
              effects={effects}
              artists={artists}
              busy={busy}
              onSave={onSaveSingle}
            />
            {/* Associations are derived per replication, so this belongs to
                single-edit mode only: a bulk selection has no one answer. */}
            <div className="border-t border-[color:var(--editor-panel-border)] pt-5">
              <ReplicationAssociationsPanel row={selected[0]} />
            </div>
          </div>
        ) : (
          <BulkEditor
            rows={selected}
            effects={effects}
            artists={artists}
            busy={busy}
            onApply={onApplyBulk}
            onDeselect={onDeselect}
          />
        )}
      </EditorPanelBody>
    </EditorPanel>
  );
}
