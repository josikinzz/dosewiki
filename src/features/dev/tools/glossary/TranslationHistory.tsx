"use client";

import { useEffect, useRef, useState } from "react";
import type { ReviewHistoryEntry, ReviewState } from "@lib/translation/reviewTypes";
import { formatReviewReason } from "../../../../../lib/translation/reviewReason";
import { ExpandButton } from "@/components/common/ExpandButton";
import { Button } from "@/components/ui/button";
import { When } from "./workbenchParts";

export class TranslationRequestError extends Error {
  constructor(message: string, readonly code: string | undefined, readonly payload: Record<string, unknown>) { super(message); }
}

export async function translationRequest<T>(url: string, body?: Record<string, unknown>): Promise<T> {
  const response = await fetch(url, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : undefined);
  const payload = await response.json();
  if (!response.ok) throw new TranslationRequestError(payload.error ?? "The translation request failed.", typeof payload.code === "string" ? payload.code : undefined, payload);
  return payload as T;
}

function HistorySnapshot({ state, title, other }: { state: ReviewState; title: string; other?: ReviewState }) {
  const snapshot = state.draft ?? state.approved;
  const was = other ? other.draft ?? other.approved : null;
  const sameSource = Boolean(was && snapshot && was.source === snapshot.source && was.context === snapshot.context);
  return <div className="min-w-0 space-y-1" aria-label={title}>
    <p className="type-meta-label theme-text-muted">{title}</p>
    {snapshot ? <dl className="space-y-1 break-words">
      {sameSource ? null : <>
        <div><dt className="theme-text-faint">English source</dt><dd lang="en" className="theme-text-secondary whitespace-pre-wrap">{snapshot.source}</dd></div>
        <div><dt className="theme-text-faint">Context</dt><dd className="theme-text-secondary whitespace-pre-wrap">{snapshot.context || "No context recorded"}</dd></div>
      </>}
      <div><dt className="theme-text-faint">Translation</dt><dd dir="auto" className="theme-text-primary whitespace-pre-wrap">{snapshot.target}</dd></div>
    </dl> : <p className="theme-text-secondary">No translation</p>}
  </div>;
}

export function TranslationHistory({ name, revision, load, restore, disabled = false }: {
  name: string;
  revision: string | number;
  load: () => Promise<ReviewHistoryEntry[]>;
  restore: (revision: number) => Promise<void>;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState<ReviewHistoryEntry[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadRef = useRef(load);
  useEffect(() => { loadRef.current = load; }, [load]);
  useEffect(() => {
    if (!open) return;
    let active = true;
    setBusy(true);
    setError(null);
    void loadRef.current().then((entries) => { if (active) setHistory(entries); })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Unable to load history."); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [open, revision]);
  const restoreSnapshot = async (restoreRevision: number) => {
    setBusy(true); setError(null);
    try { await restore(restoreRevision); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to restore this revision."); }
    finally { setBusy(false); }
  };
  return <div className="space-y-2">
    <ExpandButton variant="inline" className="-ml-1 text-current" isExpanded={open} ariaLabel={`History for ${name}`} onToggle={() => setOpen(!open)}>History</ExpandButton>
    {open ? <div className="space-y-3">
      {error ? <p role="alert" className="text-sm text-[color:var(--theme-danger-text)]">{error}</p> : null}
      {busy ? <p role="status" className="theme-text-muted text-xs">Loading history</p> : null}
      {history?.length === 0 ? <p className="theme-text-faint text-xs">No recorded review history. Imported or older translations are not evidence of human review.</p> : null}
      {history?.length ? <ol className="theme-dev-link-list">{history.map((entry) => <li key={entry.revision} className="space-y-2 py-3 text-xs">
        <p className="theme-text-primary font-medium">Revision {entry.revision} · {entry.action === "approve" ? "Approved" : entry.action === "restore" ? "Restored as draft" : "Draft saved"}</p>
        <p className="theme-text-secondary">{entry.actor} · <When at={entry.createdAt} withTime /></p>
        <div className="grid gap-3 sm:grid-cols-2"><HistorySnapshot title="Before" state={entry.before} /><HistorySnapshot title="After" state={entry.after} other={entry.before} /></div>
        <p className="theme-text-secondary">{formatReviewReason(entry.reason)}</p>
        {entry.glossaryExceptions?.length ? <p className="theme-text-faint">Kept out on purpose: {entry.glossaryExceptions.join(", ")}</p> : null}
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" disabled={disabled || busy} onClick={() => void restoreSnapshot(entry.revision)}>Restore revision {entry.revision} as draft</Button>
          {entry.before.revision === 0 && entry.before.draft?.provenance === "compiled" ? <Button type="button" variant="outline" size="sm" disabled={disabled || busy} onClick={() => void restoreSnapshot(0)}>Restore original compiled wording as draft</Button> : null}
        </div>
      </li>)}</ol> : null}
    </div> : null}
  </div>;
}
