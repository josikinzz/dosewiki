"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { UiTranslationRow, UiTranslationListResponse, UiTranslationHistoryResponse, UiTranslationWriteResponse } from "@lib/translation/uiTranslationTypes";
import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { EditorStatusPill, LoadErrorState, type EditorStatusPillTone, type NoticeMessage } from "@/features/dev/components";
import { TranslationHistory, translationRequest } from "./TranslationHistory";
import { ShortLabelGrid } from "./ShortLabelGrid";
import { PendingRefreshList } from "./PendingRefreshList";
import { ApprovalActions, CorrectionReasonFields, exceptionsFor, openConflicts, reasonFor, type CorrectionDraft } from "./CorrectionReason";
import { describeWriteRefusal } from "./glossaryModel";
import { ChoiceGrid, ResultNotice, RowSkeletons, SearchField } from "./workbenchParts";
import type { CorrectionReasonKind } from "@lib/translation/reviewReason";

/**
 * What each label state is called, in the workbench's one vocabulary: the
 * pills, the counts line and the legend use the same words.
 */
export const UI_STATUS_LABEL: Record<UiTranslationRow["status"], string> = {
  stale: "English changed",
  draft: "Unreviewed",
  approved: "Approved",
  unreviewed: "Machine",
  missing: "Not in the site build",
};
export const UI_STATUS_TONE: Record<UiTranslationRow["status"], EditorStatusPillTone> = {
  stale: "warning",
  draft: "warning",
  approved: "success",
  unreviewed: "neutral",
  missing: "neutral",
};

/** Unsaved work per label, kept across search and pagination: wording, note, reason kind, and "Fine here" choices. */
export type UiEditDrafts = Map<string, { target: string; reason: string; kind?: CorrectionReasonKind | null; exceptions?: string[] }>;

const endpoint = "/api/dev/translation-workbench";
const PAGE = 30;

type Mode = "cards" | "short" | "refresh";

export function UiTranslationWorkbench({ locale, editDrafts, initialSearch = "", search: sharedSearch, onSearchChange, searchRef, onWaitingChange }: {
  locale: string; editDrafts?: UiEditDrafts; initialSearch?: string;
  /** A search owned by the page (Terms and Interface text share one); the field here then edits that one search. */
  search?: string; onSearchChange?: (search: string) => void;
  /** The search field, so the page's `/` key can focus it. */
  searchRef?: RefObject<HTMLInputElement | null>;
  /** How many labels still want a person, for the view's tab; null while unknown. */
  onWaitingChange?: (waiting: number | null) => void;
}) {
  const localEdits = useRef<UiEditDrafts>(new Map());
  const edits = editDrafts ?? localEdits.current;
  const [rows, setRows] = useState<UiTranslationRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [ownSearch, setOwnSearch] = useState(initialSearch);
  const search = sharedSearch ?? ownSearch;
  const setSearch = onSearchChange ?? setOwnSearch;
  const [page, setPage] = useState(0);
  useEffect(() => { setPage(0); }, [search]);
  const [mode, setMode] = useState<Mode>("cards");
  const [catalogRefreshed, setCatalogRefreshed] = useState(true);
  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try { const result = await translationRequest<UiTranslationListResponse>(`${endpoint}?locale=${encodeURIComponent(locale)}`); setRows(result.rows); setCatalogRefreshed(result.catalogRefreshed ?? true); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to load UI labels."); }
    finally { setLoading(false); }
  }, [locale]);
  useEffect(() => { void load(); }, [load]);
  const waiting = rows ? rows.filter((row) => row.status !== "approved" && row.status !== "missing").length : null;
  useEffect(() => { onWaitingChange?.(waiting); }, [onWaitingChange, waiting]);
  const needle = search.trim().toLowerCase();
  const shown = rows?.filter((row) => [row.source, row.context, row.id, row.draft?.target ?? "", row.approved?.target ?? row.compiledTarget ?? ""].some((value) => value.toLowerCase().includes(needle)));
  const tally = (status: UiTranslationRow["status"]) => rows?.filter((row) => row.status === status).length ?? 0;
  const pages = shown ? Math.max(1, Math.ceil(shown.length / PAGE)) : 1;
  const current = Math.min(page, pages - 1);
  const pager = shown && mode === "cards" && shown.length > PAGE ? (
    <nav className="flex flex-wrap items-center gap-2" aria-label="UI label pages">
      <Button variant="outline" size="sm" disabled={current === 0} onClick={() => setPage(current - 1)}><Icon icon="lucide:chevron-left" size={14} />Previous labels</Button>
      <span className="theme-text-secondary text-sm tabular-nums">{current * PAGE + 1} to {Math.min((current + 1) * PAGE, shown.length)} of {shown.length}</span>
      <Button variant="outline" size="sm" disabled={(current + 1) * PAGE >= shown.length} onClick={() => setPage(current + 1)}>Next labels<Icon icon="lucide:chevron-right" size={14} /></Button>
    </nav>
  ) : null;
  const shortCount = rows ? rows.filter((row) => row.status !== "approved" && row.source.trim().split(/\s+/).length <= 3 && !row.source.includes("\n")).length : null;
  const refreshCount = rows ? rows.filter((row) => row.pendingRefresh).length : null;

  return <section aria-label="UI labels" className="space-y-5">
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:items-end">
      <div className="space-y-2">
        <p className="theme-text-secondary max-w-prose text-sm">The exact wording for each place the site says something. Approved wording ships with the next site release.</p>
        {rows ? (
          <p className="theme-text-muted text-xs tabular-nums">
            {tally("unreviewed")} machine · {tally("draft")} unreviewed · {tally("stale")} English changed · {tally("approved")} approved · {tally("missing")} not in the site build
          </p>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        {sharedSearch === undefined
          ? <SearchField ref={searchRef} className="min-w-0 flex-1" label="Search UI labels" value={search} onChange={(value) => { setSearch(value); setPage(0); }} placeholder="Search English, translation, or context" />
          : <SearchField ref={searchRef} className="min-w-0 flex-1" label="Search words" value={search} onChange={setSearch} placeholder="Search English, translation, or context" description="Terms shares this search." />}
        <Button type="button" variant="ghost" size="icon" className="size-10 shrink-0" aria-label="Refresh interface text" title="Refresh interface text" disabled={loading} aria-busy={loading || undefined} onClick={() => void load()}>
          <Icon icon="lucide:refresh-cw" size={15} className={loading ? "motion-safe:animate-spin" : undefined} />
        </Button>
      </div>
    </div>
    <ChoiceGrid<Mode>
      label="UI label view"
      columns={3}
      value={mode}
      onChange={setMode}
      choices={[
        { value: "cards", label: "One at a time", count: shown ? shown.length : null },
        { value: "short", label: "Short labels", count: shortCount },
        { value: "refresh", label: "Waiting for glossary refresh", short: "Glossary refresh", count: refreshCount },
      ]}
    />
    {error ? <LoadErrorState what="the interface text" message={error} onRetry={() => void load()} busy={loading} /> : null}
    {rows === null && !error ? <RowSkeletons rows={4} label="UI labels" /> : null}
    {shown && mode === "short" ? <ShortLabelGrid locale={locale} rows={shown} edits={edits} update={(next) => { const byId = new Map(next.map((row) => [row.id, row])); setRows((current) => current?.map((item) => byId.get(item.id) ?? item) ?? null); }} /> : null}
    {shown && mode === "refresh" ? <PendingRefreshList rows={shown} refreshed={catalogRefreshed} review={(row) => { setSearch(row.id); setPage(0); setMode("cards"); }} /> : null}
    {shown?.length === 0 && mode === "cards" ? (
      <div className="rounded-card border border-dashed border-[color:var(--editor-panel-border)] px-5 py-6">
        <p className="theme-text-primary font-medium">No labels match “{search.trim()}”</p>
        <p className="theme-text-secondary mt-1 text-sm">Try a different English label, translation, or context.</p>
        <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => setSearch("")}>Clear the search</Button>
      </div>
    ) : null}
    {pager ? <p className="theme-text-muted text-xs tabular-nums">Showing {current * PAGE + 1} to {Math.min((current + 1) * PAGE, shown!.length)} of {shown!.length}; the page buttons are after the list.</p> : null}
    {mode === "cards" && shown?.length ? (
      <ul aria-label="Interface text" className="theme-dev-link-list">
        {shown.slice(current * PAGE, (current + 1) * PAGE).map((row) => <UiLabel key={row.id} locale={locale} row={row} edits={edits} update={(next) => setRows((items) => items?.map((item) => item.id === next.id ? next : item) ?? null)} />)}
      </ul>
    ) : null}
    {pager}
  </section>;
}

function UiLabel({ locale, row, update, edits }: { locale: string; row: UiTranslationRow; edits: UiEditDrafts; update: (row: UiTranslationRow) => void }) {
  const editKey = `${locale}:${row.id}`;
  const [target, setTarget] = useState(edits.get(editKey)?.target ?? row.draft?.target ?? row.approved?.target ?? row.compiledTarget ?? "");
  const correctionOf = (): CorrectionDraft => { const saved = edits.get(editKey); return { kind: saved?.kind ?? null, note: saved?.reason ?? "", segment: row.id, exceptions: saved?.exceptions ?? [] }; };
  const [correction, setCorrection] = useState<CorrectionDraft>(correctionOf);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<NoticeMessage | null>(null);
  const inFlight = useRef(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- correctionOf reads the same edits entry keyed by editKey.
  useEffect(() => { setTarget(edits.get(editKey)?.target ?? row.draft?.target ?? row.approved?.target ?? row.compiledTarget ?? ""); setCorrection(correctionOf()); }, [row, edits, editKey]);
  // Typing back to the stored wording with no reason is no unsaved work, so the entry goes.
  const remember = (nextTarget: string, next: CorrectionDraft) => {
    const untouched = nextTarget === (row.draft?.target ?? row.approved?.target ?? row.compiledTarget ?? "") && !next.kind && !next.note && !next.exceptions.length;
    if (untouched) edits.delete(editKey);
    else edits.set(editKey, { target: nextTarget, reason: next.note, kind: next.kind, exceptions: next.exceptions });
  };
  const editTarget = (value: string) => { remember(value, correction); setTarget(value); };
  const editCorrection = (next: CorrectionDraft) => { remember(target, next); setCorrection(next); };
  const conflicts = openConflicts(row.source, target, row.glossary, exceptionsFor(correction, row.id));
  const savedTarget = row.draft?.target ?? row.approved?.target ?? row.compiledTarget ?? "";
  const dirty = target.trim() !== savedTarget;
  const canSave = Boolean(target.trim()) && (dirty || row.status === "stale" || row.status === "unreviewed");
  const approvable = !dirty && Boolean(row.draft) && row.draft?.source === row.source && row.draft?.context === row.context;
  const send = async (action: "save" | "approve" | "restore", expectedRevision: number, restoreRevision?: number) => (await translationRequest<UiTranslationWriteResponse>(endpoint, {
    locale, id: row.id, action, expectedRevision,
    ...(action === "save" ? { target: target.trim(), glossaryExceptions: exceptionsFor(correction, row.id) } : {}),
    ...(restoreRevision === undefined ? {} : { restoreRevision }),
    reason: reasonFor(correction, action === "save" ? "Saved the wording as it stands." : action === "approve" ? "Reviewed wording in its UI context." : `Restore revision ${restoreRevision} for review.`),
  })).row;
  /** Save and approve saves first, then approves exactly the revision that save produced. */
  const write = async (action: "save" | "approve" | "restore" | "save-approve", restoreRevision?: number) => {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setNotice(null);
    try {
      let result = await send(action === "save-approve" ? "save" : action, row.revision, restoreRevision);
      if (action === "save-approve") {
        edits.delete(editKey);
        update(result);
        result = await send("approve", result.revision);
      }
      edits.delete(editKey);
      update(result); setCorrection({ kind: null, note: "", segment: row.id, exceptions: [] });
      setNotice({ tone: "success", message: action === "approve" || action === "save-approve" ? "Approved. It goes live with the next site release." : action === "restore" ? "Restored as a draft. Review the wording before approving." : "Draft saved. The approved wording is unchanged." });
    } catch (cause) {
      setNotice({ tone: "danger", message: describeWriteRefusal(cause, "The change was not saved.").message });
      // Keep the typed rendering on errors; a stale revision must be deliberately reviewed.
      throw cause;
    } finally { inFlight.current = false; setBusy(false); }
  };
  const long = row.source.length > 100 || row.source.includes("\n") || target.length > 100 || target.includes("\n");
  return <li aria-label={`${row.source}: ${row.context}`} className="grid min-w-0 gap-x-6 gap-y-3 px-2.5 py-4 md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
    <div className="min-w-0 space-y-1">
      <h3 className="theme-text-primary whitespace-pre-wrap break-words font-medium leading-snug" lang="en">{row.source}</h3>
      <p className="theme-text-secondary text-sm">{row.context}</p>
      {row.glossaryTerms.length ? <p className="theme-text-muted text-xs">Glossary terms: {row.glossaryTerms.join(", ")}</p> : null}
      <details className="theme-text-muted text-xs">
        <summary className="cursor-pointer select-none">Where it appears</summary>
        <ul className="mt-1 space-y-0.5 break-all">{row.locations.map((location) => <li key={location}>{location}</li>)}</ul>
        <p className="mt-1 break-all">Label id: {row.id}</p>
      </details>
    </div>
    <div className="min-w-0 space-y-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <EditorStatusPill tone={UI_STATUS_TONE[row.status] ?? "neutral"} inline>{UI_STATUS_LABEL[row.status] ?? row.status}</EditorStatusPill>
        {dirty ? <span className="theme-text-muted inline-flex items-center gap-1.5 text-xs"><span aria-hidden className="size-1.5 rounded-full bg-[var(--theme-accent)]" />Unsaved</span> : null}
      </div>
      <dl className="grid gap-x-3 gap-y-0.5 text-sm sm:grid-cols-[auto_minmax(0,1fr)]">
        {row.compiledTarget ? <><dt className="theme-text-muted">Compiled wording:</dt><dd lang={locale} dir="auto" className="theme-text-primary">{row.compiledTarget}</dd></> : null}
        {row.approved ? <><dt className="theme-text-muted">Approved wording:</dt><dd lang={locale} dir="auto" className="theme-text-primary">{row.approved.target}</dd></> : <><dt className="sr-only">Approved wording</dt><dd className="theme-text-faint text-xs sm:col-span-2">No human-approved wording is recorded for this context.</dd></>}
      </dl>
      {long ? <Textarea textareaSize="sm" lang={locale} dir="auto" aria-label={`Translation for ${row.id}`} className="[field-sizing:content] max-h-[70vh]" value={target} onChange={(event) => editTarget(event.target.value)} disabled={busy} /> : <Input inputSize="sm" lang={locale} dir="auto" aria-label={`Translation for ${row.id}`} value={target} onChange={(event) => editTarget(event.target.value)} disabled={busy} />}
      <CorrectionReasonFields value={correction} onChange={editCorrection} segment={row.id} source={row.source} target={target} mentions={row.glossary} locale={locale} disabled={busy} needed={dirty} noteLabel="Review note (optional)" noteAriaLabel={`Review note for ${row.id}`} />
      <ApprovalActions changed={dirty && Boolean(target.trim())} canSave={canSave} approvable={approvable} busy={busy} blocked={(dirty && !correction.kind) || conflicts.length > 0}
        onSave={() => void write("save").catch(() => {})} onSaveAndApprove={() => void write("save-approve").catch(() => {})} onApprove={() => void write("approve").catch(() => {})} />
      <ResultNotice notice={notice} onDismiss={() => setNotice(null)} />
      <TranslationHistory revision={row.revision} name={row.id} disabled={busy || dirty} load={async () => (await translationRequest<UiTranslationHistoryResponse>(`${endpoint}/history?locale=${encodeURIComponent(locale)}&id=${encodeURIComponent(row.id)}`)).history} restore={(revision) => write("restore", revision)} />
    </div>
  </li>;
}
