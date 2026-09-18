"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SubstanceArticle } from "@/schema";
import { PostgresError } from "@server/postgres/runtime/values";
import { validateArticleChange, type ArticleDocument } from "../../../../server/lib/articleLifecycleValidation";
import { applyEditableFieldWrite, parseEditableFieldPath, type EditableFieldValue } from "../../../../server/lib/articleFieldWrites";
import { findEquivalentReference } from "../../../../lib/citations/referenceIdentity.mjs";
import { ArticleFieldCommitError, type ArticleEditContextValue } from "./ArticleEditContext";
import type { ProposalSummary } from "@/features/dev/tools/queue/queueModel";

/**
 * What the local preview holds at one allow-listed field path, or `null` when
 * the path does not resolve to a leaf this editor can hold. Reads only; the
 * write walker in `articleFieldWrites` owns every mutation and its guards.
 */
function readEditableFieldValue(document: Record<string, unknown>, path: string): EditableFieldValue | null {
  const parts = parseEditableFieldPath(path);
  if (!parts) return null;
  let cursor: unknown = document;
  for (const segment of parts.segments) {
    if (typeof cursor !== "object" || cursor === null || Array.isArray(cursor)) return null;
    cursor = (cursor as Record<string, unknown>)[segment.key];
    if (segment.index === null) continue;
    if (!Array.isArray(cursor)) return null;
    cursor = cursor[segment.index];
  }
  if (typeof cursor === "string") return cursor;
  if (typeof cursor !== "object" || cursor === null || Array.isArray(cursor)) return null;
  if (!("min" in cursor) || !("max" in cursor) || !("unit" in cursor)) return null;
  const { min, max, unit } = cursor;
  if (typeof unit !== "string") return null;
  const lower = typeof min === "number" ? min : null;
  const upper = typeof max === "number" ? max : null;
  // A bound that is present but not a number means this leaf is not the range
  // the field would hold, so answer nothing rather than a coerced shape.
  if (lower === null && min !== null && min !== undefined) return null;
  if (upper === null && max !== null && max !== undefined) return null;
  return { min: lower, max: upper, unit };
}

export type ArticleRevision = {
  revisionId: string; actorEmail: string; createdAt: string; before: SubstanceArticle;
  after: SubstanceArticle; summary: string; baseHash: string; resultHash: string;
};
type Snapshot = {
  article: SubstanceArticle & { slug?: string }; baseHash: string;
  draft: { article: SubstanceArticle; baseHash: string; version: number; revisionOf?: string } | null;
  history: ArticleRevision[];
  draftVersion?: number;
  proposals?: ProposalSummary[];
};
export type ArticleLifecycleAction = "saveDraft" | "discardDraft" | "publish" | "submit" | "restore";

export function articleValidationIssues(article: SubstanceArticle, before: SubstanceArticle, publication = true): Array<{ path: string; message: string }> {
  try {
    validateArticleChange(before as unknown as ArticleDocument, article, publication);
    return [];
  } catch (failure) {
    if (failure instanceof PostgresError && failure.data && typeof failure.data === "object") {
      const data = failure.data as { path?: string; message?: string };
      const path = data.path ?? "article";
      const message = data.message ?? "The article change is invalid.";
      return [{ path, message: message.startsWith(`${path}: `) ? message.slice(path.length + 2) : message }];
    }
    return [{ path: "article", message: failure instanceof Error ? failure.message : "The article change is invalid." }];
  }
}

export function articlePublicationErrors(article: SubstanceArticle, before: SubstanceArticle): string[] {
  return articleValidationIssues(article, before).map((issue) => `${issue.path}: ${issue.message}`);
}

export function useArticleLifecycle(slug: string, initialArticle: SubstanceArticle, active: boolean) {
  const [article, setArticle] = useState(initialArticle);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [recovery, setRecovery] = useState<Snapshot | null>(null);
  const [baselineRefreshRequired, setBaselineRefreshRequired] = useState(false);
  const [savedArticle, setSavedArticle] = useState(initialArticle);
  const [baseHash, setBaseHash] = useState("");
  const [version, setVersion] = useState<number | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [revisionOf, setRevisionOf] = useState<string | undefined>();
  const [expired, setExpired] = useState(false);
  const current = useRef(article);
  current.current = article;
  const requestLock = useRef(false);
  // Keep an uncertain operation's identity and exact body for a deliberate retry.
  const pending = useRef<{ identity: string; changeId: string } | null>(null);
  const readSnapshot = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch(`/api/dev/article-lifecycle?slug=${encodeURIComponent(slug)}`, { signal, cache: "no-store" });
    const data = await response.json();
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) setExpired(true);
      throw new Error(data.error ?? "Could not load the current article and private draft.");
    }
    return data as Snapshot;
  }, [slug]);
  const adoptSnapshot = useCallback((next: Snapshot, published = false) => {
    const value = published ? next.article : next.draft?.article ?? next.article;
    setSnapshot(next);
    setBaseHash(published ? next.baseHash : next.draft?.baseHash ?? next.baseHash);
    setRevisionOf(published ? undefined : next.draft?.revisionOf);
    setVersion(next.draftVersion ?? next.draft?.version ?? 0);
    current.current = value;
    setArticle(value);
    setSavedArticle(value);
    setExpired(false);
    setBaselineRefreshRequired(false);
    setRecovery(null);
  }, []);
  const load = useCallback(async (signal?: AbortSignal) => {
    if (requestLock.current || pending.current) {
      setError("Reconcile the previous operation before loading another baseline. Your draft is retained.");
      return;
    }
    setError(null); setLoading(true);
    try {
      const next = await readSnapshot(signal);
      if (signal?.aborted || requestLock.current || pending.current) return;
      adoptSnapshot(next);
      return next;
    } catch (failure) {
      if (!signal?.aborted) setError(failure instanceof Error ? failure.message : "Could not load the article draft.");
    }
    finally { if (!signal?.aborted) setLoading(false); }
  }, [readSnapshot, adoptSnapshot]);
  useEffect(() => {
    if (!active || snapshot || expired) return;
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [active, snapshot, expired, load]);

  const preview = useCallback((next: SubstanceArticle) => {
    current.current = next;
    setArticle(next);
    setNotice(null);
  }, []);
  const commit: ArticleEditContextValue["commit"] = useCallback(async (path, value, expected) => {
    const result = applyEditableFieldWrite(current.current as unknown as Record<string, unknown>, path, value, { expected });
    if (result.ok === false) throw new ArticleFieldCommitError(result.reason, result.conflict ? "FIELD_CONFLICT" : null);
    preview({ ...current.current, [result.topLevelKey]: result.topLevelValue });
    return result.value;
  }, [preview]);
  // A refused write earns the recovery panel only when this can name what the
  // local preview actually holds now. Same kind or nothing: a path holding the
  // other kind answers null rather than something the field would coerce.
  const refreshStoredValue: ArticleEditContextValue["refreshStoredValue"] = useCallback((path, like) => {
    const stored = readEditableFieldValue(current.current as unknown as Record<string, unknown>, path);
    if (stored === null) return null;
    return typeof like === "string" ? (typeof stored === "string" ? stored : null) : (typeof stored === "string" ? null : stored);
  }, []);
  /**
   * Append one reference to the local preview and answer with the id a
   * citation marker must use. An equivalent source already on the article
   * answers with its own id and appends nothing, so citing the same paper
   * twice cannot fork it into two references.
   */
  const addReference: ArticleEditContextValue["addReference"] = useCallback((reference) => {
    const references = current.current.references ?? [];
    const existing = findEquivalentReference(references, reference);
    if (existing?.id) return existing.id;
    preview({ ...current.current, references: [...references, reference] });
    return reference.id;
  }, [preview]);

  const refresh = useCallback(async () => {
    if (requestLock.current || pending.current) throw new Error("Retry the exact previous operation before refreshing. Your draft is retained.");
    requestLock.current = true;
    setBusy(true); setError(null); setNotice(null);
    try {
      const next = await readSnapshot();
      // Stage the complete public article/hash pair without rebasing or replacing local work.
      setRecovery(next);
      setExpired(false);
      return next;
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not refresh the article. Your draft is retained.");
      throw failure;
    } finally { requestLock.current = false; setBusy(false); }
  }, [readSnapshot]);
  const reconcile = useCallback((keepDraft: boolean) => {
    if (!recovery || requestLock.current || pending.current) throw new Error("Load the latest baseline after reconciling the previous operation.");
    if (keepDraft) {
      const value = { ...current.current, id: recovery.article.id, slug: recovery.article.slug, editorial_review: recovery.article.editorial_review };
      setSnapshot(recovery);
      setBaseHash(recovery.baseHash);
      setVersion(recovery.draftVersion ?? recovery.draft?.version ?? 0);
      setSavedArticle(recovery.draft?.article ?? recovery.article);
      preview(value);
      setBaselineRefreshRequired(false);
      setRecovery(null);
      setNotice("Your draft now uses the refreshed public revision. Review and reconcile its differences before saving or publishing.");
    } else {
      adoptSnapshot(recovery);
      setNotice("Latest saved state loaded. Unsaved local edits were discarded; published content has not changed.");
    }
    setError(null);
  }, [recovery, preview, adoptSnapshot]);

  const act = useCallback(async (action: ArticleLifecycleAction, summary = "", revisionId?: string, candidate?: SubstanceArticle) => {
    if (!snapshot || expired || baselineRefreshRequired || recovery || requestLock.current) throw new Error("Article writes are unavailable. Refresh and reconcile the current baseline; your local changes are retained.");
    const nextArticle = candidate ?? current.current;
    if (action === "publish" || action === "submit") {
      const problems = articlePublicationErrors(nextArticle, snapshot.article);
      if (problems.length) { setError(problems.join("\n")); throw new Error(problems.join("\n")); }
    }
    const body = {
      action, slug, baseHash: action === "restore" ? snapshot.baseHash : baseHash,
      ...(action === "restore" ? { revisionId } : {}),
      ...(action === "saveDraft" || action === "publish" || action === "submit" ? { article: nextArticle } : {}),
      summary, ...(version === undefined ? {} : { draftVersion: version }),
      ...((action === "saveDraft" || action === "submit") && revisionOf ? { revisionOf } : {}),
    };
    const identity = JSON.stringify(body);
    if (pending.current && pending.current.identity !== identity) throw new Error("The previous operation has no confirmed outcome. Retry that exact operation before changing or discarding this draft.");
    if (!pending.current) pending.current = { identity, changeId: crypto.randomUUID() };
    if (candidate) preview(candidate);
    requestLock.current = true;
    setBusy(true); setError(null); setNotice(null);
    try {
      const response = await fetch("/api/dev/article-lifecycle", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, changeId: pending.current.changeId }),
      });
      const data = await response.json();
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) setExpired(true);
        if (response.status >= 400 && response.status < 500) pending.current = null;
        throw new Error(data.error ?? "The change was rejected. Your local changes are retained.");
      }
      pending.current = null;
      setUncertain(false);
      setVersion(data.draftVersion ?? data.draft?.version ?? version ?? 0);
      if (action === "saveDraft") {
        setSavedArticle(nextArticle); preview(nextArticle);
        setSnapshot((previous) => previous ? { ...previous, draftVersion: data.draftVersion, draft: { article: nextArticle, baseHash, version: data.draftVersion ?? data.draft?.version ?? 0, revisionOf } } : previous);
        setNotice("Private draft saved. Published content has not changed.");
      } else if (action === "discardDraft") {
        // The receipt has a hash but no article. Never pair it with our old public document.
        setBaselineRefreshRequired(true);
        setSnapshot({ ...snapshot, draft: null, draftVersion: data.draftVersion });
        setRevisionOf(undefined);
        let fresh: Snapshot;
        try { fresh = await readSnapshot(); } catch {
          setError("The saved draft was discarded, but the current article could not be loaded. Your local copy is retained. Refresh the latest baseline before continuing.");
          return;
        }
        if ((fresh.draftVersion ?? fresh.draft?.version ?? 0) !== data.draftVersion) {
          setRecovery(fresh);
          setNotice("The saved draft was discarded, then another tab changed it. Choose how to reconcile the latest saved state with your retained local copy.");
        } else {
          adoptSnapshot(fresh, true);
          setNotice("Private draft discarded. The current published article is loaded; published content has not changed.");
        }
      } else if (action === "submit") {
        setSavedArticle(nextArticle); preview(nextArticle);
        setSnapshot({ ...snapshot, draft: null, draftVersion: data.draftVersion });
        setRevisionOf(undefined);
        setNotice("Submitted for review. Published content has not changed.");
      } else {
        preview(data.article); setSavedArticle(data.article); setBaseHash(data.baseHash);
        setRevisionOf(undefined);
        setSnapshot({ article: data.article, baseHash: data.baseHash, draft: null, history: snapshot.history, draftVersion: data.draftVersion });
        setNotice(action === "restore" ? "Revision restored as a new published change." : "Article change published.");
      }
      // Read-only history/proposal refresh never changes the draft baseline.
      void fetch(`/api/dev/article-lifecycle?slug=${encodeURIComponent(slug)}`, { cache: "no-store" })
        .then(async (result) => { if (result.ok) { const fresh = await result.json() as Snapshot; setSnapshot((previous) => previous ? { ...previous, history: fresh.history, proposals: fresh.proposals } : previous); } }).catch(() => {});
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : "No confirmation received. Keep your draft and retry the same action to reconcile it.";
      setUncertain(pending.current !== null);
      setError(pending.current ? `No confirmation received. Retry the previous operation to reconcile it. ${message}` : message); throw failure;
    } finally { requestLock.current = false; setBusy(false); }
  }, [snapshot, expired, baselineRefreshRequired, recovery, slug, baseHash, version, preview, revisionOf, readSnapshot, adoptSnapshot]);
  const retry = useCallback(async () => {
    if (!pending.current) return;
    const request = JSON.parse(pending.current.identity);
    await act(request.action, request.summary, request.revisionId, request.article);
  }, [act]);
  const discardLocal = useCallback(() => {
    if (requestLock.current || pending.current || baselineRefreshRequired || recovery) return;
    preview(savedArticle);
    setBaseHash(snapshot?.draft?.baseHash ?? snapshot?.baseHash ?? "");
    setRevisionOf(snapshot?.draft?.revisionOf);
  }, [savedArticle, preview, snapshot, baselineRefreshRequired, recovery]);
  const getArticle = useCallback(() => current.current, []);
  const dirty = useMemo(() => JSON.stringify(article) !== JSON.stringify(savedArticle) || !!snapshot?.draft && baseHash !== snapshot.draft.baseHash, [article, savedArticle, snapshot?.draft, baseHash]);
  return { article, published: snapshot?.article ?? initialArticle, history: snapshot?.history ?? [],
    hasDraft: !!snapshot?.draft, publishedHash: snapshot?.baseHash, loaded: !!snapshot, expired, ready: !!snapshot && !expired && !baselineRefreshRequired, busy: busy || loading, error, notice, commit, refreshStoredValue, addReference, preview, act, discardLocal,
    dirty, load, refresh, recovery, reconcile, cancelRecovery: () => setRecovery(null), baselineRefreshRequired, getArticle, uncertain, retry, revisionOf, setRevisionOf, proposals: snapshot?.proposals ?? [] };
}
