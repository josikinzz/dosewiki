"use client";
/**
 * Translator's notes in the article reader: under each section, a translator
 * adds a note for local readers, written in the locale only. Save draft,
 * Approve saved draft, and Restore as draft work like corrections. Readers
 * see approved notes in a labelled box; a note whose section left the English
 * is orphaned, hidden from readers, and listed in the Review Inbox.
 */
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { EditorField, EditorStatusPill, Notice, type EditorStatusPillTone } from "@/features/dev/components";
import type { ReviewHistoryEntry } from "@lib/translation/reviewTypes";
import {
  TRANSLATOR_NOTE_MAX_LENGTH,
  type TranslatorNotePacket,
  type TranslatorNoteRow,
  type TranslatorNoteStatus,
} from "@server/translation/translatorNoteTypes";
import { formatReviewReason } from "../../../../../lib/translation/reviewReason";
import { languageLabel } from "./glossaryModel";

const ENDPOINT = "/api/dev/translation-note";

const MARKS: Record<Exclude<TranslatorNoteStatus, "empty">, { label: string; tone: EditorStatusPillTone }> = {
  draft: { label: "Draft", tone: "warning" },
  approved: { label: "Approved, shown to readers", tone: "success" },
  orphaned: { label: "Orphaned: section removed from the English", tone: "danger" },
};

export type TranslatorNotesState = {
  locale: string;
  packet: TranslatorNotePacket | null;
  /** The section a deep link asked to open, once. */
  requested: string | null;
  reload: () => Promise<void>;
};

function isPacket(value: unknown): value is TranslatorNotePacket {
  return Boolean(value && typeof value === "object" && Array.isArray((value as TranslatorNotePacket).sections));
}

/** Loads the notes of the article open in the reader; reloads whenever the reader reloads its source. */
export function useTranslatorNotes(locale: string, slug: string | null | undefined, sourceVersion?: string): TranslatorNotesState {
  const [packet, setPacket] = useState<TranslatorNotePacket | null>(null);
  const [requested, setRequested] = useState<string | null>(null);
  const reload = useCallback(async () => {
    if (!slug) { setPacket(null); return; }
    try {
      const response = await fetch(`${ENDPOINT}?${new URLSearchParams({ locale, kind: "article", slug })}`);
      const data: unknown = await response.json();
      // A reader without the notes surface keeps working; the notes simply stay hidden.
      setPacket(response.ok && isPacket(data) ? data : null);
    } catch {
      setPacket(null);
    }
  }, [locale, slug]);
  useEffect(() => { void reload(); }, [reload, sourceVersion]);
  useEffect(() => { setRequested(new URLSearchParams(window.location.search).get("translationNote")); }, []);
  return { locale, packet, requested, reload };
}

function NoteEditor({ state, row, onClose }: { state: TranslatorNotesState; row: TranslatorNoteRow; onClose: () => void }) {
  const formId = useId();
  const { locale, packet } = state;
  const [body, setBody] = useState(row.draft ?? row.approved ?? "");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), [notice, setNotice] = useState("");
  const [history, setHistory] = useState<ReviewHistoryEntry[]>([]);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const loadHistory = useCallback(async () => {
    if (!packet) return;
    try {
      const response = await fetch(`${ENDPOINT}?${new URLSearchParams({ locale, kind: "article", slug: packet.slug, history: row.section })}`);
      const data = await response.json();
      if (response.ok) setHistory(Array.isArray(data.history) ? data.history : []);
    } catch {
      setHistory([]);
    }
  }, [locale, packet, row.section]);
  useEffect(() => { void loadHistory(); bodyRef.current?.focus(); }, [loadHistory]);
  async function mutate(action: "save" | "approve" | "restore", restoreRevision?: number) {
    if (!packet) return;
    setBusy(true);
    setError(null);
    setNotice("");
    try {
      const response = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ locale, kind: "article", slug: packet.slug, section: row.section, expectedRevision: row.revision, action, body, reason, restoreRevision }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to save the note.");
      const incomplete = result.publication?.some((receipt: { status: string }) => receipt.status !== "accepted");
      setNotice(action === "approve"
        ? incomplete ? "Approved, but the public page may not show it yet. Ask an admin to publish it again." : "Approved for this section."
        : "Draft saved. Readers do not see it until it is approved.");
      if (action === "restore" && result.entry?.draft?.target) setBody(result.entry.draft.target);
      await state.reload();
      await loadHistory();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save the note.");
    } finally {
      setBusy(false);
    }
  }
  const approvable = Boolean(row.draft) && body === row.draft && reason.trim().length > 0;
  return (
    <div className="space-y-3">
      <EditorField htmlFor={`${formId}-body`} label="Translator's note" description={`Write in ${languageLabel(locale)} only. Readers see it in a labelled box stating it is not in the English original. Notes are never used for translation or shown in another language.`}>
        <Textarea id={`${formId}-body`} ref={bodyRef} lang={locale} dir="auto" value={body} onChange={(e) => setBody(e.target.value)} disabled={busy} maxLength={TRANSLATOR_NOTE_MAX_LENGTH} className="[field-sizing:content] max-h-[70vh] min-h-20 text-[16px] md:text-sm" />
      </EditorField>
      <EditorField htmlFor={`${formId}-reason`} label="Reason" description="Why readers here need this. Recorded in the note's history.">
        <Input id={`${formId}-reason`} inputSize="sm" value={reason} onChange={(e) => setReason(e.target.value)} disabled={busy} maxLength={1000} />
      </EditorField>
      {error ? <Notice tone="danger" placement="inline" message={error} dismiss={() => setError(null)} /> : null}
      {notice ? <p role="status" className="text-sm text-[color:var(--theme-success-text)]">{notice}</p> : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant={!approvable && body.trim() && reason.trim() && !busy ? "accent" : "outline"} disabled={busy || !body.trim() || !reason.trim()} onClick={() => void mutate("save")}>Save draft</Button>
        <Button size="sm" variant={approvable && !busy ? "accent" : "outline"} disabled={busy || !approvable} onClick={() => void mutate("approve")}>Approve saved draft</Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={onClose}>Close note</Button>
        {!reason.trim() ? <span className="theme-text-muted text-xs">A reason is needed to save or restore.</span> : null}
      </div>
      {history.length ? <>
        <h5 className="type-meta-label theme-text-muted">Note history</h5>
        <ul className="theme-dev-link-list">{history.map((h) => <li key={h.revision} className="theme-text-secondary flex flex-wrap items-center gap-2 py-2 text-sm"><span>Revision {h.revision}: {h.action} by {h.actor}. {formatReviewReason(h.reason)}</span><Button size="sm" variant="outline" disabled={busy || !reason.trim()} onClick={() => void mutate("restore", h.revision)}>Restore as draft</Button></li>)}</ul>
      </> : null}
    </div>
  );
}

function NoteSection({ state, row }: { state: TranslatorNotesState; row: TranslatorNoteRow }) {
  const [open, setOpen] = useState(false);
  const deepLinked = useRef(false);
  useEffect(() => {
    if (deepLinked.current || state.requested !== row.section || row.status === "orphaned") return;
    deepLinked.current = true;
    setOpen(true);
  }, [state.requested, row.section, row.status]);
  const mark = row.status === "empty" ? null : MARKS[row.status];
  const hasNote = row.draft !== null || row.approved !== null;
  // An empty section offers one quiet line, so the article keeps its rhythm; a note that exists reads as a note.
  if (!hasNote && row.status !== "orphaned" && !open) {
    return (
      <div role="group" aria-label={`Translator's note: ${row.label}`} className="md:pl-[calc(50%+0.75rem)]">
        <Button size="sm" variant="ghost" className="theme-text-muted -ml-2 text-xs" aria-label={`Add translator's note under ${row.label}`} onClick={() => setOpen(true)}>
          <Icon icon="lucide:plus" size={13} />
          Add translator&apos;s note
        </Button>
      </div>
    );
  }
  return (
    <div className="min-w-0 space-y-2 break-words rounded-card border border-dashed border-[color:var(--editor-panel-border)] p-3" role="group" aria-label={`Translator's note: ${row.label}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="theme-text-muted inline-flex items-center gap-1.5 text-xs"><Icon icon="lucide:sticky-note" size={13} />Translator&apos;s note · {row.label}</span>
        {mark ? <EditorStatusPill tone={mark.tone} inline>{mark.label}</EditorStatusPill> : null}
      </div>
      {row.approved !== null ? <p lang={state.locale} dir="auto" className="theme-text-primary whitespace-pre-wrap">{row.approved}</p> : null}
      {row.draft !== null ? <p className="theme-text-secondary whitespace-pre-wrap text-sm">Draft: <span lang={state.locale} dir="auto">{row.draft}</span></p> : null}
      {row.status === "orphaned"
        ? <p className="theme-text-secondary text-sm">This section is no longer in the English article, so readers do not see this note.</p>
        : open
          ? <NoteEditor state={state} row={row} onClose={() => setOpen(false)} />
          : <Button size="sm" variant="outline" aria-label={`${hasNote ? "Edit" : "Add"} translator's note under ${row.label}`} onClick={() => setOpen(true)}>{hasNote ? "Edit translator's note" : "Add translator's note"}</Button>}
    </div>
  );
}

/**
 * Note affordances for one place in the reader: `afterRowId` renders the
 * sections whose last paragraph is that row; `rest` renders sections without
 * a paragraph in the reader and orphaned notes.
 */
export function TranslatorNoteSlot({ state, afterRowId, rest = false }: { state: TranslatorNotesState; afterRowId?: string; rest?: boolean }) {
  const rows = state.packet?.sections.filter((row) => rest ? row.afterSegmentId === null : row.afterSegmentId === afterRowId) ?? [];
  if (!rows.length) return null;
  return <div className="space-y-2">{rows.map((row) => <NoteSection key={row.section} state={state} row={row} />)}</div>;
}
