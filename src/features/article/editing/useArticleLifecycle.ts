"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SubstanceArticle } from "@/schema";
import { PostgresError } from "@server/postgres/runtime/values";
import { validateArticleChange, type ArticleDocument } from "../../../../server/lib/articleLifecycleValidation";
import { applyEditableFieldWrite, parseEditableFieldPath, type EditableFieldValue } from "../../../../server/lib/articleFieldWrites";
import { findEquivalentReference } from "../../../../lib/citations/referenceIdentity.mjs";
import { ArticleFieldCommitError, type ArticleEditContextValue } from "./ArticleEditContext";
import type { ProposalSummary } from "@/features/dev/tools/queue/queueModel";
import { articlePublicationNotice, type ArticlePublicationNotice } from "./publicationNotice";
import { articleSectionForPath, type ArticleEditorSection } from "./articleSections";
import { placeWords } from "./changeNote";
import { classifyLifecycleFailure, type LifecycleAction, type LifecycleFailure } from "./articleSessionModel";
import type { FeedbackRef } from "@/features/intake/feedbackCorrection";
import { articleArrayIdentity } from "../../../../lib/proposals/articlePatch";
import { mergeThreeWay, type MergeSide } from "../../../../lib/proposals/threeWayMerge";

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
  draft: { article: SubstanceArticle; baseHash: string; version: number; revisionOf?: string; updatedAt?: string } | null;
  history: ArticleRevision[];
  draftVersion?: number;
  proposals?: ProposalSummary[];
};
function articleAtRevision(hash: string, snapshots: Array<Snapshot | null>): SubstanceArticle | null {
  for (const candidate of snapshots) {
    if (!candidate) continue;
    if (candidate.baseHash === hash) return candidate.article;
    const revision = candidate.history?.find((entry) => entry.resultHash === hash);
    if (revision) return revision.after;
  }
  return null;
}

export type ArticleLifecycleAction = "saveDraft" | "discardDraft" | "publish" | "submit" | "restore";

export type ArticleValidationIssue = { path: string; message: string; sectionId: ArticleEditorSection | null };

export function articleValidationIssues(article: SubstanceArticle, before: SubstanceArticle, publication = true): ArticleValidationIssue[] {
  try {
    validateArticleChange(before as unknown as ArticleDocument, article, publication);
    return [];
  } catch (failure) {
    if (failure instanceof PostgresError && failure.data && typeof failure.data === "object") {
      const data = failure.data as { path?: string; message?: string };
      const path = data.path ?? "article";
      const message = data.message ?? "The article change is invalid.";
      return [{ path, message: message.startsWith(`${path}: `) ? message.slice(path.length + 2) : message, sectionId: articleSectionForPath(path) }];
    }
    return [{ path: "article", message: failure instanceof Error ? failure.message : "The article change is invalid.", sectionId: null }];
  }
}

export function describeValidationIssue(issue: ArticleValidationIssue): string {
  return issue.path === "article" ? issue.message : `${placeWords(issue.path)}: ${issue.message}`;
}

export function issueConcernsField(issuePath: string, fieldPath: string): boolean {
  const within = (inner: string, outer: string) =>
    inner === outer || inner.startsWith(`${outer}.`) || inner.startsWith(`${outer}[`);
  return within(issuePath, fieldPath) || within(fieldPath, issuePath);
}

export function fieldIssueMessage(issues: ArticleValidationIssue[], fieldPath: string): string | null {
  return issues.find((issue) => issue.path !== "article" && issueConcernsField(issue.path, fieldPath))?.message ?? null;
}

export function articlePublicationErrors(article: SubstanceArticle, before: SubstanceArticle): ArticleValidationIssue[] {
  return articleValidationIssues(article, before);
}

export function useArticleLifecycle(slug: string, initialArticle: SubstanceArticle, active: boolean) {
  const [article, setArticle] = useState(initialArticle);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [recovery, setRecovery] = useState<Snapshot | null>(null);
  const [baselineRefreshRequired, setBaselineRefreshRequired] = useState(false);
  const [mergeChoices, setMergeChoices] = useState<Record<string, MergeSide>>({});
  const [savedArticle, setSavedArticle] = useState(initialArticle);
  const [baseHash, setBaseHash] = useState("");
  const [version, setVersion] = useState<number | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [publication, setPublication] = useState<ArticlePublicationNotice | null>(null);
  const [submittedProposalId, setSubmittedProposalId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pendingAction, setPendingAction] = useState<LifecycleAction | null>(null);
  const [failure, setFailure] = useState<LifecycleFailure | null>(null);
  const [loading, setLoading] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [revisionOf, setRevisionOf] = useState<string | undefined>();
  const [feedbackRef, setFeedbackRef] = useState<FeedbackRef | undefined>();
  const [expired, setExpired] = useState(false);
  const current = useRef(article);
  current.current = article;
  useEffect(() => { setMergeChoices({}); }, [recovery]);
  const requestLock = useRef(false);
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
    setFailure(null);
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
      setError("Retry the unconfirmed change before loading another version. Your draft is kept.");
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
    setPublication(null);
  }, []);
  const commit: ArticleEditContextValue["commit"] = useCallback(async (path, value, expected) => {
    const result = applyEditableFieldWrite(current.current as unknown as Record<string, unknown>, path, value, { expected });
    if (result.ok === false) throw new ArticleFieldCommitError(result.reason, result.conflict ? "FIELD_CONFLICT" : null);
    preview({ ...current.current, [result.topLevelKey]: result.topLevelValue });
    return result.value;
  }, [preview]);
  const refreshStoredValue: ArticleEditContextValue["refreshStoredValue"] = useCallback((path, like) => {
    const stored = readEditableFieldValue(current.current as unknown as Record<string, unknown>, path);
    if (stored === null) return null;
    return typeof like === "string" ? (typeof stored === "string" ? stored : null) : (typeof stored === "string" ? null : stored);
  }, []);
  const addReference: ArticleEditContextValue["addReference"] = useCallback((reference) => {
    const references = current.current.references ?? [];
    const existing = findEquivalentReference(references, reference);
    if (existing?.id) return existing.id;
    preview({ ...current.current, references: [...references, reference] });
    return reference.id;
  }, [preview]);

  const refresh = useCallback(async () => {
    if (requestLock.current || pending.current) throw new Error("Retry the unconfirmed change before loading the latest version. Your draft is kept.");
    requestLock.current = true;
    setBusy(true); setError(null); setNotice(null);
    try {
      const next = await readSnapshot();
      setRecovery(next);
      setExpired(false);
      return next;
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not refresh the article. Your draft is retained.");
      throw failure;
    } finally { requestLock.current = false; setBusy(false); }
  }, [readSnapshot]);
  const merge = useMemo(() => {
    if (!recovery) return null;
    const base = articleAtRevision(baseHash, [snapshot, recovery]) ?? snapshot?.article ?? recovery.article;
    return mergeThreeWay<SubstanceArticle>(base, article, recovery.article, { choices: mergeChoices, identity: articleArrayIdentity });
  }, [recovery, snapshot, baseHash, article, mergeChoices]);
  const chooseMerge = useCallback((path: string, side: MergeSide) => setMergeChoices((choices) => ({ ...choices, [path]: side })), []);
  const reconcile = useCallback((keepDraft: boolean) => {
    if (!recovery || requestLock.current || pending.current) throw new Error("Retry the unconfirmed change before loading the latest version.");
    if (keepDraft) {
      if (!merge || merge.unresolved.length > 0) throw new Error("Choose a version for every field both of you changed before using the merged draft.");
      const value = { ...merge.merged, id: recovery.article.id, slug: recovery.article.slug, editorial_review: recovery.article.editorial_review };
      setSnapshot(recovery);
      setBaseHash(recovery.baseHash);
      setVersion(recovery.draftVersion ?? recovery.draft?.version ?? 0);
      setSavedArticle(recovery.draft?.article ?? recovery.article);
      preview(value);
      setBaselineRefreshRequired(false);
      setRecovery(null);
      setNotice("Your draft now holds your changes and the newer published ones, on the latest public revision. Review it before saving or publishing.");
    } else {
      adoptSnapshot(recovery);
      setNotice("Latest saved state loaded. Unsaved local edits were discarded; published content has not changed.");
    }
    setError(null); setFailure(null);
  }, [recovery, merge, preview, adoptSnapshot]);

  const act = useCallback(async (action: ArticleLifecycleAction, summary = "", revisionId?: string, candidate?: SubstanceArticle) => {
    if (!snapshot || expired || baselineRefreshRequired || recovery || requestLock.current) throw new Error("Article saving is unavailable. Load the latest published version and merge your edits; your local changes are kept.");
    const nextArticle = candidate ?? current.current;
    if (action === "publish" || action === "submit") {
      const problems = articlePublicationErrors(nextArticle, snapshot.article);
      if (problems.length) {
        const text = problems.map(describeValidationIssue).join("\n");
        setError(text); throw new Error(text);
      }
    }
    const body = {
      action, slug, baseHash: action === "restore" ? snapshot.baseHash : baseHash,
      ...(action === "restore" ? { revisionId } : {}),
      ...(action === "saveDraft" || action === "publish" || action === "submit" ? { article: nextArticle } : {}),
      summary, ...(version === undefined ? {} : { draftVersion: version }),
      ...((action === "saveDraft" || action === "submit") && revisionOf ? { revisionOf } : {}),
      ...((action === "submit" || action === "publish") && feedbackRef ? { feedbackRef } : {}),
    };
    const identity = JSON.stringify(body);
    if (pending.current && pending.current.identity !== identity) throw new Error("Your last change was not confirmed. Retry it before changing or discarding this draft.");
    if (!pending.current) pending.current = { identity, changeId: crypto.randomUUID() };
    if (candidate) preview(candidate);
    requestLock.current = true;
    setBusy(true); setError(null); setNotice(null); setPublication(null); setFailure(null); setPendingAction(action);
    try {
      const response = await fetch("/api/dev/article-lifecycle", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, changeId: pending.current.changeId }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) setExpired(true);
        const kind = classifyLifecycleFailure(response.status, data?.code);
        if (kind) {
          pending.current = null;
          setFailure({ kind, action, message: data.error ?? "The change was rejected. Your local changes are retained." });
        }
        throw new Error(data.error ?? "The change was rejected. Your local changes are retained.");
      }
      pending.current = null;
      setUncertain(false);
      setVersion(data.draftVersion ?? data.draft?.version ?? version ?? 0);
      if (action === "saveDraft") {
        setSavedArticle(nextArticle); preview(nextArticle);
        setSnapshot((previous) => previous ? { ...previous, draftVersion: data.draftVersion, draft: { article: nextArticle, baseHash, version: data.draftVersion ?? data.draft?.version ?? 0, revisionOf, updatedAt: new Date().toISOString() } } : previous);
        setNotice("Private draft saved. Published content has not changed.");
      } else if (action === "discardDraft") {
        setBaselineRefreshRequired(true);
        setSnapshot({ ...snapshot, draft: null, draftVersion: data.draftVersion });
        setRevisionOf(undefined);
        let fresh: Snapshot;
        try { fresh = await readSnapshot(); } catch {
          setError("The saved draft was discarded, but the current article could not be loaded. Your local copy is retained. Load the latest published version before continuing.");
          return;
        }
        if ((fresh.draftVersion ?? fresh.draft?.version ?? 0) !== data.draftVersion) {
          setRecovery(fresh);
          setNotice("The saved draft was discarded, then another tab changed it. Choose how to merge the latest saved version with your local copy.");
        } else {
          adoptSnapshot(fresh, true);
          setNotice("Private draft discarded. The current published article is loaded; published content has not changed.");
        }
      } else if (action === "submit") {
        preview(snapshot.article); setSavedArticle(snapshot.article); setBaseHash(snapshot.baseHash);
        setSnapshot({ ...snapshot, draft: null, draftVersion: data.draftVersion });
        setRevisionOf(undefined);
        setFeedbackRef(undefined);
        if (typeof data.proposalId === "string") setSubmittedProposalId(data.proposalId);
        setNotice("Submitted for review. Published content has not changed.");
      } else {
        preview(data.article); setSavedArticle(data.article); setBaseHash(data.baseHash);
        setRevisionOf(undefined);
        if (action === "publish") setFeedbackRef(undefined);
        setSnapshot({ article: data.article, baseHash: data.baseHash, draft: null, history: snapshot.history, draftVersion: data.draftVersion });
        const delivery = articlePublicationNotice(slug, data.publication);
        setPublication(delivery);
        setNotice(action === "restore" ? `Revision restored as a new change. ${delivery.message}` : delivery.message);
      }
      void fetch(`/api/dev/article-lifecycle?slug=${encodeURIComponent(slug)}`, { cache: "no-store" })
        .then(async (result) => { if (result.ok) { const fresh = await result.json() as Snapshot; setSnapshot((previous) => previous ? { ...previous, history: fresh.history, proposals: fresh.proposals } : previous); } }).catch(() => {});
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : "No confirmation received. Keep your draft and retry the same action to confirm it.";
      setUncertain(pending.current !== null);
      setError(pending.current ? `No confirmation received. Retry your last change to confirm it. ${message}` : message); throw failure;
    } finally { requestLock.current = false; setBusy(false); setPendingAction(null); }
  }, [snapshot, expired, baselineRefreshRequired, recovery, slug, baseHash, version, preview, revisionOf, feedbackRef, readSnapshot, adoptSnapshot]);
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
  const published = snapshot?.article ?? initialArticle;
  const isFieldChanged = useCallback((path: string) => {
    const before = readEditableFieldValue(published as unknown as Record<string, unknown>, path);
    const after = readEditableFieldValue(article as unknown as Record<string, unknown>, path);
    return JSON.stringify(before) !== JSON.stringify(after);
  }, [published, article]);
  const dirty = useMemo(() => JSON.stringify(article) !== JSON.stringify(savedArticle) || !!snapshot?.draft && baseHash !== snapshot.draft.baseHash, [article, savedArticle, snapshot?.draft, baseHash]);
  return { article, published, isFieldChanged, history: snapshot?.history ?? [],
    hasDraft: !!snapshot?.draft, draftSavedAt: snapshot?.draft?.updatedAt ?? null, pendingAction, failure, clearFailure: () => setFailure(null), publishedHash: snapshot?.baseHash, loaded: !!snapshot, expired, ready: !!snapshot && !expired && !baselineRefreshRequired, busy: busy || loading, error, notice, publication, commit, refreshStoredValue, addReference, preview, act, discardLocal,
    dirty, load, refresh, recovery, merge, mergeChoices, chooseMerge, reconcile, cancelRecovery: () => setRecovery(null), baselineRefreshRequired, getArticle, uncertain, retry, revisionOf, setRevisionOf, feedbackRef, setFeedbackRef, proposals: snapshot?.proposals ?? [], submittedProposalId };
}
