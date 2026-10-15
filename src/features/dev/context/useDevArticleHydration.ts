import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SubstanceArticle } from "@/schema";
import type { LoadedEditorArticle } from "./useDevArticlesState";
import { resolveEditorArticleSlug } from "./devModeUtils";

const EDITOR_LIBRARY_ENDPOINT = "/api/dev/editor-library";

const HYDRATE_BATCH_CONCURRENCY = 6;

type ArticlePayload = Partial<LoadedEditorArticle>;

export type DevArticleHydration = {
  hydratedSlugs: ReadonlySet<string>;
  failedSlugs: ReadonlySet<string>;
  isArticleHydrated: (slug: string | null | undefined) => boolean;
  requestArticle: (slug: string | null | undefined) => void;
  hydrateArticlesNow: (
    slugs: readonly string[],
  ) => Promise<{ ok: boolean; articles: SubstanceArticle[] }>;
};

export function useDevArticleHydration({
  articleCount,
  hydrateArticles,
}: {
  articleCount: number;
  hydrateArticles: (articlesBySlug: ReadonlyMap<string, LoadedEditorArticle>) => void;
}): DevArticleHydration {
  const [hydratedSlugs, setHydratedSlugs] = useState<ReadonlySet<string>>(() => new Set());
  const [failedSlugs, setFailedSlugs] = useState<ReadonlySet<string>>(() => new Set());

  const requestedRef = useRef<Set<string>>(new Set());
  const hydrateRef = useRef(hydrateArticles);
  hydrateRef.current = hydrateArticles;

  useEffect(() => {
    requestedRef.current = new Set();
    setHydratedSlugs(new Set());
    setFailedSlugs(new Set());
  }, [articleCount]);

  const forgetFailure = useCallback((slugs: Iterable<string>) => {
    setFailedSlugs((previous) => {
      let next: Set<string> | null = null;
      for (const slug of slugs) {
        if (previous.has(slug)) {
          next ??= new Set(previous);
          next.delete(slug);
        }
      }
      return next ?? previous;
    });
  }, []);

  const commit = useCallback((articles: LoadedEditorArticle[]) => {
    const bySlug = new Map<string, LoadedEditorArticle>();
    for (const loaded of articles) {
      const slug = resolveEditorArticleSlug(loaded.article);
      if (slug) {
        bySlug.set(slug, loaded);
      }
    }

    if (bySlug.size === 0) {
      return;
    }

    hydrateRef.current(bySlug);
    setHydratedSlugs((previous) => new Set([...previous, ...bySlug.keys()]));
    forgetFailure(bySlug.keys());
  }, [forgetFailure]);

  const requestArticle = useCallback(
    (slug: string | null | undefined) => {
      const normalized = slug?.trim();
      if (!normalized || requestedRef.current.has(normalized)) {
        return;
      }

      requestedRef.current.add(normalized);
      forgetFailure([normalized]);

      const miss = () => {
        requestedRef.current.delete(normalized);
        setFailedSlugs((previous) => new Set([...previous, normalized]));
      };

      void fetch(`${EDITOR_LIBRARY_ENDPOINT}?slug=${encodeURIComponent(normalized)}`)
        .then((response) => (response.ok ? (response.json() as Promise<ArticlePayload>) : null))
        .then((payload) => {
          if (payload?.article && typeof payload.baseHash === "string" && payload.baseHash) {
            commit([{ article: payload.article, baseHash: payload.baseHash }]);
          } else {
            miss();
          }
        })
        .catch(miss);
    },
    [commit, forgetFailure],
  );

  const hydrateArticlesNow = useCallback(
    async (slugs: readonly string[]) => {
      const unique = Array.from(
        new Set(slugs.map((slug) => slug.trim()).filter((slug) => slug.length > 0)),
      );
      const landed: SubstanceArticle[] = [];
      let ok = true;
      let nextIndex = 0;

      const worker = async () => {
        while (nextIndex < unique.length) {
          const slug = unique[nextIndex];
          nextIndex += 1;

          try {
            const response = await fetch(
              `${EDITOR_LIBRARY_ENDPOINT}?slug=${encodeURIComponent(slug)}`,
            );
            const payload = response.ok
              ? ((await response.json()) as ArticlePayload)
              : null;

            if (payload?.article && typeof payload.baseHash === "string" && payload.baseHash) {
              commit([{ article: payload.article, baseHash: payload.baseHash }]);
              landed.push(payload.article);
              requestedRef.current.add(slug);
            } else {
              ok = false;
            }
          } catch {
            ok = false;
          }
        }
      };

      const workers = Array.from(
        { length: Math.min(HYDRATE_BATCH_CONCURRENCY, unique.length) },
        () => worker(),
      );
      await Promise.all(workers);

      return { ok, articles: landed };
    },
    [commit],
  );

  const isArticleHydrated = useCallback(
    (slug: string | null | undefined) => {
      const normalized = slug?.trim();
      return normalized ? hydratedSlugs.has(normalized) : false;
    },
    [hydratedSlugs],
  );

  return useMemo(
    () => ({
      hydratedSlugs,
      failedSlugs,
      isArticleHydrated,
      requestArticle,
      hydrateArticlesNow,
    }),
    [hydratedSlugs, failedSlugs, isArticleHydrated, hydrateArticlesNow, requestArticle],
  );
}
