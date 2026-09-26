"use client";

import { useMemo, useRef, useState } from "react";
import { isShortUiLabel, UI_BATCH_APPROVAL_REASON, UI_BATCH_MAX_ITEMS, type UiBatchApprovalItem, type UiBatchApprovalResponse, type UiBatchApprovalResult, type UiTranslationRow } from "../../../../../lib/translation/uiTranslationTypes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StateCard } from "@/components/common/StateCard";
import { Notice, EditorStatusPill, useConfirm, type NoticeMessage } from "@/features/dev/components";
import { translationRequest } from "./TranslationHistory";
import { UI_STATUS_LABEL, UI_STATUS_TONE, type UiEditDrafts } from "./UiTranslationWorkbench";

const endpoint = "/api/dev/translation-workbench/approve-many";
const PAGE_SIZE = 100;
/** Larger selections ask first so a stray "select all" cannot approve thousands of rows. */
const CONFIRM_ABOVE = 200;
const unplaced = "No recorded location";

const savedTarget = (row: UiTranslationRow) => row.draft?.target ?? row.approved?.target ?? row.compiledTarget ?? "";

/**
 * Dense review for labels of three words or fewer that still need a person.
 * Only rows the reviewer ticks are approved, each as its own recorded approval.
 */
export function ShortLabelGrid({ locale, rows, edits, update }: { locale: string; rows: readonly UiTranslationRow[]; edits: UiEditDrafts; update: (rows: UiTranslationRow[]) => void }) {
  const [, rerender] = useState(0);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<NoticeMessage | null>(null);
  const inFlight = useRef(false);
  const { confirm, dialog } = useConfirm();
  const candidates = useMemo(() => rows
    .filter((row) => row.status !== "approved" && isShortUiLabel(row.source))
    .map((row) => ({ row, location: row.locations[0] ?? unplaced }))
    .sort((a, b) => a.location.localeCompare(b.location) || a.row.source.localeCompare(b.row.source)), [rows]);
  const targetFor = (row: UiTranslationRow) => edits.get(`${locale}:${row.id}`)?.target ?? savedTarget(row);
  const editTarget = (row: UiTranslationRow, value: string) => {
    const key = `${locale}:${row.id}`;
    const kept = edits.get(key);
    if (value === savedTarget(row) && !kept?.reason && !kept?.kind && !kept?.exceptions?.length) edits.delete(key);
    else edits.set(key, { ...kept, target: value, reason: kept?.reason ?? "" });
    rerender((value) => value + 1);
  };
  const toggle = (id: string) => setSelected((current) => { const next = new Set(current); if (!next.delete(id)) next.add(id); return next; });
  const chosen = candidates.filter(({ row }) => selected.has(row.id) && targetFor(row).trim());
  const lastPage = Math.max(0, Math.ceil(candidates.length / PAGE_SIZE) - 1);
  const current = Math.min(page, lastPage);
  const groups = new Map<string, UiTranslationRow[]>();
  for (const { row, location } of candidates.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE)) groups.set(location, [...(groups.get(location) ?? []), row]);

  const approve = async (items: UiBatchApprovalItem[]) => {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setNotice(null);
    const results: UiBatchApprovalResult[] = [];
    let stopped: string | null = null;
    try {
      // One request per chunk; each label is still its own transaction on the server.
      for (let start = 0; start < items.length; start += UI_BATCH_MAX_ITEMS) {
        try { results.push(...(await translationRequest<UiBatchApprovalResponse>(endpoint, { locale, items: items.slice(start, start + UI_BATCH_MAX_ITEMS) })).results); }
        catch (cause) { stopped = cause instanceof Error ? cause.message : "The batch approval request failed."; break; }
      }
    } finally { inFlight.current = false; setBusy(false); }
    const approved = results.flatMap((result) => result.ok ? [result.row] : []);
    const failed = results.flatMap((result) => result.ok ? [] : [result]);
    for (const row of approved) edits.delete(`${locale}:${row.id}`);
    if (approved.length) update(approved);
    setSelected((current) => { const next = new Set(current); for (const row of approved) next.delete(row.id); return next; });
    const sources = new Map(rows.map((row) => [row.id, row.source]));
    const unsent = items.length - results.length;
    setNotice({
      tone: failed.length || stopped ? (approved.length ? "warning" : "danger") : "success",
      message: <div className="space-y-1">
        <p>Approved {approved.length} {approved.length === 1 ? "label" : "labels"}. They go live with the next site release.</p>
        {failed.length ? <ul className="list-disc pl-5">{failed.map((result) => <li key={result.id}>{sources.get(result.id) ?? result.id}: {result.error}</li>)}</ul> : null}
        {stopped ? <p>{unsent} {unsent === 1 ? "label was" : "labels were"} not sent: {stopped}</p> : null}
      </div>,
    });
  };
  const approveSelected = () => {
    const items = chosen.map(({ row }) => ({ id: row.id, expectedRevision: row.revision, target: targetFor(row).trim() }));
    if (items.length <= CONFIRM_ABOVE) return void approve(items);
    confirm({
      title: `Approve ${items.length} labels?`,
      description: `You selected ${items.length} labels. Each one is approved with the wording shown, one label at a time, and recorded under your name as "${UI_BATCH_APPROVAL_REASON}".`,
      confirmLabel: `Approve ${items.length} labels`,
      affected: chosen.map(({ row }) => `${row.source} → ${targetFor(row).trim()}`),
      onConfirm: () => approve(items),
    });
  };

  return <div className="space-y-4">
    <p className="theme-text-secondary max-w-prose text-sm">Labels of three words or fewer that still need review, grouped by where they first appear. Tick the rows that read right in context, edit any wording inline, then approve them together. Longer strings stay in the one-at-a-time view.</p>
    <div className="theme-portal-rule sticky top-20 z-10 space-y-2 rounded-card border bg-[var(--editor-panel-bg)]/95 px-3 py-2.5 backdrop-blur" role="group" aria-label="Selection">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant={chosen.length ? "accent" : "outline"} size="sm" disabled={busy || !chosen.length} aria-busy={busy || undefined} onClick={approveSelected}>{busy ? "Approving" : `Approve selected (${chosen.length})`}</Button>
        <Button type="button" variant="ghost" size="sm" disabled={busy || !candidates.length} onClick={() => setSelected(new Set(candidates.filter(({ row }) => targetFor(row).trim()).map(({ row }) => row.id)))}>Select all matching</Button>
        <Button type="button" variant="ghost" size="sm" disabled={busy || !selected.size} onClick={() => setSelected(new Set())}>Clear selection</Button>
        <span className="theme-text-muted text-xs tabular-nums" aria-live="polite">{chosen.length} selected of {candidates.length} short labels needing review</span>
      </div>
      {notice ? <Notice {...notice} placement="inline" dismiss={() => setNotice(null)} /> : null}
    </div>
    {!candidates.length ? <StateCard compact tone="success" icon="lucide:check-check" title="No short labels need review" description="Every matching label of three words or fewer is approved." /> : null}
    {lastPage > 0 ? <nav className="flex flex-wrap items-center gap-2" aria-label="Short label pages">
      <Button variant="outline" size="sm" disabled={current === 0} onClick={() => setPage(current - 1)}>Previous short labels</Button>
      <span className="theme-text-secondary text-sm tabular-nums">{current * PAGE_SIZE + 1} to {Math.min((current + 1) * PAGE_SIZE, candidates.length)} of {candidates.length}</span>
      <Button variant="outline" size="sm" disabled={current >= lastPage} onClick={() => setPage(current + 1)}>Next short labels</Button>
    </nav> : null}
    {[...groups].map(([location, group]) => <fieldset key={location} className="min-w-0 space-y-1">
      <legend className="theme-text-muted break-all text-xs font-medium">{location}</legend>
      <ul className="theme-dev-link-list">
        {group.map((row) => <li key={row.id} className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 gap-y-2 px-1 py-2 sm:grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)_9rem] sm:items-center">
          <input type="checkbox" className="accent-dose-accent-strong mt-1 size-4 sm:mt-0 [@media(pointer:coarse)]:size-5" aria-label={`Select ${row.id}`} checked={selected.has(row.id)} disabled={busy} onChange={() => toggle(row.id)} />
          <div className="min-w-0"><p className="theme-text-primary break-words text-sm" lang="en">{row.source}</p><p className="theme-text-faint line-clamp-2 break-words text-xs" title={row.context}>{row.context}</p></div>
          <div className="col-start-2 min-w-0 sm:col-start-auto"><Input inputSize="sm" lang={locale} dir="auto" aria-label={`Translation for ${row.id}`} value={targetFor(row)} disabled={busy} onChange={(event) => editTarget(row, event.target.value)} /></div>
          <div className="col-start-2 sm:col-start-auto"><EditorStatusPill tone={UI_STATUS_TONE[row.status] ?? "warning"} inline>{UI_STATUS_LABEL[row.status] ?? row.status}</EditorStatusPill></div>
        </li>)}
      </ul>
    </fieldset>)}
    {dialog}
  </div>;
}
