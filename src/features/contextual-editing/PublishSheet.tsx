"use client";

import { useId, useState, type KeyboardEvent, type ReactNode, type Ref } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useConfirm } from "@/features/dev/components/ConfirmDialog";
import type { PublicationReceiptState } from "./usePublicationReceipt";

/**
 * The only verbs an in-page editor's save and publish flow shows. Save draft
 * keeps work private, Review opens this sheet, Publish reaches every reader
 * after one confirm, and Submit for review sends the change to an admin.
 */
export const EDITOR_VERBS = ["Save draft", "Review", "Publish", "Submit for review"] as const;
export type EditorVerb = typeof EDITOR_VERBS[number];
export type PublishAction = Extract<EditorVerb, "Publish" | "Submit for review">;

/** One changed field in plain words, for editors without a structured diff. */
export type FieldChange = { field: string; label: string; before: ReactNode; after: ReactNode };

const PUBLIC_LABELS: Record<PublicationReceiptState["public"], string> = {
  done: "Public: live",
  pending: "Public: pending",
  failed: "Public: not delivered",
  unknown: "Public: not reported",
};
const TRANSLATION_LABELS: Record<PublicationReceiptState["translations"], string> = {
  queued: "Translations: queued",
  pending: "Translations: pending",
  "not-needed": "Translations: not needed",
  unknown: "Translations: not reported",
};

/** Delivery chips for one publication: editor host, public site, translations. */
export function PublicationReceiptChips({ receipt }: { receipt: PublicationReceiptState }) {
  const chip = "rounded-full border border-dose-border px-2 py-0.5";
  return <div data-testid="publication-receipt" className="theme-text-primary flex flex-wrap items-center gap-2 text-xs">
    <span className={chip}>Editor host: saved</span>
    <span className={chip} role="status">{PUBLIC_LABELS[receipt.public]}</span>
    <span className={chip}>{TRANSLATION_LABELS[receipt.translations]}</span>
    {receipt.checking ? <span className="theme-text-muted">Checking delivery…</span> : null}
    {receipt.stopped ? <span className="theme-text-muted">Stopped checking. Reload later to see whether the public site has the change.</span> : null}
  </div>;
}

function isFieldChanges(changes: PublishSheetProps["changes"]): changes is readonly FieldChange[] {
  return Array.isArray(changes);
}

function FieldChangeList({ changes }: { changes: readonly FieldChange[] }) {
  if (changes.length === 0) return <p className="theme-text-muted text-sm">No fields changed.</p>;
  return <div className="min-w-0 space-y-4">
    {changes.map((change) => <section key={change.field} className="min-w-0 space-y-2 [overflow-wrap:anywhere]">
      <h4 className="font-semibold">{change.label}</h4>
      <div className="grid min-w-0 gap-3 md:grid-cols-2">
        <div className="min-w-0"><p className="theme-text-muted text-sm">Before</p><div className="whitespace-pre-wrap text-sm">{change.before}</div></div>
        <div className="min-w-0"><p className="theme-text-muted text-sm">After</p><div className="whitespace-pre-wrap text-sm">{change.after}</div></div>
      </div>
    </section>)}
  </div>;
}

export type PublishSheetProps = {
  /** A rendered diff (articles pass `ArticleChangeDiff`), or a field before and after list. */
  changes: ReactNode | readonly FieldChange[];
  /** App Paths or plain names of everything the publish changes. */
  targets: readonly string[];
  /** Runs the write for the chosen action; throws when it is not confirmed. */
  onPublish: (action: PublishAction) => Promise<void>;
  /** The delivery receipt of the last publish from this editor, if any. */
  receipt: PublicationReceiptState | null;
  /** First is primary and answers Cmd/Ctrl+Enter. Defaults to Publish alone. */
  actions?: readonly PublishAction[];
  heading?: string;
  headingRef?: Ref<HTMLHeadingElement>;
  /** A sentence on the scope of the change, above the diff. */
  description?: ReactNode;
  /** The change note the write records. Omitted by editors whose route stores none. */
  note?: { value: string; onChange: (value: string) => void; hint?: ReactNode };
  /** Blocking problems; publish stays disabled while present. */
  problems?: ReactNode;
  disabled?: boolean;
  busy?: boolean;
  /** Count shown beside the action, such as "3 changes". */
  countLabel?: string;
  /** Leaves the sheet without publishing. */
  onCancel?: () => void;
  confirmDescription?: string;
  /** What the publish confirm shows under its sentence, such as the changes that matter most. Widens it. */
  confirmBody?: ReactNode;
  /** Draw the publish confirm as destructive, for a change with unresolved warnings. */
  confirmDestructive?: boolean;
  /** Heading over the confirm's list of targets ("Changes 2 pages"). */
  confirmAffectedLabel?: string;
  /** The outcome of the last attempt, drawn under the buttons that made it (a refusal and its way forward). */
  result?: ReactNode;
  /** Read before anything else in the sheet, such as a safety check. */
  lead?: ReactNode;
  children?: ReactNode;
};

/**
 * The one review-and-publish sheet every in-page editor uses: what changed,
 * what it reaches, an optional change note, and one confirm. Publish always
 * passes through a confirm naming the targets; Submit for review changes
 * nothing public and runs directly. Plain Enter never publishes; the
 * button or Cmd/Ctrl+Enter is the explicit action.
 */
export function PublishSheet({
  changes, targets, onPublish, receipt, actions = ["Publish"], heading = "Your changes", headingRef,
  description, note, problems, disabled = false, busy = false, countLabel, onCancel, confirmDescription, confirmBody, confirmAffectedLabel, confirmDestructive = false, lead, result, children,
}: PublishSheetProps) {
  const noteId = useId();
  const { confirm, dialog } = useConfirm();
  const [error, setError] = useState<string | null>(null);
  const blocked = disabled || busy || !!problems;
  const primary = actions[0];

  const perform = async (action: PublishAction) => {
    setError(null);
    try { await onPublish(action); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "The change was not confirmed. Your edits are retained."); }
  };
  const run = (action: PublishAction) => {
    if (blocked) return;
    if (action !== "Publish") { void perform(action); return; }
    const noteText = note ? ` Note: "${note.value.trim() || "no note"}".` : "";
    confirm({
      title: "Publish this change to every reader?",
      description: confirmDescription ?? `It is saved on the editor host first, then delivered to the public site.${countLabel ? ` ${countLabel}.` : ""}${noteText}`,
      affected: [...targets],
      ...(confirmBody ? { body: confirmBody, wide: true } : {}),
      ...(confirmAffectedLabel ? { affectedLabel: confirmAffectedLabel } : {}),
      confirmLabel: "Publish",
      destructive: confirmDestructive,
      onConfirm: () => perform("Publish"),
    });
  };
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== "Enter" || event.nativeEvent.isComposing || !(event.metaKey || event.ctrlKey)) return;
    event.preventDefault();
    if (primary) run(primary);
  };

  // The listener only catches Cmd/Ctrl+Enter bubbling from the note and
  // buttons inside; every action also has its own button.
  // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
  return <section data-testid="publish-sheet" aria-label="Review and publish" className="min-w-0 space-y-4 [overflow-wrap:anywhere]" onKeyDown={onKeyDown}>
    <h3 ref={headingRef} tabIndex={-1} className="theme-text-primary theme-focus-ring font-semibold">{heading}</h3>
    {lead}
    {description ? <div className="theme-text-muted text-sm">{description}</div> : null}
    {isFieldChanges(changes) ? <FieldChangeList changes={changes} /> : changes}
    <section className="space-y-1">
      <h4 className="theme-text-primary text-sm font-semibold">Affected pages</h4>
      {targets.length ? <ul className="theme-text-secondary max-h-40 space-y-0.5 overflow-y-auto text-sm">{targets.map((target) => <li key={target}>{target}</li>)}</ul>
        : <p className="theme-text-muted text-sm">Loading the affected pages…</p>}
    </section>
    {note ? <div className="space-y-2">
      <label htmlFor={noteId} className="theme-text-primary block space-y-2 text-sm">Change note<Input id={noteId} value={note.value} onChange={(event) => note.onChange(event.target.value)} onKeyDown={(event) => {
        // Finishing a sentence is not a decision to go live.
        if (event.key === "Enter" && !event.nativeEvent.isComposing && !(event.metaKey || event.ctrlKey)) event.preventDefault();
      }} /></label>
      {note.hint ? <p className="theme-text-muted text-sm">{note.hint}</p> : null}
    </div> : null}
    {problems}
    <div className="flex flex-wrap gap-2">
      {actions.map((action, index) => <Button key={action} variant={index === 0 ? "accent" : "outline"} disabled={blocked} onClick={() => run(action)}>
        {action}{countLabel ? ` (${countLabel})` : ""}
      </Button>)}
      {onCancel ? <Button variant="ghost" disabled={busy} onClick={onCancel}>Cancel</Button> : null}
    </div>
    {result}
    <p className="theme-text-muted text-xs [@media(pointer:coarse)]:hidden">Press Ctrl+Enter or Cmd+Enter to {primary === "Publish" ? "review and publish" : "submit for review"}.</p>
    {error ? <p role="alert" className="theme-text-primary whitespace-pre-wrap text-sm">{error}</p> : null}
    {receipt ? <PublicationReceiptChips receipt={receipt} /> : null}
    {children}
    {dialog}
  </section>;
}
