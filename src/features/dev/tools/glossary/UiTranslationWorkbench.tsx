"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { UiTranslationRow, UiTranslationListResponse, UiTranslationHistoryResponse, UiTranslationWriteResponse } from "@lib/translation/uiTranslationTypes";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Surface } from "@/components/ui/surface";
import { StateCard } from "@/components/common/StateCard";
import { EditorNotice, EditorStatusPill, type EditorNoticeMessage } from "@/features/dev/components";
import { TranslationHistory, translationRequest } from "./TranslationHistory";
import { ShortLabelGrid } from "./ShortLabelGrid";
import { PendingRefreshList } from "./PendingRefreshList";

export type UiEditDrafts = Map<string, { target: string; reason: string }>;

const endpoint = "/api/dev/translation-workbench";

export function UiTranslationWorkbench({ locale, editDrafts, initialSearch = "" }: { locale: string; editDrafts?: UiEditDrafts; initialSearch?: string }) {
  const localEdits = useRef<UiEditDrafts>(new Map());
  const edits = editDrafts ?? localEdits.current;
  const [rows, setRows] = useState<UiTranslationRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState(initialSearch);
  const [page, setPage] = useState(0);
  const [mode, setMode] = useState<"cards" | "short" | "refresh">("cards");
  const [catalogRefreshed, setCatalogRefreshed] = useState(true);
  const load = useCallback(async () => {
    setError(null);
    try { const result = await translationRequest<UiTranslationListResponse>(`${endpoint}?locale=${encodeURIComponent(locale)}`); setRows(result.rows); setCatalogRefreshed(result.catalogRefreshed ?? true); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to load UI labels."); }
  }, [locale]);
  useEffect(() => { void load(); }, [load]);
  const needle = search.trim().toLowerCase();
  const shown = rows?.filter((row) => [row.source, row.context, row.id, row.draft?.target ?? "", row.approved?.target ?? row.compiledTarget ?? ""].some((value) => value.toLowerCase().includes(needle)));
  return <section aria-label="UI labels" className="space-y-4">
    <p className="theme-text-secondary text-sm">Set the exact wording for each meaning. Saving creates an unreviewed draft. Approval preserves human wording for the next UI catalog build; deployment and public verification are still required.</p>
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" variant="outline" size="sm" onClick={() => void load()}>Reload UI labels</Button>
      <div role="group" aria-label="UI label view" className="flex gap-1">
        <Button type="button" variant={mode === "cards" ? "accent" : "outline"} size="sm" aria-pressed={mode === "cards"} onClick={() => setMode("cards")}>One at a time</Button>
        <Button type="button" variant={mode === "short" ? "accent" : "outline"} size="sm" aria-pressed={mode === "short"} onClick={() => setMode("short")}>Short labels</Button>
        <Button type="button" variant={mode === "refresh" ? "accent" : "outline"} size="sm" aria-pressed={mode === "refresh"} onClick={() => setMode("refresh")}>Waiting for glossary refresh{rows ? ` (${rows.filter((row) => row.pendingRefresh).length})` : ""}</Button>
      </div>
    </div>
    <Input inputSize="sm" type="search" aria-label="Search UI labels" placeholder="Search English, translation, or context" value={search} onChange={(event) => { setSearch(event.target.value); setPage(0); }} />
    {error ? <StateCard compact tone="danger" title="UI labels could not be loaded" description={error} actions={<Button variant="outline" size="sm" onClick={() => void load()}>Retry</Button>} /> : null}
    {rows === null && !error ? <StateCard compact loading title="Loading UI labels" /> : null}
    {rows ? <p className="theme-text-faint text-xs">{rows.filter((row) => row.status === "draft").length} drafts · {rows.filter((row) => row.status === "approved").length} approved · {rows.filter((row) => row.status === "missing").length} missing from compiled catalog · {rows.filter((row) => row.status === "unreviewed").length} without human review · {rows.filter((row) => row.status === "stale").length} source changes needing review. These labels cover the registered contexts listed below.</p> : null}
    {shown && mode === "short" ? <ShortLabelGrid locale={locale} rows={shown} edits={edits} update={(next) => { const byId = new Map(next.map((row) => [row.id, row])); setRows((current) => current?.map((item) => byId.get(item.id) ?? item) ?? null); }} /> : null}
    {shown && mode === "refresh" ? <PendingRefreshList rows={shown} refreshed={catalogRefreshed} review={(row) => { setSearch(row.id); setPage(0); setMode("cards"); }} /> : null}
    {shown?.length === 0 && mode === "cards" ? <StateCard compact title="No labels match" description="Try a different English label, translation, or context." /> : null}
    {shown && mode === "cards" && shown.length > 30 ? <div className="flex flex-wrap items-center gap-3" aria-label="UI label pages">
      <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((value) => value - 1)}>Previous labels</Button>
      <span className="theme-text-secondary text-sm">{page * 30 + 1} to {Math.min((page + 1) * 30, shown.length)} of {shown.length}</span>
      <Button variant="outline" size="sm" disabled={(page + 1) * 30 >= shown.length} onClick={() => setPage((value) => value + 1)}>Next labels</Button>
    </div> : null}
    {mode === "cards" && shown?.slice(page * 30, (page + 1) * 30).map((row) => <UiLabel key={row.id} locale={locale} row={row} edits={edits} update={(next) => setRows((current) => current?.map((item) => item.id === next.id ? next : item) ?? null)} />)}
  </section>;
}

function UiLabel({ locale, row, update, edits }: { locale: string; row: UiTranslationRow; edits: UiEditDrafts; update: (row: UiTranslationRow) => void }) {
  const inputId = useId();
  const editKey = `${locale}:${row.id}`;
  const [target, setTarget] = useState(edits.get(editKey)?.target ?? row.draft?.target ?? row.approved?.target ?? row.compiledTarget ?? "");
  const [reason, setReason] = useState(edits.get(editKey)?.reason ?? "");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<EditorNoticeMessage | null>(null);
  const inFlight = useRef(false);
  useEffect(() => { setTarget(edits.get(editKey)?.target ?? row.draft?.target ?? row.approved?.target ?? row.compiledTarget ?? ""); setReason(edits.get(editKey)?.reason ?? ""); }, [row, edits, editKey]);
  const editTarget = (value: string) => { edits.set(editKey, { target: value, reason }); setTarget(value); };
  const editReason = (value: string) => { edits.set(editKey, { target, reason: value }); setReason(value); };
  const savedTarget = row.draft?.target ?? row.approved?.target ?? row.compiledTarget ?? "";
  const dirty = target.trim() !== savedTarget;
  const write = async (action: "save" | "approve" | "restore", restoreRevision?: number) => {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setNotice(null);
    try {
      const result = await translationRequest<UiTranslationWriteResponse>(endpoint, {
        locale, id: row.id, action, expectedRevision: row.revision,
        ...(action === "save" ? { target: target.trim() } : {}),
        ...(restoreRevision === undefined ? {} : { restoreRevision }),
        reason: reason.trim() || (action === "approve" ? "Reviewed wording in its UI context." : action === "restore" ? `Restore revision ${restoreRevision} for review.` : "Correct UI wording."),
      });
      edits.delete(editKey);
      update(result.row); setReason("");
      setNotice({ tone: "success", message: action === "approve" ? "Approved. Awaiting a UI catalog build, deployment, and public verification." : action === "restore" ? "Restored as a draft. Review the wording before approving." : "Draft saved. The approved wording is unchanged." });
    } catch (cause) {
      setNotice({ tone: "danger", message: cause instanceof Error ? cause.message : "The change was not saved." });
      // Keep the typed rendering on errors; a stale revision must be deliberately reviewed.
      throw cause;
    } finally { inFlight.current = false; setBusy(false); }
  };
  return <Surface variant="subtle" padding="sm" radius="lg" className="space-y-3" aria-label={`${row.source}: ${row.context}`}>
    <div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="theme-text-primary whitespace-pre-wrap break-words font-medium">{row.source}</h3><p className="theme-text-secondary text-sm">{row.context}</p></div><EditorStatusPill tone={row.status === "approved" ? "success" : "warning"}>{row.status === "stale" ? "Source changed" : row.status === "unreviewed" ? "No human review" : row.status}</EditorStatusPill></div>
    <p className="theme-text-faint break-words text-xs">Used in: {row.locations.join(" · ")}</p>
    {row.glossaryTerms.length ? <p className="theme-text-faint text-xs">Glossary terms: {row.glossaryTerms.join(", ")}</p> : null}
    {row.compiledTarget ? <p className="theme-text-secondary text-sm">Compiled wording (not verified live): <span className="theme-text-primary">{row.compiledTarget}</span></p> : null}
    {row.approved ? <p className="theme-text-secondary text-sm">Approved wording: <span className="theme-text-primary">{row.approved.target}</span></p> : <p className="theme-text-faint text-xs">No human-approved wording is recorded for this context.</p>}
    <div className="space-y-1"><label htmlFor={inputId} className="theme-text-secondary text-xs">Translation</label>{row.source.length > 100 || row.source.includes("\n") || target.length > 100 || target.includes("\n") ? <Textarea id={inputId} textareaSize="sm" aria-label={`Translation for ${row.id}`} value={target} onChange={(event) => editTarget(event.target.value)} disabled={busy} /> : <Input id={inputId} inputSize="sm" aria-label={`Translation for ${row.id}`} value={target} onChange={(event) => editTarget(event.target.value)} disabled={busy} />}</div>
    <div className="space-y-1"><label htmlFor={`${inputId}-note`} className="theme-text-secondary text-xs">Review note (optional)</label><Input id={`${inputId}-note`} inputSize="sm" aria-label={`Review note for ${row.id}`} placeholder="Explain the wording or correction" value={reason} onChange={(event) => editReason(event.target.value)} disabled={busy} /></div>
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" variant="outline" size="sm" disabled={busy || !target.trim() || (!dirty && row.status !== "stale" && row.status !== "unreviewed")} onClick={() => void write("save").catch(() => {})}>Save draft</Button>
      <Button type="button" variant="accent" size="sm" disabled={busy || dirty || !row.draft || row.draft.source !== row.source || row.draft.context !== row.context} onClick={() => void write("approve").catch(() => {})}>Approve saved draft</Button>
      <span className="theme-text-faint text-xs">Revision {row.revision}</span>
    </div>
    {notice ? <EditorNotice notice={notice} /> : null}
    <TranslationHistory revision={row.revision} name={row.id} disabled={busy || dirty} load={async () => (await translationRequest<UiTranslationHistoryResponse>(`${endpoint}/history?locale=${encodeURIComponent(locale)}&id=${encodeURIComponent(row.id)}`)).history} restore={(revision) => write("restore", revision)} />
  </Surface>;
}
