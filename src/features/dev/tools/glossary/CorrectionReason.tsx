"use client";
/**
 * The reason control and approval actions every surface of the translation
 * workbench shares (terms, interface text, article paragraphs, style guide):
 * four reason chips with an optional note, one save-then-approve button set,
 * the glossary conflict notice ("Fine here" or "Update the glossary"), and a
 * glossary proposal that saves a draft and never approves it.
 *
 * The one rule: changed wording needs a reason kind before it is saved;
 * approving saved wording as it stands needs none.
 */
import { useId, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EditorSelect } from "@/features/dev/components";
import { CORRECTION_REASON_KINDS, CORRECTION_REASON_LABEL, type CorrectionReasonKind, type ReviewReason } from "../../../../../lib/translation/reviewReason";
import { findGlossaryConflicts, glossaryConflictMessage, type GlossaryMention } from "../../../../../lib/translation/glossaryConflicts";
import { editTerm } from "./glossaryModel";

/** What the reviewer has chosen so far. `exceptions` hold only for the segment named by `segment`. */
export type CorrectionDraft = { kind: CorrectionReasonKind | null; note: string; segment: string; exceptions: string[] };
export const EMPTY_CORRECTION: CorrectionDraft = { kind: null, note: "", segment: "", exceptions: [] };

/** The request's reason, or null until a kind is chosen. */
export function correctionReason(draft: CorrectionDraft): ReviewReason | null {
  return draft.kind ? { kind: draft.kind, note: draft.note.trim() } : null;
}
/** "Fine here" choices recorded for this segment; another segment starts with none. */
export function exceptionsFor(draft: CorrectionDraft, segment: string): string[] {
  return draft.segment === segment ? draft.exceptions : [];
}
/** Approved terms the English mentions that the wording drops and the reviewer has not excused. */
export function openConflicts(source: string, target: string, mentions: readonly GlossaryMention[] | undefined, exceptions: readonly string[]): GlossaryMention[] {
  return findGlossaryConflicts(source, target, (mentions ?? []).filter((row) => row.approved), exceptions);
}

/** The four reason chips; one is chosen at a time. */
export function ReasonKindChips({ value, onChange, disabled, label = "Reason" }: { value: CorrectionReasonKind | null; onChange: (kind: CorrectionReasonKind) => void; disabled?: boolean; label?: string }) {
  return <div className="flex flex-col items-start gap-x-2 gap-y-1 sm:flex-row sm:flex-wrap sm:items-center">
    <span className="theme-text-secondary text-xs">{label}</span>
    <div className="grid grid-cols-2 gap-1 rounded-card border border-[color:var(--editor-panel-border)] bg-[var(--editor-panel-bg-subtle)] p-1 sm:inline-grid sm:grid-cols-4">
      {CORRECTION_REASON_KINDS.map((kind) => <Button key={kind} type="button" size="pill" variant={value === kind ? "pillActive" : "ghostPill"} aria-pressed={value === kind} disabled={disabled}
        className="h-8 rounded-control px-2.5 text-xs [@media(pointer:coarse)]:min-h-11"
        onClick={() => onChange(kind)}>{CORRECTION_REASON_LABEL[kind]}</Button>)}
    </div>
  </div>;
}

/** What the reason control holds: a kind once chosen, and an optional note. */
export type ReasonDraft = { kind: CorrectionReasonKind | null; note: string };
export const EMPTY_REASON: ReasonDraft = { kind: null, note: "" };
export const REASON_NEEDED = "Choose a reason to save this change.";

/**
 * The one reason control: the four kinds and an optional note, the same on
 * every surface. `needed` says in visible text why saving waits, so a
 * disabled button never has to explain itself in a tooltip.
 */
export function ReasonPicker({ value, onChange, disabled, needed = false, noteLabel = "Note (optional)", noteAriaLabel }: {
  value: ReasonDraft;
  onChange: (next: ReasonDraft) => void;
  disabled?: boolean;
  /** Changed wording is waiting on a kind. */
  needed?: boolean;
  noteLabel?: string;
  noteAriaLabel?: string;
}) {
  const id = useId();
  return <div role="group" aria-label="Reason" className="space-y-2">
    <ReasonKindChips value={value.kind} onChange={(kind) => onChange({ ...value, kind })} disabled={disabled} />
    <div className="space-y-1">
      <label htmlFor={`${id}-note`} className="theme-text-secondary text-xs">{noteLabel}</label>
      <Input id={`${id}-note`} inputSize="sm" aria-label={noteAriaLabel} value={value.note} maxLength={1000} disabled={disabled} placeholder="Why, in a few words" onChange={(event) => onChange({ ...value, note: event.target.value })} />
    </div>
    {needed && !value.kind ? <p className="theme-text-faint text-xs">{REASON_NEEDED}</p> : null}
  </div>;
}

/**
 * The reason a write sends: the chosen kind and note, or, when saved wording
 * is approved or restored as it stands, a plain note saying so. The routes
 * that record history need one or the other.
 */
export function reasonFor(draft: ReasonDraft, fallback: string): ReviewReason {
  return draft.kind ? { kind: draft.kind, note: draft.note.trim() } : { kind: "unspecified", note: draft.note.trim() || fallback };
}

/**
 * The one approval action. Changed wording offers Save and approve (the main
 * action) and Save draft; saved wording waiting for review offers Approve. A
 * translator may approve their own edits. `extra` is a surface's own main
 * action when there is nothing to approve (Confirm on a live, never checked
 * term); `children` follow the save buttons.
 */
export function ApprovalActions({ changed, canSave = changed, approvable, blocked = false, busy = false, label, onSave, onSaveAndApprove, onApprove, extra, quiet = false, children }: {
  /** The wording differs from what is saved. */
  changed: boolean;
  /** Save draft applies; defaults to `changed`. */
  canSave?: boolean;
  /** A saved draft is waiting and nothing unsaved sits on top of it. */
  approvable: boolean;
  /** Saving waits on a reason or an open glossary conflict; the surface says which in text. */
  blocked?: boolean;
  busy?: boolean;
  label?: string;
  onSave: () => void;
  onSaveAndApprove: () => void;
  onApprove: () => void;
  extra?: ReactNode;
  /**
   * In a list of many items, a clean item's Approve is outline so the one
   * item being edited carries the accent; an edited item's Save and approve
   * stays accent.
   */
  quiet?: boolean;
  children?: ReactNode;
}) {
  // An accent that cannot be pressed reads as the live primary on dark panels, so a blocked main action is drawn outline.
  const saveApproveOff = busy || blocked;
  return <div className="flex flex-wrap items-center gap-2" role="group" aria-label={label}>
    {changed ? <Button type="button" variant={saveApproveOff ? "outline" : "accent"} size="sm" disabled={saveApproveOff} onClick={onSaveAndApprove}>Save and approve</Button>
      : approvable ? <Button type="button" variant={quiet || busy ? "outline" : "accent"} size="sm" data-row-action="approve" disabled={busy} onClick={onApprove}>Approve</Button>
      : extra ?? null}
    {canSave ? <Button type="button" variant={changed ? "outline" : "ghost"} size="sm" disabled={busy || blocked} onClick={onSave}>Save draft</Button> : null}
    {children}
  </div>;
}

export function CorrectionReasonFields({ value, onChange, segment, source, target, mentions, locale, disabled, needed, noteLabel = "Note (optional)", noteAriaLabel }: {
  value: CorrectionDraft;
  onChange: (next: CorrectionDraft) => void;
  /** The segment or label being corrected; "Fine here" applies to it alone. */
  segment: string;
  source: string;
  target: string;
  mentions: readonly GlossaryMention[] | undefined;
  locale: string;
  disabled?: boolean;
  /** Changed wording is waiting on a reason kind. */
  needed?: boolean;
  noteLabel?: string;
  noteAriaLabel?: string;
}) {
  const [proposal, setProposal] = useState<string | null>(null);
  const exceptions = exceptionsFor(value, segment);
  const conflicts = openConflicts(source, target, mentions, exceptions);
  const proposable = mentions ?? [];
  return <div className="space-y-2">
    <ReasonPicker value={value} onChange={(next) => onChange({ ...value, ...next })} disabled={disabled} needed={needed} noteLabel={noteLabel} noteAriaLabel={noteAriaLabel} />
    {conflicts.map((conflict) => <div key={conflict.term} role="status" className="theme-text-secondary flex flex-wrap items-center gap-2 text-sm">
      <span>{glossaryConflictMessage(conflict)}</span>
      <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => onChange({ ...value, segment, exceptions: [...exceptions, conflict.term] })}>Fine here</Button>
      <Button type="button" size="sm" variant="ghost" disabled={disabled} onClick={() => setProposal(conflict.term)}>Update the glossary</Button>
    </div>)}
    {exceptions.length ? <p className="theme-text-faint text-xs">Kept out on purpose here: {exceptions.join(", ")}. Saved with this correction.</p> : null}
    {value.kind === "terminology" && proposal === null ? <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => setProposal(proposable[0]?.term ?? "")}>Propose glossary change</Button> : null}
    {proposal !== null ? <GlossaryProposal key={proposal} locale={locale} mentions={proposable} initialTerm={proposal} disabled={disabled} onClose={() => setProposal(null)} /> : null}
  </div>;
}

/** A prefilled glossary draft. Saving goes through the glossary's own draft save and waits for approval in Words. */
function GlossaryProposal({ locale, mentions, initialTerm, disabled, onClose }: {
  locale: string;
  mentions: readonly GlossaryMention[];
  initialTerm: string;
  disabled?: boolean;
  onClose: () => void;
}) {
  const id = useId();
  const [term, setTerm] = useState(initialTerm);
  const row = mentions.find((entry) => entry.term === term);
  const [target, setTarget] = useState(row?.target ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  if (!mentions.length) return <div className="space-y-1">
    <p className="theme-text-secondary text-sm">This sentence mentions no glossary term. Add new terms in Words.</p>
    <Button type="button" size="sm" variant="ghost" onClick={onClose}>Close</Button>
  </div>;
  async function save() {
    if (!row) return;
    setBusy(true);
    setMessage(null);
    try {
      await editTerm(locale, row.term, target.trim(), undefined, row.revision, { kind: "terminology", note: "Proposed from a correction" });
      setMessage(`Glossary draft saved for ${row.term}. It waits for approval in Words.`);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "The glossary draft was not saved.");
    } finally {
      setBusy(false);
    }
  }
  return <section aria-label="Glossary proposal" className="space-y-2 rounded-md border border-[var(--theme-border-subtle)] p-2">
    {mentions.length > 1 ? <div className="space-y-1">
      <label htmlFor={`${id}-term`} className="theme-text-secondary text-xs">Term</label>
      <EditorSelect id={`${id}-term`} selectSize="sm" value={term} disabled={disabled || busy} options={mentions.map((entry) => ({ value: entry.term, label: entry.term }))}
        onChange={(event) => { setTerm(event.target.value); setTarget(mentions.find((entry) => entry.term === event.target.value)?.target ?? ""); setMessage(null); }} />
    </div> : <p className="theme-text-secondary text-xs">Term: {row?.term}</p>}
    {row ? <p className="theme-text-faint text-xs">{row.approved ? `Approved translation: ${row.target}` : `Unreviewed translation: ${row.target}`}</p> : null}
    <div className="space-y-1">
      <label htmlFor={`${id}-target`} className="theme-text-secondary text-xs">Proposed translation</label>
      <Input id={`${id}-target`} inputSize="sm" lang={locale} dir="auto" value={target} maxLength={400} disabled={disabled || busy} onChange={(event) => setTarget(event.target.value)} />
    </div>
    <div className="flex flex-wrap gap-2">
      <Button type="button" size="sm" disabled={disabled || busy || !row || !target.trim()} onClick={() => void save()}>Save glossary draft</Button>
      <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={onClose}>Close</Button>
    </div>
    {message ? <p role="status" className="theme-text-secondary text-xs">{message}</p> : null}
  </section>;
}
