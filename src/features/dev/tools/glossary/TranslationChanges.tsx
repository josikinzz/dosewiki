"use client";

import { useRef, useState } from "react";
import type { TranslationChangesResponse as ChangesResponse } from "@lib/translation/segmentHistoryTypes";
import { Button } from "@/components/ui/button";
import { Surface } from "@/components/ui/surface";
import { StateCard } from "@/components/common/StateCard";
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
  return <section aria-label="Translation changes" className="space-y-4">
    <p className="theme-text-secondary text-sm">Review automatic article and content updates with their English source, previous translated wording, model, and affected pages. History begins when change recording is enabled; older unrecorded changes cannot be reconstructed here.</p>
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void load()}>{busy ? "Loading changes" : data ? "Refresh recent changes" : "Load recent changes"}</Button>
      {data ? <Button type="button" variant="outline" size="sm" onClick={exportPage}>Export this page</Button> : null}
    </div>
    {error ? <StateCard compact tone="danger" title="Changes could not be loaded" description={error} /> : null}
    {!data ? <StateCard compact loading={busy} title={busy ? "Reading translation history" : "Recent changes have not been loaded"} description="Load the recorded changes for this locale to compare previous and updated wording." /> : <>
      <p className="theme-text-faint text-xs">These records show stored translation updates. Previous wording is preserved for review and export; restoring content requires a separate reviewed correction.</p>
      <div className="flex flex-wrap items-center gap-3" aria-label="Translation change pages">
        <Button type="button" variant="outline" size="sm" disabled={busy || cursors.length === 1} onClick={() => void load(cursors.slice(0, -1))}>Newer changes</Button>
        <span className="theme-text-secondary text-sm">Page {cursors.length} · {data.changes.length} changes</span>
        <Button type="button" variant="outline" size="sm" disabled={busy || !data.nextCursor} onClick={() => void load([...cursors, data.nextCursor])}>Older changes</Button>
      </div>
      {data.changes.length === 0 ? <StateCard compact title="No recorded changes" description="This does not mean no translations exist. Only changes recorded after history was enabled appear here." /> : null}
      {data.changes.map((change) => <Surface key={change.id} variant="subtle" padding="sm" radius="lg" className="space-y-3">
        <div className="flex flex-wrap justify-between gap-2"><h3 className="theme-text-primary font-medium">{change.before ? "Translation updated" : "Initial translation"}</h3><p className="theme-text-faint text-xs">{new Date(change.createdAt).toLocaleString()}</p></div>
        <p className="theme-text-secondary text-xs">Model: {change.after.model} · Translation instructions: {change.after.promptVersion}</p>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2"><h4 className="theme-text-primary text-sm font-medium">Before</h4>{change.before ? <><p className="theme-text-faint text-xs">English source</p><p className="theme-text-secondary whitespace-pre-wrap break-words text-sm">{change.before.source}</p><p className="theme-text-faint text-xs">Translation</p><p className="theme-text-primary whitespace-pre-wrap break-words text-sm">{change.before.target}</p><p className="theme-text-faint text-xs">Model: {change.before.model}</p></> : <p className="theme-text-secondary text-sm">No previous stored translation.</p>}</div>
          <div className="space-y-2"><h4 className="theme-text-primary text-sm font-medium">After</h4><p className="theme-text-faint text-xs">English source</p><p className="theme-text-secondary whitespace-pre-wrap break-words text-sm">{change.after.source}</p><p className="theme-text-faint text-xs">Translation</p><p className="theme-text-primary whitespace-pre-wrap break-words text-sm">{change.after.target}</p></div>
        </div>
        {change.pages.length ? <div className="space-y-1"><p className="theme-text-faint text-xs">Current pages using this source{(change.pagesTotal ?? change.pages.length) > change.pages.length ? ` (showing ${change.pages.length} of ${change.pagesTotal})` : ""}</p><ul className="flex flex-wrap gap-x-4 gap-y-2 text-sm">{change.pages.map((page) => <li key={page.href}><a className="theme-accent-underline underline" href={page.href}>{page.label}</a></li>)}</ul></div> : <p className="theme-text-faint text-xs">No current source-page links were found for this change.</p>}
      </Surface>)}
    </>}
  </section>;
}
