import type { ArticleRecord } from "./devModeTypes";
import { deepClone, resolveEditorArticleSlug } from "./devModeUtils";
import { useEditorDocument } from "./editorDocumentSession";

export function useDevArticlesState(articlesSource: ArticleRecord[]) {
  const document = useEditorDocument(articlesSource);

  const updateArticleAt = (index: number, nextArticle: ArticleRecord) => {
    document.applyDraftTransform((previous) => {
      if (index < 0 || index >= previous.length) {
        return previous;
      }

      const next = [...previous];
      next[index] = deepClone(nextArticle);
      return next;
    });
  };

  const resetArticleAt = (index: number) => {
    document.applyDraftTransform((previous) => {
      if (index < 0 || index >= previous.length) {
        return previous;
      }

      const original = document.getOriginal()[index];
      if (!original) {
        return previous;
      }

      const next = [...previous];
      next[index] = deepClone(original);
      return next;
    });
  };

  const getOriginalArticle = (index: number) => {
    const original = document.getOriginal()[index];
    return original ? deepClone(original) : undefined;
  };

  const applyArticlesTransform = (transform: (previous: ArticleRecord[]) => ArticleRecord[]) => {
    document.applyDraftTransform(transform);
  };

  /**
   * Fill slim library rows in with the whole articles they stand for.
   *
   * The library list arrives without article bodies, so every row starts as a
   * placeholder that draft and baseline share by reference. Hydration replaces
   * both halves of a row at once, which is why it cannot mark anything dirty and
   * cannot be mistaken for an upstream refresh.
   *
   * A row already edited is left alone in both draft and baseline: a later
   * hydration must not make a stale edit appear freshly based.
   */
  const hydrateArticles = (articlesBySlug: ReadonlyMap<string, ArticleRecord>) => {
    if (articlesBySlug.size === 0) {
      return;
    }

    document.applyHydration(({ draft, original }) => {
      let nextDraft: ArticleRecord[] | null = null;
      let nextOriginal: ArticleRecord[] | null = null;

      original.forEach((baseline, index) => {
        const hydrated = baseline
          ? articlesBySlug.get(resolveEditorArticleSlug(baseline))
          : undefined;
        if (!hydrated || hydrated === baseline || draft[index] !== baseline) {
          return;
        }

        nextOriginal ??= [...original];
        nextOriginal[index] = hydrated;

        if (draft[index] === baseline) {
          nextDraft ??= [...draft];
          nextDraft[index] = hydrated;
        }
      });

      if (nextOriginal === null) {
        return null;
      }

      return { draft: nextDraft ?? draft, original: nextOriginal };
    });
  };

  return {
    applyArticlesTransform,
    hasUnsavedArticleChanges: document.isDirty,
    articles: document.draft,
    // The newest snapshot the live Postgres query delivered. It keeps updating
    // while `articles` is frozen, so it is the only in-process record of what
    // the database now holds once the working set has stopped taking updates.
    sourceArticles: document.refreshConflict?.incomingSource ?? document.original,
    // Non-null exactly while the working set is refusing live updates because
    // it holds unapplied changes. A surface that writes with an `expected`
    // baseline read out of `articles` has to be able to say so.
    articlesRefreshConflict: document.refreshConflict,
    getOriginalArticle,
    // Shared, read-only: the baseline corpus is handed out by reference so a
    // changelog or save diff costs nothing to take. Callers that need to hand
    // an article to something mutating go through `getOriginalArticle`, which
    // copies that one article.
    getOriginalArticles: document.getOriginal,
    hydrateArticles,
    markChangesSaved: document.markSaved,
    replaceArticles: document.replaceDraft,
    resetArticleAt,
    updateArticleAt,
  };
}
