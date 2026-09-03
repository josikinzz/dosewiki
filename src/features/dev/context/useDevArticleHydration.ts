/**
 * On-demand article hydration for the editor library.
 *
 * The library list arrives slim (no prose, no references) so the `/dev` shell
 * pays for one small drain instead of the whole 16.7 MB corpus. Everything that
 * needs a whole article asks for it here, through one of two call patterns:
 *
 *  - `requestArticle(slug)` fetches one article, fire-and-forget, for the tool
 *    that has exactly one selected (and for the review workbench's neighbour
 *    prefetch).
 *  - `hydrateArticlesNow(slugs)` fetches a bounded batch and awaits it, for the
 *    tool that is about to rewrite exactly those rows (the tag editor hydrates
 *    the slugs a mutation touches before applying it).
 *
 * Nothing drains the whole corpus into the browser any more. Both patterns land
 * through `hydrateArticles`, which fills draft and baseline together and so can
 * never mark the working set dirty or fight an unsaved edit.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SubstanceArticle } from "@/schema";
import { resolveEditorArticleSlug } from "./devModeUtils";

const EDITOR_LIBRARY_ENDPOINT = "/api/dev/editor-library";

// Batch hydration fans out per-slug requests; six in flight stays polite to
// the route's diagnostic rate limit while a mutation's rewrite set lands.
const HYDRATE_BATCH_CONCURRENCY = 6;

type ArticlePayload = { article?: SubstanceArticle };

export type DevArticleHydration = {
  /** Slugs whose whole article has landed in the working set. */
  hydratedSlugs: ReadonlySet<string>;
  /**
   * Slugs whose most recent `requestArticle` landed nothing: a non-OK
   * response, a payload without an article, or a network error. A slug leaves
   * this set the moment it is requested again or a later request lands it, so
   * a surface can show "could not load, retry" and hand the retry straight
   * back to `requestArticle`.
   */
  failedSlugs: ReadonlySet<string>;
  isArticleHydrated: (slug: string | null | undefined) => boolean;
  requestArticle: (slug: string | null | undefined) => void;
  /**
   * Awaitable batch hydration. Fetches each slug's whole article with bounded
   * parallelism, commits each landed row through the same draft+baseline path
   * as `requestArticle`, and resolves once every request has settled. `ok` is
   * false when any slug failed to land; `articles` carries the ones that did.
   */
  hydrateArticlesNow: (
    slugs: readonly string[],
  ) => Promise<{ ok: boolean; articles: SubstanceArticle[] }>;
};

export function useDevArticleHydration({
  articleCount,
  hydrateArticles,
}: {
  articleCount: number;
  hydrateArticles: (articlesBySlug: ReadonlyMap<string, SubstanceArticle>) => void;
}): DevArticleHydration {
  const [hydratedSlugs, setHydratedSlugs] = useState<ReadonlySet<string>>(() => new Set());
  const [failedSlugs, setFailedSlugs] = useState<ReadonlySet<string>>(() => new Set());

  // Requests already issued, so a re-render cannot re-fetch what is in flight.
  const requestedRef = useRef<Set<string>>(new Set());
  const hydrateRef = useRef(hydrateArticles);
  hydrateRef.current = hydrateArticles;

  // A new library drain replaces the working set wholesale, so everything this
  // hook believed about it stops being true.
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

  const commit = useCallback((articles: SubstanceArticle[]) => {
    const bySlug = new Map<string, SubstanceArticle>();
    for (const article of articles) {
      const slug = resolveEditorArticleSlug(article);
      if (slug) {
        bySlug.set(slug, article);
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

      // A miss must not latch: the next selection of this slug should be free
      // to try again rather than sit on an empty article forever. It is
      // recorded so the surface can offer that retry.
      const miss = () => {
        requestedRef.current.delete(normalized);
        setFailedSlugs((previous) => new Set([...previous, normalized]));
      };

      void fetch(`${EDITOR_LIBRARY_ENDPOINT}?slug=${encodeURIComponent(normalized)}`)
        .then((response) => (response.ok ? (response.json() as Promise<ArticlePayload>) : null))
        .then((payload) => {
          if (payload?.article) {
            commit([payload.article]);
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

            if (payload?.article) {
              // Same commit path as requestArticle: draft and baseline fill
              // together, so the save diff never sees the hydration itself.
              commit([payload.article]);
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
