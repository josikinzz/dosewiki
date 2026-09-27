"use client";

import { useRef, useState } from "react";
import type { TranslationChangesResponse as ChangesResponse } from "@lib/translation/segmentHistoryTypes";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/common/Icon";
import { StateCard } from "@/components/common/StateCard";
import { LoadErrorState } from "@/features/dev/components";
import { formatSaveMoment, formatSaveTime, groupByDay } from "@/features/dev/pages/changeLogModel";
import { RowSkeletons } from "./workbenchParts";
import { translationRequest } from "./TranslationHistory";

export function TranslationChanges({ locale }: { locale: string }) {
  const [data, setData] = useState<ChangesResponse | null>(null);
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const load = async (nextCursors: (string | null)[] = [null]) => {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(null);
    try {
      const cursor = nextCursors[nextCursors.length - 1];
      const result = await translationRequest<ChangesResponse>(`/api/dev/translation-changes?locale=${encodeURIComponent(locale)}&limit=50${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`);
      setData(result); setCursors(nextCursors);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to load translation changes."); }
    finally { inFlight.current = false; setBusy(false); }
  };
  const exportPage = () => {
    if (!data) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = `translation-changes-${locale}-page-${cursors.length}.json`; anchor.click();
    URL.revokeObjectURL(url);
  };
  const days = data ? groupByDay(data.changes, (change) => new Date(change.createdAt).toISOString()) : [];
  const pager = data ? (
    <nav className="flex flex-wrap items-center gap-2" aria-label="Translation change pages">
      <Button type="button" variant="outline" size="sm" disabled={busy || cursors.length === 1} onClick={() => void load(cursors.slice(0, -1))}><Icon icon="lucide:chevron-left" size={14} />Newer changes</Button>
      <span className="theme-text-secondary text-sm tabular-nums">Page {cursors.length} · {data.changes.length} changes</span>
      <Button type="button" variant="outline" size="sm" disabled={busy || !data.nextCursor} onClick={() => void load([...cursors, data.nextCursor])}>Older changes<Icon icon="lucide:chevron-right" size={14} /></Button>
    </nav>
  ) : null;
  return <section aria-label="Translation changes" className="space-y-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <p className="theme-text-secondary max-w-prose text-sm">Automatic article and content updates, with their English, the wording before and after, and the pages that use them. History begins when change recording was enabled; older changes cannot be reconstructed here.</p>
      <div className="flex flex-wrap items-center gap-2">
        {data ? <Button type="button" variant="ghost" size="sm" onClick={exportPage}><Icon icon="lucide:download" size={14} />Export this page</Button> : null}
        <Button type="button" variant={data ? "outline" : "accent"} size="sm" disabled={busy} aria-busy={busy || undefined} onClick={() => void load()}>
          <Icon icon="lucide:refresh-cw" size={14} className={busy ? "motion-safe:animate-spin" : undefined} />
          {busy ? "Loading changes" : data ? "Refresh recent changes" : "Load recent changes"}
        </Button>
      </div>
    </div>
    {error ? <LoadErrorState what="the recent changes" message={error} onRetry={() => void load(cursors)} busy={busy} /> : null}
    {!data ? (
      busy ? <RowSkeletons rows={3} label="translation history" /> : (
        <div className="rounded-card border border-dashed border-[color:var(--editor-panel-border)] px-5 py-6">
          <p className="theme-text-primary font-medium">Recent changes have not been loaded</p>
          <p className="theme-text-secondary mt-1 text-sm">Load the recorded changes for this language to compare previous and updated wording.</p>
        </div>
      )
    ) : <>
      <p className="theme-text-faint text-xs">These records show stored translation updates. Previous wording is preserved for review and export; restoring content requires a separate reviewed correction.</p>
      {pager}
      {data.changes.length === 0 ? <StateCard compact title="No recorded changes" description="This does not mean no translations exist. Only changes recorded after history was enabled appear here." /> : null}
      {days.map((day) => (
        <section key={day.key} aria-label={day.full} className="space-y-2">
          <h3 className="flex items-baseline gap-2"><span className="theme-text-primary text-sm font-semibold" title={day.full}>{day.label}</span><span className="theme-text-muted text-xs tabular-nums">{day.items.length}</span></h3>
          <ol className="theme-dev-link-list">
            {day.items.map((change) => {
              const englishChanged = Boolean(change.before && change.before.source !== change.after.source);
              return <li key={change.id} className="space-y-3 py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h4 className="theme-text-primary text-sm font-medium">{change.before ? "Translation updated" : "Initial translation"}{englishChanged ? ", English changed" : ""}</h4>
                  <p className="theme-text-muted text-xs" title={`${change.after.model} · instructions ${change.after.promptVersion}`}><time dateTime={new Date(change.createdAt).toISOString()} title={formatSaveMoment(new Date(change.createdAt).toISOString())}>{formatSaveTime(new Date(change.createdAt).toISOString())}</time></p>
                </div>
                {englishChanged ? null : <p lang="en" className="theme-text-secondary whitespace-pre-wrap break-words text-sm"><span className="type-meta-label theme-text-muted mr-2">English</span>{change.after.source}</p>}
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="min-w-0 space-y-1">
                    <h5 className="type-meta-label theme-text-muted">Before</h5>
                    {change.before ? <>
                      {englishChanged ? <p lang="en" className="theme-text-muted whitespace-pre-wrap break-words text-xs">{change.before.source}</p> : null}
                      <p className="theme-text-secondary whitespace-pre-wrap break-words text-sm">{change.before.target}</p>
                      <p className="theme-text-faint text-xs">Model: {change.before.model}</p>
                    </> : <p className="theme-text-muted text-sm">No previous stored translation.</p>}
                  </div>
                  <div className="min-w-0 space-y-1">
                    <h5 className="type-meta-label theme-text-muted">After</h5>
                    {englishChanged ? <p lang="en" className="theme-text-muted whitespace-pre-wrap break-words text-xs">{change.after.source}</p> : null}
                    <p className="theme-text-primary whitespace-pre-wrap break-words text-sm">{change.after.target}</p>
                    <p className="theme-text-faint text-xs">Model: {change.after.model} · Translation instructions: {change.after.promptVersion}</p>
                  </div>
                </div>
                {change.pages.length ? <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm"><span className="theme-text-muted text-xs">Used on{(change.pagesTotal ?? change.pages.length) > change.pages.length ? ` (showing ${change.pages.length} of ${change.pagesTotal})` : ""}</span><ul className="flex flex-wrap gap-x-4 gap-y-1">{change.pages.map((page) => <li key={page.href}><a className="text-dose-accent-strong theme-accent-underline underline-offset-4 hover:underline" href={page.href} target="_blank" rel="noopener noreferrer">{page.label}</a></li>)}</ul></div> : <p className="theme-text-faint text-xs">No current source-page links were found for this change.</p>}
              </li>;
            })}
          </ol>
        </section>
      ))}
    </>}
  </section>;
}
