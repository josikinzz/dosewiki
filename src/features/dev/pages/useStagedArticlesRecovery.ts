import { useCallback, useEffect, useRef, useState } from "react";

import { contentHash } from "../../../../lib/proposals/contentHash";
import type { ArticleRecord } from "../context/devModeTypes";
import { resolveEditorArticleSlug } from "../context/devModeUtils";
import { isSameDocument } from "../context/editorDocumentSession";
import { useDraftRecoveryStore } from "../recovery/DraftRecoveryContext";
import type { DraftCheckpoint } from "../recovery/draftRecovery";
import type { MergeSide, ThreeWayMerge } from "../../../../lib/proposals/threeWayMerge";
import {
  applyMergedStagedArticle,
  applyStagedArticleChange,
  mergeStagedArticleChange,
  NEW_ARTICLE_BASELINE,
  stagedArticleBaseline,
  stagedArticleChanges,
  type StagedArticleChange,
  type StagedArticlesDraft,
} from "./stagedArticlesRecovery";

const TOOL = "staged-articles" as const;
const RECORD = "working-set";
const CHECKPOINT_DELAY_MS = 800;

export type HeldStagedChange = {
  change: StagedArticleChange;
  current: ArticleRecord | null;
  merge: ThreeWayMerge<Record<string, unknown>> | null;
  choices: Record<string, MergeSide>;
};

export type StagedArticlesRecovery = {
  offer: DraftCheckpoint<StagedArticlesDraft> | null;
  held: HeldStagedChange[] | null;
  restoring: boolean;
  error: string | null;
  checkpointSavedAt: number | null;
  restore: () => Promise<void>;
  discardOffer: () => void;
  applyHeld: (slug: string) => void;
  chooseHeld: (slug: string, path: string, side: MergeSide) => void;
  dismissHeld: () => void;
  forget: () => void;
};

const bySlug = (slug: string) => (article: ArticleRecord | undefined) =>
  !!article && resolveEditorArticleSlug(article) === slug;

export function useStagedArticlesRecovery({
  articles,
  getOriginalArticles,
  getArticleBaseHashes,
  restoreArticleBaseHashes,
  applyArticlesTransform,
  hydrateArticlesNow,
  hasChanges,
  libraryReady,
}: {
  articles: ArticleRecord[];
  getOriginalArticles: () => ArticleRecord[];
  getArticleBaseHashes?: () => Record<string, string>;
  restoreArticleBaseHashes?: (hashes: Record<string, string>) => void;
  applyArticlesTransform: (transform: (previous: ArticleRecord[]) => ArticleRecord[]) => void;
  hydrateArticlesNow: (slugs: readonly string[]) => Promise<{ ok: boolean; articles: ArticleRecord[] }>;
  hasChanges: boolean;
  libraryReady: boolean;
}): StagedArticlesRecovery {
  const store = useDraftRecoveryStore();
  const [offer, setOffer] = useState<DraftCheckpoint<StagedArticlesDraft> | null>(null);
  const [held, setHeld] = useState<HeldStagedChange[] | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkpointSavedAt, setCheckpointSavedAt] = useState<number | null>(null);
  const checkedActorRef = useRef<string | null>(null);
  const flushRef = useRef<(() => void) | null>(null);
  const articlesRef = useRef(articles);
  articlesRef.current = articles;
  const baseHashesRef = useRef(getArticleBaseHashes);
  baseHashesRef.current = getArticleBaseHashes;
  const originalsRef = useRef(getOriginalArticles);
  originalsRef.current = getOriginalArticles;

  useEffect(() => {
    if (!store || !libraryReady) return;
    if (checkedActorRef.current !== store.actor) {
      checkedActorRef.current = store.actor;
      const found = store.read<StagedArticlesDraft>(TOOL, RECORD);
      if (found && found.draft.changes.length > 0) {
        setOffer(found);
        return;
      }
    }
    if (offer || held || restoring) return;
    if (!hasChanges) {
      flushRef.current = null;
      store.clear(TOOL, RECORD);
      setCheckpointSavedAt(null);
      return;
    }
    const write = () => {
      flushRef.current = null;
      const changes = stagedArticleChanges(articlesRef.current, originalsRef.current(), baseHashesRef.current?.());
      if (changes.length === 0) {
        store.clear(TOOL, RECORD);
        setCheckpointSavedAt(null);
        return;
      }
      setCheckpointSavedAt(store.write<StagedArticlesDraft>({
        tool: TOOL,
        record: RECORD,
        baseline: contentHash(changes.map((change) => change.baseline)),
        draft: { changes },
      }));
    };
    flushRef.current = write;
    const timer = window.setTimeout(write, CHECKPOINT_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [store, libraryReady, articles, hasChanges, offer, held, restoring]);

  useEffect(() => {
    const flush = () => flushRef.current?.();
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, []);

  const restore = useCallback(async () => {
    if (!offer || restoring) return;
    setRestoring(true);
    setError(null);
    try {
      const changes = offer.draft.changes;
      const { articles: landed } = await hydrateArticlesNow(
        changes.filter((change) => change.baseline !== NEW_ARTICLE_BASELINE).map((change) => change.slug),
      );
      const landedBySlug = new Map(landed.map((article) => [resolveEditorArticleSlug(article), article]));
      const working = articlesRef.current;
      const originals = originalsRef.current();
      const apply: Array<{ change: StagedArticleChange; current: ArticleRecord | undefined }> = [];
      const aside: HeldStagedChange[] = [];
      for (const change of changes) {
        const current = landedBySlug.get(change.slug) ?? originals.find(bySlug(change.slug));
        const workingRow = working.find(bySlug(change.slug));
        const originalRow = originals.find(bySlug(change.slug));
        const editedHere = workingRow !== undefined && originalRow !== undefined && !isSameDocument(workingRow, originalRow);
        const matches = change.baseline === NEW_ARTICLE_BASELINE
          ? current === undefined
          : current !== undefined && stagedArticleBaseline(current) === change.baseline;
        const hasPublicationBaseline = change.baseline === NEW_ARTICLE_BASELINE || !!change.baseHash;
        if (matches && !editedHere && hasPublicationBaseline) apply.push({ change, current });
        else aside.push({ change, current: current ?? null, choices: {}, merge: current ? mergeStagedArticleChange(current, change) : null });
      }
      if (apply.length > 0) {
        restoreArticleBaseHashes?.(Object.fromEntries(apply.flatMap(({ change }) => change.baseline !== NEW_ARTICLE_BASELINE && change.baseHash ? [[change.slug, change.baseHash]] : [])));
        applyArticlesTransform((previous) => {
          const next = [...previous];
          for (const { change, current } of apply) {
            const index = next.findIndex(bySlug(change.slug));
            const patched = applyStagedArticleChange(current, change);
            if (index >= 0) next[index] = patched;
            else next.push(patched);
          }
          return next;
        });
      }
      setOffer(null);
      setHeld(aside.length > 0 ? aside : null);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "The articles could not be loaded to restore your edits. Nothing was changed; try again.");
    } finally {
      setRestoring(false);
    }
  }, [offer, restoring, hydrateArticlesNow, applyArticlesTransform, restoreArticleBaseHashes]);

  const discardOffer = useCallback(() => {
    store?.clear(TOOL, RECORD);
    setOffer(null);
    setError(null);
  }, [store]);

  const applyHeld = useCallback((slug: string) => {
    const entry = held?.find((item) => item.change.slug === slug);
    if (!entry?.current) return;
    if (entry.merge && entry.merge.unresolved.length > 0) return;
    const current = entry.current;
    const merged = entry.merge?.merged;
    applyArticlesTransform((previous) => {
      const index = previous.findIndex(bySlug(slug));
      if (index < 0) return previous;
      const next = [...previous];
      next[index] = merged ? applyMergedStagedArticle(current, entry.change, merged) : applyStagedArticleChange(current, entry.change);
      return next;
    });
    setHeld((items) => {
      const rest = items?.filter((item) => item.change.slug !== slug) ?? [];
      return rest.length > 0 ? rest : null;
    });
  }, [held, applyArticlesTransform]);

  const chooseHeld = useCallback((slug: string, path: string, side: MergeSide) => {
    setHeld((items) => items?.map((item) => {
      if (item.change.slug !== slug || !item.current) return item;
      const choices = { ...item.choices, [path]: side };
      return { ...item, choices, merge: mergeStagedArticleChange(item.current, item.change, choices) };
    }) ?? null);
  }, []);

  const dismissHeld = useCallback(() => setHeld(null), []);

  const forget = useCallback(() => {
    flushRef.current = null;
    store?.clear(TOOL, RECORD);
    setCheckpointSavedAt(null);
  }, [store]);

  return { offer, held, restoring, error, checkpointSavedAt, restore, discardOffer, applyHeld, chooseHeld, dismissHeld, forget };
}
