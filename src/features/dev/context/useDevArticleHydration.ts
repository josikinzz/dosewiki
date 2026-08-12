/**
 * On-demand article hydration for the editor library.
 *
 * The library list arrives slim — no prose, no references — so the `/dev` shell
 * pays for one small drain instead of the whole 16.7 MB corpus. Everything that
 * needs a whole article asks for it here:
 *
 *  - `requestArticle(slug)` fetches one article, for the tool that has exactly
 *    one selected.
 *  - `requestFullCorpus()` drains every whole article, for the two tools that
 *    genuinely sweep article bodies (the tag editor rewrites tag fields across
 *    the corpus; the review workbench walks it linearly, rendering each body).
 *
 * Both land through `hydrateArticles`, which fills draft and baseline together
 * and so can never mark the working set dirty or fight an unsaved edit.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SubstanceArticle } from "@/schema";
import { resolveEditorArticleSlug } from "./devModeUtils";

const EDITOR_LIBRARY_ENDPOINT = "/api/dev/editor-library";

type ArticlePayload = { article?: SubstanceArticle };
type CorpusPayload = { articles?: SubstanceArticle[]; cursor?: string | null; isDone?: boolean };

export type DevArticleHydration = {
  /** Slugs whose whole article has landed in the working set. */
  hydratedSlugs: ReadonlySet<string>;
  /** True once every row in the working set holds a whole article. */
  isFullCorpusHydrated: boolean;
  /** True while a full-corpus drain is in flight. */
  isHydratingFullCorpus: boolean;
  isArticleHydrated: (slug: string | null | undefined) => boolean;
  requestArticle: (slug: string | null | undefined) => void;
  requestFullCorpus: () => void;
};

export function useDevArticleHydration({
  articleCount,
  hydrateArticles,
}: {
  articleCount: number;
  hydrateArticles: (articlesBySlug: ReadonlyMap<string, SubstanceArticle>) => void;
}): DevArticleHydration {
  const [hydratedSlugs, setHydratedSlugs] = useState<ReadonlySet<string>>(() => new Set());
  const [isHydratingFullCorpus, setIsHydratingFullCorpus] = useState(false);
  const [fullCorpusRequested, setFullCorpusRequested] = useState(false);

  // Requests already issued, so a re-render cannot re-fetch what is in flight.
  const requestedRef = useRef<Set<string>>(new Set());
  const fullCorpusInFlightRef = useRef(false);
  const hydrateRef = useRef(hydrateArticles);
  hydrateRef.current = hydrateArticles;

  // A new library drain replaces the working set wholesale, so everything this
  // hook believed about it stops being true.
  useEffect(() => {
    requestedRef.current = new Set();
    fullCorpusInFlightRef.current = false;
    setHydratedSlugs(new Set());
    setFullCorpusRequested(false);
    setIsHydratingFullCorpus(false);
  }, [articleCount]);

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
  }, []);

  const requestArticle = useCallback(
    (slug: string | null | undefined) => {
      const normalized = slug?.trim();
      if (!normalized || requestedRef.current.has(normalized)) {
        return;
      }

      requestedRef.current.add(normalized);

      void fetch(`${EDITOR_LIBRARY_ENDPOINT}?slug=${encodeURIComponent(normalized)}`)
        .then((response) => (response.ok ? (response.json() as Promise<ArticlePayload>) : null))
        .then((payload) => {
          if (payload?.article) {
            commit([payload.article]);
          } else {
            // A miss must not latch: the next selection of this slug should be
            // free to try again rather than sit on an empty article forever.
            requestedRef.current.delete(normalized);
          }
        })
        .catch(() => {
          requestedRef.current.delete(normalized);
        });
    },
    [commit],
  );

  const requestFullCorpus = useCallback(() => {
    if (fullCorpusInFlightRef.current) {
      return;
    }

    fullCorpusInFlightRef.current = true;
    setFullCorpusRequested(true);
    setIsHydratingFullCorpus(true);

    // The corpus arrives one page per response — a single ~15 MB body would
    // exceed Vercel's serverless response cap — so walk the cursor to the end,
    // committing each page as it lands.
    const drain = async () => {
      let cursor: string | null = null;
      let received = 0;

      for (;;) {
        const query = cursor ? `?scope=full&cursor=${encodeURIComponent(cursor)}` : "?scope=full";
        const response = await fetch(`${EDITOR_LIBRARY_ENDPOINT}${query}`);
        if (!response.ok) {
          throw new Error(`Full-corpus drain failed with status ${response.status}.`);
        }

        const payload = (await response.json()) as CorpusPayload;
        if (payload.articles?.length) {
          received += payload.articles.length;
          commit(payload.articles);
        }

        if (payload.isDone !== false && !payload.cursor) {
          break;
        }
        cursor = payload.cursor ?? null;
      }

      return received;
    };

    void drain()
      .then((received) => {
        if (received === 0) {
          fullCorpusInFlightRef.current = false;
          setFullCorpusRequested(false);
        }
      })
      .catch((error: unknown) => {
        console.error("Unable to drain the full editor corpus.", error);
        fullCorpusInFlightRef.current = false;
        setFullCorpusRequested(false);
      })
      .finally(() => {
        setIsHydratingFullCorpus(false);
      });
  }, [commit]);

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
      // The corpus counts as whole once a full drain has landed for every row.
      // Comparing counts keeps this honest when the drain returns fewer rows
      // than the list did.
      isFullCorpusHydrated:
        articleCount > 0 && fullCorpusRequested && hydratedSlugs.size >= articleCount,
      isHydratingFullCorpus,
      isArticleHydrated,
      requestArticle,
      requestFullCorpus,
    }),
    [
      articleCount,
      fullCorpusRequested,
      hydratedSlugs,
      isArticleHydrated,
      isHydratingFullCorpus,
      requestArticle,
      requestFullCorpus,
    ],
  );
}
