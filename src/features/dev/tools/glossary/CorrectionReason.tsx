"use client";
/**
 * The reason and glossary check every correction editor shares: four reason
 * chips with an optional note, the glossary conflict notice ("Fine here" or
 * "Update the glossary"), and a glossary proposal that saves a draft and
 * never approves it.
 */
import { useId, useState } from "react";
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
  return <div role="group" aria-label={label} className="flex flex-wrap items-center gap-1">
    <span className="theme-text-secondary mr-1 text-xs">{label}</span>
    {CORRECTION_REASON_KINDS.map((kind) => <Button key={kind} type="button" size="sm" variant={value === kind ? "accent" : "outline"} aria-pressed={value === kind} disabled={disabled}
      onClick={() => onChange(kind)}>{CORRECTION_REASON_LABEL[kind]}</Button>)}
  </div>;
}

export function CorrectionReasonFields({ value, onChange, segment, source, target, mentions, locale, disabled, noteLabel = "Note (optional)", noteAriaLabel }: {
  value: CorrectionDraft;
  onChange: (next: CorrectionDraft) => void;
  /** The segment or label being corrected; "Fine here" applies to it alone. */
  segment: string;
  source: string;
  target: string;
  mentions: readonly GlossaryMention[] | undefined;
  locale: string;
  disabled?: boolean;
  noteLabel?: string;
  noteAriaLabel?: string;
}) {
  const id = useId();
  const [proposal, setProposal] = useState<string | null>(null);
  const exceptions = exceptionsFor(value, segment);
  const conflicts = openConflicts(source, target, mentions, exceptions);
  const proposable = mentions ?? [];
  return <div className="space-y-2">
    <ReasonKindChips value={value.kind} onChange={(kind) => onChange({ ...value, kind })} disabled={disabled} />
    <div className="space-y-1">
      <label htmlFor={`${id}-note`} className="theme-text-secondary text-xs">{noteLabel}</label>
      <Input id={`${id}-note`} inputSize="sm" aria-label={noteAriaLabel} value={value.note} maxLength={1000} disabled={disabled} placeholder="What was wrong, in a few words" onChange={(event) => onChange({ ...value, note: event.target.value })} />
    </div>
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
      <Input id={`${id}-target`} inputSize="sm" lang={locale} value={target} maxLength={400} disabled={disabled || busy} onChange={(event) => setTarget(event.target.value)} />
    </div>
    <div className="flex flex-wrap gap-2">
      <Button type="button" size="sm" disabled={disabled || busy || !row || !target.trim()} onClick={() => void save()}>Save glossary draft</Button>
      <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={onClose}>Close</Button>
    </div>
    {message ? <p role="status" className="theme-text-secondary text-xs">{message}</p> : null}
  </section>;
}
