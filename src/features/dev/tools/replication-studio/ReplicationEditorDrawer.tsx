"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { ExpandIndicator } from "@/components/common/ExpandButton";
import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  EditorField,
  EditorPanel,
  EditorSelect,
  EditorStatusPill,
  useConfirm,
} from "@/features/dev/components";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import { EffectTagInput } from "./EffectTagInput";
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
   * `column`: the xl third column, filling the Library frame's height.
   * `sheet`: a panel over the grid's right edge at narrower widths.
   */
  placement: "column" | "sheet";
  onSaveSingle: (row: StudioRow, draft: SingleEditDraft) => void;
  /** Resolves true once the edit went through, which spends the bulk draft. */
  onApplyBulk: (rows: readonly StudioRow[], edit: BulkEdit) => Promise<boolean> | void;
  onDeselect: () => void;
  /** Reports whether the single-row or bulk draft holds unapplied changes. */
  onDirtyChange?: (dirty: boolean) => void;
  /** Opens Showcases on this replication's drug-article placements. */
  onOpenPlacement?: (row: StudioRow) => void;
};

const ROLE_OPTIONS: StudioRole[] = ["replication", "figure"];

export function draftOf(row: StudioRow): SingleEditDraft {
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

function draftsEqual(a: SingleEditDraft, b: SingleEditDraft): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

const ROLE_HELP =
  "A replication recreates an experience. A figure is an explanatory diagram or illustration; figures stay out of galleries and showcases.";

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
  showPreview = true,
  showActions = true,
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
  /** Draw the large media frame above the fields. */
  showPreview?: boolean;
  /** Draw Save and Revert under the fields; a host with its own footer turns this off. */
  showActions?: boolean;
}) {
  const [localDraft, setLocalDraft] = useState<SingleEditDraft>(() => draftOf(row));
  const draft = value ?? localDraft;
  const setDraft = (next: SingleEditDraft) => {
    setLocalDraft(next);
    onDraftChange?.(next, !draftsEqual(next, draftOf(row)));
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
      {showPreview ? <ReplicationThumb row={row} className="aspect-[4/3]" /> : null}

      <EditorField label="Title" htmlFor="studio-title">
        <Input
          id="studio-title"
          inputSize="sm"
          value={draft.title}
          onChange={(event) => setDraft({ ...draft, title: event.target.value })}
        />
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

      <EditorField label="Role" description={ROLE_HELP}>
        <RolePills value={draft.role} onChange={(role) => setDraft({ ...draft, role: (role || "replication") as StudioRole })} />
      </EditorField>

      <EditorField
        label="Other effects shown"
        htmlFor="studio-tags"
        description="Everything else this work depicts. Stored on the row; no public page reads them yet."
      >
        <EffectTagInput
          id="studio-tags"
          value={draft.effect_tags}
          options={effects}
          onChange={(next) => setDraft({ ...draft, effect_tags: next })}
        />
      </EditorField>

      <EditorField label="Credit line" htmlFor="studio-credit">
        <Textarea
          id="studio-credit"
          rows={2}
          placeholder="As it should appear beside the work"
          value={draft.credit_line ?? ""}
          onChange={(event) => setDraft({ ...draft, credit_line: event.target.value })}
        />
      </EditorField>

      {showSource ? (
        <EditorField label="Source URL" htmlFor="studio-source">
          <Input id="studio-source" type="url" value={draft.source_url ?? ""} onChange={(event) => setDraft({ ...draft, source_url: event.target.value || null })} />
        </EditorField>
      ) : null}

      {showActions ? (
        <div className="flex items-center gap-2">
          <Button type="button" variant="accent" disabled={busy} onClick={() => onSave(row, draft)}>
            {saveLabel}
          </Button>
          <Button type="button" variant="ghost" disabled={busy} onClick={() => setDraft(draftOf(row))}>
            Revert
          </Button>
        </div>
      ) : null}
    </div>
  );
}

type BulkState = {
  effectSlug: string;
  artist: string;
  role: StudioRole | "";
  addTags: string[];
};

const EMPTY_BULK: BulkState = { effectSlug: "", artist: "", role: "", addTags: [] };

function bulkEditOf(state: BulkState): BulkEdit {
  return {
    effectSlug: state.effectSlug || undefined,
    artist: state.artist.trim() || undefined,
    role: state.role || undefined,
    addEffectTags: state.addTags.length > 0 ? state.addTags : undefined,
  };
}

/** One plain line per field the bulk edit will set, for the confirm. */
function bulkChangeLines(edit: BulkEdit, effects: readonly StudioEffectOption[]): string[] {
  const name = (slug: string) => effects.find((effect) => effect.slug === slug)?.name ?? slug;
  const lines: string[] = [];
  if (edit.effectSlug) lines.push(`Effect: ${name(edit.effectSlug)}`);
  if (edit.artist) lines.push(`Artist: ${edit.artist}`);
  if (edit.role) lines.push(`Role: ${edit.role === "figure" ? "Figure" : "Replication"}`);
  if (edit.addEffectTags) lines.push(`Add effects shown: ${edit.addEffectTags.map(name).join(", ")}`);
  return lines;
}

/**
 * The bulk draft belongs to one selection. Keyed by the selected ids, it reads
 * as empty the moment the selection changes, so an old draft can never be
 * applied to a new set of works.
 */
function useBulkDraft(selected: readonly StudioRow[]) {
  const key = selected.length > 1 ? selected.map((row) => row.id).join("\n") : "";
  const [state, setState] = useState<{ key: string; value: BulkState }>({ key, value: EMPTY_BULK });
  const bulk = state.key === key ? state.value : EMPTY_BULK;
  const setBulk = (value: BulkState) => setState({ key, value });
  const dirty = Boolean(key) && bulkChangeLines(bulkEditOf(bulk), []).length > 0;
  return { bulk, setBulk, resetBulk: () => setState({ key, value: EMPTY_BULK }), dirty };
}

function BulkFields({
  rows,
  effects,
  artists,
  value,
  onChange,
}: {
  rows: readonly StudioRow[];
  effects: readonly StudioEffectOption[];
  artists: readonly string[];
  value: BulkState;
  onChange: (next: BulkState) => void;
}) {
  const effectOptions = useMemo(
    () => [
      { value: "", label: "Leave unchanged" },
      ...effects.map((effect) => ({ value: effect.slug, label: effect.name })),
    ],
    [effects],
  );

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
          value={value.effectSlug}
          options={effectOptions}
          onChange={(event) => onChange({ ...value, effectSlug: event.target.value })}
        />
      </EditorField>

      <EditorField label="Set artist for all" htmlFor="studio-bulk-artist">
        <Input
          id="studio-bulk-artist"
          inputSize="sm"
          list="studio-artist-list"
          placeholder="Leave unchanged"
          value={value.artist}
          onChange={(event) => onChange({ ...value, artist: event.target.value })}
        />
      </EditorField>
      <datalist id="studio-artist-list">
        {artists.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>

      <EditorField label="Set role for all" description={ROLE_HELP}>
        <RolePills value={value.role} onChange={(role) => onChange({ ...value, role })} includeUnchanged />
      </EditorField>

      <EditorField
        label="Add effects shown to all"
        description="Added, never replaced: the works in a selection rarely depict the same things."
      >
        <EffectTagInput
          id="studio-bulk-tags"
          value={value.addTags}
          options={effects}
          onChange={(addTags) => onChange({ ...value, addTags })}
        />
      </EditorField>
    </div>
  );
}

const KEYBOARD_HINTS: [string, string][] = [
  ["/", "search"],
  ["← ↑ → ↓", "move through the grid"],
  ["Esc", "clear the selection"],
  ["Shift + click", "select a range"],
  ["Ctrl / ⌘ + click", "add or remove one"],
];

export function KeyboardHints() {
  return (
    <ul className="space-y-1.5">
      {KEYBOARD_HINTS.map(([key, description]) => (
        <li key={key} className="flex items-center gap-2 text-sm">
          <kbd className="theme-replication-muted-panel theme-text-secondary rounded-md border border-[color:var(--editor-panel-border)] px-1.5 py-0.5 font-mono text-xs">
            {key}
          </kbd>
          <span className="theme-text-faint">{description}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * The single-row draft, owned here so the footer can sit outside the
 * scrolling fields. A corpus reload replaces the row object: the draft only
 * follows it when the subject changed, the draft was clean, or the reload is
 * the save landing (the new row equals the draft).
 */
function useSingleDraft(row: StudioRow | null) {
  const [draft, setDraft] = useState<SingleEditDraft | null>(() => (row ? draftOf(row) : null));
  const previous = useRef<StudioRow | null>(row);

  useEffect(() => {
    const before = previous.current;
    previous.current = row;
    if (!row) {
      setDraft(null);
      return;
    }
    setDraft((current) => {
      if (!current || !before || before.id !== row.id) return draftOf(row);
      const wasClean = draftsEqual(current, draftOf(before));
      const saved = draftsEqual(current, draftOf(row));
      return wasClean || saved ? draftOf(row) : current;
    });
  }, [row]);

  const dirty = Boolean(row && draft && !draftsEqual(draft, draftOf(row)));
  return { draft, setDraft, dirty };
}

/**
 * The inspector: a compact identity header, one scrolling body, and a footer
 * pinned to the bottom edge carrying the one commit for what is on screen.
 * Placement on drug articles is not edited here; it opens in Showcases.
 */
export function ReplicationEditorDrawer({
  selected,
  effects,
  artists,
  busy,
  placement,
  onSaveSingle,
  onApplyBulk,
  onDeselect,
  onDirtyChange,
  onOpenPlacement,
}: ReplicationEditorDrawerProps) {
  const single = selected.length === 1 ? selected[0] : null;
  const { draft, setDraft, dirty } = useSingleDraft(single);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [hintsOpen, setHintsOpen] = useState(false);
  const { bulk, setBulk, resetBulk, dirty: bulkDirty } = useBulkDraft(selected);
  const { confirm, dialog } = useConfirm();

  const anyDirty = dirty || bulkDirty;
  useEffect(() => {
    onDirtyChange?.(anyDirty);
  }, [anyDirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);

  const requestApplyBulk = () => {
    const targets = selected;
    const edit = bulkEditOf(bulk);
    const count = targets.length;
    confirm({
      title: `Apply to ${count} replications?`,
      description: (
        <>
          <span className="block">These changes go live on the public site for every selected work:</span>
          {bulkChangeLines(edit, effects).map((line) => (
            <span key={line} className="theme-text-primary block font-medium">
              {line}
            </span>
          ))}
        </>
      ),
      confirmLabel: `Apply to ${count}`,
      affected: targets.map((row) => row.title || row.slug),
      onConfirm: async () => {
        const applied = await onApplyBulk(targets, edit);
        if (applied) resetBulk();
      },
    });
  };

  const title = selected.length === 0
    ? "Nothing selected"
    : single
      ? single.title || "Untitled"
      : `${selected.length} replications selected`;

  return (
    <EditorPanel
      data-studio-inspector=""
      aria-label="Inspector"
      role="region"
      className={cn(
        "flex min-h-0 flex-col overflow-hidden",
        placement === "column" ? "h-full" : "h-full rounded-none border-0 bg-transparent shadow-none",
      )}
    >
      <header className="flex items-start gap-3 border-b border-[color:var(--editor-panel-border)] px-4 py-3">
        {single ? (
          <button
            type="button"
            aria-expanded={previewOpen}
            aria-label={previewOpen ? "Hide the large preview" : "Show a large preview"}
            onClick={() => setPreviewOpen((open) => !open)}
            className="shrink-0 rounded-lg"
          >
            <ReplicationThumb row={single} showGlyph={false} className="h-12 w-16" />
          </button>
        ) : null}
        <div className="min-w-0 flex-1">
          <h3 className="theme-text-primary truncate font-display text-base font-semibold leading-6">
            {title}
          </h3>
          {single ? (
            <div className="theme-text-faint flex min-w-0 items-center gap-2 text-xs">
              <span className="truncate font-mono" title="The slug is the public URL and the gallery-order key; rename it with the replication maintenance scripts.">
                {single.slug}
              </span>
              <Badge variant="secondary" className="shrink-0">{single.format}</Badge>
            </div>
          ) : selected.length === 0 ? (
            <p className="theme-text-faint text-xs">Select a work to edit it. Drop files anywhere to upload.</p>
          ) : (
            <p className="theme-text-faint text-xs">Fields left unchanged keep each work&apos;s own value.</p>
          )}
        </div>
        {selected.length > 0 ? (
          <Button
            type="button"
            variant="iconClose"
            size="icon"
            className="-mr-1 size-8"
            aria-label={placement === "sheet" ? "Close the inspector" : "Clear the selection"}
            title="Esc"
            onClick={onDeselect}
          >
            <Icon icon="lucide:x" size={16} />
          </Button>
        ) : null}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
        {selected.length === 0 ? (
          // Idle help stays one line tall until asked for.
          <div className="space-y-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-expanded={hintsOpen}
              aria-controls="studio-inspector-hints"
              onClick={() => setHintsOpen((open) => !open)}
            >
              <Icon icon="lucide:keyboard" size={15} />
              Keyboard shortcuts
              <ExpandIndicator isExpanded={hintsOpen} />
            </Button>
            {hintsOpen ? (
              <div id="studio-inspector-hints">
                <KeyboardHints />
              </div>
            ) : null}
          </div>
        ) : single && draft ? (
          <div className="space-y-6">
            {previewOpen ? <ReplicationThumb row={single} className="aspect-[4/3]" enableVideoPreview /> : null}
            <ReplicationSingleEditor
              row={single}
              effects={effects}
              artists={artists}
              busy={busy}
              value={draft}
              onDraftChange={(next) => setDraft(next)}
              onSave={onSaveSingle}
              showPreview={false}
              showActions={false}
            />
            {onOpenPlacement ? (
              <section className="space-y-2 border-t border-[color:var(--editor-panel-border)] pt-4">
                <h4 className="theme-text-secondary text-sm font-medium">Drug articles</h4>
                <p className="theme-text-faint text-sm">
                  Which drug articles show this work, and in what order, is curated in Showcases.
                </p>
                <Button type="button" variant="secondary" size="sm" onClick={() => onOpenPlacement(single)}>
                  <Icon icon="lucide:images" size={15} />
                  Manage in Showcases
                </Button>
              </section>
            ) : null}
          </div>
        ) : (
          <BulkFields rows={selected} effects={effects} artists={artists} value={bulk} onChange={setBulk} />
        )}
      </div>

      {single && draft ? (
        <footer className="flex items-center gap-2 border-t border-[color:var(--editor-panel-border)] px-4 py-3">
          <Button type="button" variant="accent" size="sm" disabled={busy || !dirty} onClick={() => onSaveSingle(single, draft)}>
            {busy ? "Saving…" : "Save"}
          </Button>
          <Button type="button" variant="ghost" size="sm" disabled={busy || !dirty} onClick={() => setDraft(draftOf(single))}>
            Revert
          </Button>
          <span className="flex-1" />
          <EditorStatusPill tone={dirty ? "warning" : "neutral"}>
            {dirty ? "Unsaved changes" : "Saved"}
          </EditorStatusPill>
        </footer>
      ) : selected.length > 1 ? (
        <footer className="flex items-center gap-2 border-t border-[color:var(--editor-panel-border)] px-4 py-3">
          <Button
            type="button"
            variant="accent"
            size="sm"
            disabled={busy || !bulkDirty}
            onClick={requestApplyBulk}
          >
            Apply to {selected.length}
          </Button>
          <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={onDeselect}>
            Deselect
          </Button>
        </footer>
      ) : null}
      {dialog}
    </EditorPanel>
  );
}
