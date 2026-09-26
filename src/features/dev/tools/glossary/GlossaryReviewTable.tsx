"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import { GlossaryUsageDisclosure } from "@/components/glossary/GlossaryUsageDisclosure";
import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EditorStatusPill } from "@/features/dev/components";
import {
  count,
  isLiveUnchecked,
  kindLabel,
  standingLabel,
  STATE_WORD,
  type GlossaryGroup,
  type GlossaryRow,
  type GlossaryRowPatch,
  type GlossaryStatusFilter,
} from "./glossaryModel";

import { TranslationHistory, translationRequest } from "./TranslationHistory";
import type { ReviewHistoryEntry } from "@server/translation/reviewTypes";
import type { GlossaryUsageMap, GlossaryUsageResponse } from "@/lib/glossary/glossaryUsage";
import type { ReviewReason } from "@server/translation/reviewReason";
import { ApprovalActions, ReasonPicker, reasonFor, type ReasonDraft } from "./CorrectionReason";

/** Unsaved wording and its reason survive category changes and search, scoped to its locale and source revision. */
export type GlossaryEditDrafts = Map<string, { value: string; revision: string; reason?: ReasonDraft }>;

/** A term edit usually corrects terminology, so that kind starts chosen, visibly, and a click changes it. */
const TERM_REASON: ReasonDraft = { kind: "terminology", note: "" };

/**
 * The outcome of the last single-row write, shown on that row rather than at
 * the top of the page. `conflict` and `frozen` name refusals the row can say
 * more about: someone saved first (reload to review the latest), or writes
 * are paused.
 */
export type GlossaryRowNotice = { term: string; tone: "success" | "danger"; message: string; conflict?: boolean; frozen?: boolean };

const capitalize = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

/** What a row's status pill says and its tone; the same words the counts and filters use. */
export function rowStatus(row: GlossaryRow): { label: string; tone: "info" | "success" | "warning" } {
  if (isLiveUnchecked(row)) return { label: "Live, never checked", tone: "info" };
  return row.status === "approved" ? { label: capitalize(STATE_WORD.approved), tone: "success" } : { label: capitalize(STATE_WORD.draft), tone: "warning" };
}

/** The share of a category a person has decided, for the small bars. */
export function reviewedShare(totals: { total: number; draft: number; unchecked: number }): number {
  return totals.total ? ((totals.total - totals.draft - totals.unchecked) / totals.total) * 100 : 0;
}

export type GlossaryGroupSectionProps = {
  group: GlossaryGroup;
  editDrafts: GlossaryEditDrafts;
  /** Category counts from the unfiltered rows, so the header keeps its meaning while a search narrows the list. */
  totals: { total: number; draft: number; unchecked: number };
  statusFilter: GlossaryStatusFilter;
  /** A whole-tab write is in flight; every row locks. */
  disabled: boolean;
  /** The one row a single-row write is locking, if any. */
  writingTerm: string | null;
  /** Term to definition, locale-independent. */
  glosses: Readonly<Record<string, string>>;
  /** Source locations computed with the glossary payload, before a disclosure opens. */
  usages: GlossaryUsageMap;
  /** The viewer may write definitions (editor and up); otherwise they read as plain text. */
  canDefine: boolean;
  /** Heading level of the category name: `h3` when it heads the pane, `h4` under a search heading. */
  headingLevel?: "h3" | "h4";
  /** Id for the heading, so the pane can move focus to it. */
  headingId?: string;
  /** Shown before the name: Back to list on phones. */
  lead?: ReactNode;
  onApproveAll: () => void;
  onConfirmAll: () => void;
  onApprove: (row: GlossaryRow) => void;
  onConfirm: (row: GlossaryRow) => void;
  onSave: (row: GlossaryRow, target: string, reason: ReviewReason) => void;
  onSaveAndApprove: (row: GlossaryRow, target: string, reason: ReviewReason) => void;
  onSaveDefinition: (row: GlossaryRow, gloss: string) => void;
  onRestored: (patch: GlossaryRowPatch | null) => Promise<void>;
  onReload: (term: string) => void;
  rowNotice: GlossaryRowNotice | null;
};

/**
 * One category of terms: its name, how much of it still needs a decision out
 * of how much there is, the two bulk actions (each touching exactly its own
 * count, and each confirming first), then the rows as an open list.
 */
export function GlossaryGroupSection({ group, editDrafts, totals, statusFilter, disabled, writingTerm, glosses, usages, canDefine, headingLevel: Heading = "h3", headingId, lead, onApproveAll, onConfirmAll, onApprove, onConfirm, onSave, onSaveAndApprove, onSaveDefinition, onRestored, onReload, rowNotice }: GlossaryGroupSectionProps) {
  const { category, rows, draftCount, uncheckedCount } = group;
  const open = standingLabel({ drafts: totals.draft, unchecked: totals.unchecked });
  const standing = open ? `${open} · ${count(totals.total, "term")}` : count(totals.total, "term");
  return (
    <section aria-labelledby={headingId} data-testid={`glossary-group-${category.id}`} className="min-w-0">
      <header className="theme-portal-rule space-y-3 border-b px-4 py-3.5 sm:px-5">
        {lead}
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
          <div className="min-w-0 space-y-1.5">
            <Heading id={headingId} tabIndex={-1} className="theme-accent-heading text-lg font-semibold leading-tight outline-none">
              {category.label}
            </Heading>
            <p className="theme-text-muted flex flex-wrap items-center gap-x-3 gap-y-1 text-sm tabular-nums">
              {/* Decorative: the counts beside it say the same in words. */}
              <span aria-hidden="true" className="flex h-1.5 w-20 shrink-0 overflow-hidden rounded-full theme-progress-track">
                <span className="block h-full bg-[var(--theme-accent)]" style={{ width: `${reviewedShare(totals)}%` }} />
              </span>
              <span>{standing}</span>
              {/* A "Reviewed" pill only where a reviewed category can be seen at all; under Unreviewed it can never appear. */}
              {!open && statusFilter === "all" ? <EditorStatusPill tone="success" inline>Reviewed</EditorStatusPill> : null}
            </p>
          </div>
          {draftCount > 0 || uncheckedCount > 0 ? (
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label={`Bulk actions for ${category.label}`}>
              {draftCount > 0 ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={disabled || writingTerm !== null}
                  aria-label={`Approve all ${count(draftCount, `${STATE_WORD.draft} term`)} in ${category.label}`}
                  onClick={onApproveAll}
                >
                  <Icon icon="lucide:check-check" size={14} />
                  Approve all
                  <span aria-hidden className="tabular-nums opacity-70">{draftCount}</span>
                </Button>
              ) : null}
              {uncheckedCount > 0 ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={disabled || writingTerm !== null}
                  aria-label={`Confirm all ${count(uncheckedCount, "live, never checked term")} in ${category.label}`}
                  onClick={onConfirmAll}
                >
                  <Icon icon="lucide:badge-check" size={14} />
                  Confirm all
                  <span aria-hidden className="tabular-nums opacity-70">{uncheckedCount}</span>
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      </header>
      <ul aria-label={`Terms in ${category.label}`} className="theme-dev-link-list px-1.5 sm:px-2.5">
        {rows.map((row) => (
          <GlossaryTermRow
            key={`${row.locale}:${row.term}`}
            editDrafts={editDrafts}
            row={row}
            gloss={glosses[row.term]}
            usage={usages[row.term]}
            canDefine={canDefine}
            disabled={disabled}
            writing={writingTerm === row.term}
            onApprove={onApprove}
            onConfirm={onConfirm}
            onSave={onSave}
            onSaveAndApprove={onSaveAndApprove}
            onSaveDefinition={onSaveDefinition}
            onRestored={onRestored}
            onReload={onReload}
            notice={rowNotice?.term === row.term ? rowNotice : null}
          />
        ))}
      </ul>
    </section>
  );
}

type GlossaryTermRowProps = {
  editDrafts: GlossaryEditDrafts;
  row: GlossaryRow;
  /** The term's definition, absent until an editor writes one. */
  gloss: string | undefined;
  usage: GlossaryUsageResponse | undefined;
  canDefine: boolean;
  disabled: boolean;
  /** This row's own write is in flight: the input reads only, the buttons wait, focus stays. */
  writing: boolean;
  onApprove: (row: GlossaryRow) => void;
  onConfirm: (row: GlossaryRow) => void;
  onSave: (row: GlossaryRow, target: string, reason: ReviewReason) => void;
  onSaveAndApprove: (row: GlossaryRow, target: string, reason: ReviewReason) => void;
  onSaveDefinition: (row: GlossaryRow, gloss: string) => void;
  onRestored: (patch: GlossaryRowPatch | null) => Promise<void>;
  onReload: (term: string) => void;
  notice: GlossaryRowNotice | null;
};

/**
 * One term: what it is on the left (the English, its definition, its kind,
 * who wrote the wording, where it is used, its history), and the decision on
 * the right (the status, the wording readers see, the field, the reason once
 * it changes, the one main action and its result).
 */
function GlossaryTermRow({ row, editDrafts, gloss, usage, canDefine, disabled, writing, onApprove, onConfirm, onSave, onSaveAndApprove, onSaveDefinition, onRestored, onReload, notice }: GlossaryTermRowProps) {
  const draftKey = JSON.stringify([row.locale, row.term]);
  const [draft, setDraft] = useState(() => editDrafts.get(draftKey)?.value ?? row.target);
  const [reason, setReason] = useState<ReasonDraft>(() => editDrafts.get(draftKey)?.reason ?? TERM_REASON);
  useEffect(() => {
    const saved = editDrafts.get(draftKey);
    if (saved && saved.value.trim() === row.target) editDrafts.delete(draftKey);
    setDraft(editDrafts.get(draftKey)?.value ?? row.target);
    setReason(editDrafts.get(draftKey)?.reason ?? TERM_REASON);
  }, [draftKey, editDrafts, row.target]);
  const dirty = draft.trim() !== row.target && draft.trim().length > 0;
  const held = disabled || writing;
  const unchecked = isLiveUnchecked(row);
  const canSave = draft.trim().length > 0 && (dirty || unchecked);
  const blocked = dirty && !reason.kind;
  const status = rowStatus(row);
  const editedRow = () => ({ ...row, revision: editDrafts.get(draftKey)?.revision ?? row.revision });
  const sentReason = () => reasonFor(reason, "Saved the wording as it stands.");
  const save = () => {
    if (canSave && !blocked) onSave(editedRow(), draft.trim(), sentReason());
  };
  const editReason = (next: ReasonDraft) => {
    setReason(next);
    editDrafts.set(draftKey, { value: draft, revision: editDrafts.get(draftKey)?.revision ?? row.revision, reason: next });
  };
  // Plain Enter only saves an edit as a draft; on a clean row it does nothing,
  // and the hint beside the list says so. Approving takes the button or
  // Ctrl/Command+Enter, which runs the same main action the button shows.
  const submit = () => {
    if (held) return;
    if (dirty) save();
  };
  const runMainAction = () => {
    if (held) return;
    if (dirty) {
      if (!blocked) onSaveAndApprove(editedRow(), draft.trim(), sentReason());
    } else if (row.status === "draft") onApprove(row);
    else if (unchecked) onConfirm(row);
  };
  const writtenBy = row.review_provenance === "legacy_unverified" ? "Older import" : row.source === "human" ? "A person" : "Machine";
  return (
    <li
      data-term={row.term}
      data-status={row.status}
      data-needs-review={row.status === "draft" || unchecked || undefined}
      aria-busy={writing || undefined}
      className="grid min-w-0 gap-x-6 gap-y-3 px-2.5 py-4 md:grid-cols-[minmax(0,13rem)_minmax(0,1fr)]"
    >
      <div className="min-w-0 space-y-1">
        <p className="theme-text-primary font-medium leading-snug">{row.term}</p>
        {canDefine ? (
          <GlossaryDefinition term={row.term} gloss={gloss} held={held} onSave={(next) => onSaveDefinition(row, next)} />
        ) : gloss ? (
          <p className="theme-text-secondary text-xs leading-relaxed">{gloss}</p>
        ) : null}
        {/* The runbook's column names, kept as facts: what kind of term, and who wrote the wording (reviewer names stay in History). */}
        <dl className="theme-text-muted flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
          <div className="flex gap-1"><dt className="sr-only">Type</dt><dd>{kindLabel(row.kind)}</dd></div>
          <div className="flex gap-1"><dt>Written by</dt><dd className="theme-text-secondary">{writtenBy}</dd></div>
        </dl>
      </div>
      <div className="min-w-0 space-y-2 md:col-start-2 md:row-start-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <EditorStatusPill tone={status.tone} inline>{status.label}</EditorStatusPill>
          {row.approved_target && row.status === "draft" ? (
            <span className="theme-text-secondary text-xs">Readers see: <span lang={row.locale} dir="auto" className="theme-text-primary">{row.approved_target}</span></span>
          ) : null}
          {dirty ? (
            <span className="theme-text-muted inline-flex items-center gap-1.5 text-xs">
              <span aria-hidden className="size-1.5 rounded-full bg-[var(--theme-accent)]" />
              Unsaved
            </span>
          ) : null}
        </div>
        <Input
          inputSize="sm"
          aria-label={`Translation for ${row.term}`}
          lang={row.locale}
          dir="auto"
          aria-busy={writing || undefined}
          value={draft}
          disabled={disabled}
          readOnly={writing}
          onChange={(event) => {
            const value = event.target.value;
            setDraft(value);
            if (value === row.target) editDrafts.delete(draftKey);
            else editDrafts.set(draftKey, { value, revision: editDrafts.get(draftKey)?.revision ?? row.revision, reason });
          }}
          onKeyDown={(event) => {
            if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
            event.preventDefault();
            if (event.metaKey || event.ctrlKey) runMainAction();
            else submit();
          }}
        />
        {unchecked && !dirty ? <p className="theme-text-muted text-xs">Readers already see this wording. Confirm it as it stands, or edit it and save a draft.</p> : null}
        {/* The shared reason control, once there is a change to explain; a term's natural reason is chosen to start, in plain view. */}
        {dirty ? <ReasonPicker value={reason} onChange={editReason} disabled={held} needed noteAriaLabel={`Note for ${row.term}`} /> : null}
        {/*
          One main action per state: an edit is saved and approved in one step,
          a clean draft is approved, live wording is confirmed. Save draft stays
          as the quieter choice whenever there is something to save.
        */}
        <ApprovalActions
          label={`Actions for ${row.term}`}
          changed={dirty}
          canSave={canSave}
          approvable={row.status === "draft"}
          busy={held}
          blocked={blocked}
          quiet
          onSave={save}
          onSaveAndApprove={() => onSaveAndApprove(editedRow(), draft.trim(), sentReason())}
          onApprove={() => onApprove(row)}
          extra={unchecked ? (
            <Button type="button" variant="outline" size="sm" data-row-action="approve" disabled={held} onClick={() => onConfirm(row)}>
              <Icon icon="lucide:badge-check" size={14} />
              Confirm
            </Button>
          ) : null}
        >
          {writing ? <span className="theme-text-muted inline-flex items-center gap-1.5 text-xs" aria-hidden><Icon icon="lucide:loader-circle" size={12} className="motion-safe:animate-spin" />Saving</span> : null}
        </ApprovalActions>
        {/* Always mounted, so screen readers announce the result when it arrives. */}
        <div role="status" className={notice ? `flex flex-wrap items-center gap-x-3 gap-y-1 text-xs ${notice.tone === "danger" ? "text-[color:var(--theme-danger-text)]" : "text-[color:var(--theme-success-text)]"}` : "sr-only"}>
          {notice ? (
            <>
              <span className="inline-flex items-start gap-1.5">
                <Icon icon={notice.tone === "danger" ? (notice.frozen ? "lucide:circle-pause" : "lucide:circle-alert") : "lucide:circle-check"} size={13} className="mt-px shrink-0" />
                <span>{notice.message}</span>
              </span>
              {notice.conflict ? (
                <Button type="button" variant="link" size="auto" className="text-xs" onClick={() => onReload(row.term)}>Load the latest version</Button>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
      <div className="min-w-0 md:col-span-2 md:row-start-2">
        <div className="flex flex-wrap items-start gap-x-5 [&>*:has([aria-expanded=true])]:basis-full">
          <div className="min-w-0">
            <GlossaryUsageDisclosure term={row.term} initialData={usage} />
          </div>
          <div className="min-w-0 text-xs">
            <TranslationHistory revision={row.revision} name={row.term} disabled={held || dirty}
              load={async () => (await translationRequest<{ history: ReviewHistoryEntry[] }>(`/api/dev/translation-glossary/history?locale=${encodeURIComponent(row.locale)}&term=${encodeURIComponent(row.term)}`)).history}
              restore={async (restoreRevision) => {
                const restored = await translationRequest<Partial<GlossaryRowPatch>>("/api/dev/translation-glossary/history", { locale: row.locale, term: row.term, expectedRevision: row.revision, restoreRevision });
                await onRestored(restored.rows && restored.pending ? { rows: restored.rows, pending: restored.pending } : null);
              }} />
          </div>
        </div>
      </div>
    </li>
  );
}

type GlossaryDefinitionProps = {
  term: string;
  gloss: string | undefined;
  /** The row is locked by a write; the definition cannot be opened for editing. */
  held: boolean;
  onSave: (gloss: string) => void;
};

/**
 * The definition under a term, for an editor: the text is a button that
 * swaps in a one-line input. Enter or leaving the field saves a changed,
 * non-empty definition, so clicking away never drops typed text; only
 * Escape puts the text back unchanged. The server decides what is too long
 * or empty, and its message lands on the row.
 */
function GlossaryDefinition({ term, gloss, held, onSave }: GlossaryDefinitionProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  /** Set once Enter, Escape or blur has closed the field, so the blur an unmount can fire never saves twice. */
  const closed = useRef(false);
  const editing = draft !== null;
  useEffect(() => {
    if (editing) {
      closed.current = false;
      input.current?.focus();
    }
  }, [editing]);
  const close = (save: boolean) => {
    if (closed.current || draft === null) return;
    closed.current = true;
    const next = draft.trim();
    setDraft(null);
    if (save && next.length > 0 && next !== gloss) onSave(next);
  };
  if (editing) {
    return (
      <div className="space-y-1">
        <Input
          ref={input}
          inputSize="sm"
          aria-label={`Definition for ${term}`}
          aria-describedby={`${encodeURIComponent(term)}-definition-hint`}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => close(true)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.nativeEvent.isComposing) {
              event.preventDefault();
              close(true);
            } else if (event.key === "Escape") {
              event.preventDefault();
              close(false);
            }
          }}
        />
        <p id={`${encodeURIComponent(term)}-definition-hint`} className="theme-text-faint text-xs">Enter or leaving the field saves; Escape puts it back. Every language shows this definition.</p>
      </div>
    );
  }
  return (
    <Button
      type="button"
      variant="quiet"
      size="auto"
      className={`group -mx-1 inline-flex items-start gap-1.5 whitespace-normal rounded-control px-1 text-left text-xs font-normal leading-relaxed ${gloss ? "theme-text-secondary" : "theme-text-faint"}`}
      disabled={held}
      onClick={() => setDraft(gloss ?? "")}
    >
      {/* The visible definition stays in the button's name; the hidden suffix says what pressing it does. */}
      <span>{gloss ?? "No definition yet"}</span>
      <span className="sr-only">{" "}(edit definition for {term})</span>
      <Icon icon="lucide:pencil" size={12} className="mt-0.5 shrink-0 opacity-50 group-hover:opacity-100 group-focus-visible:opacity-100" />
    </Button>
  );
}
