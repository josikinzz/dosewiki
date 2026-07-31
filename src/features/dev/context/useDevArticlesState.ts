import type { ArticleRecord } from "./devModeTypes";
import { deepClone } from "./devModeUtils";
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

  return {
    applyArticlesTransform,
    articles: document.draft,
    // The newest snapshot the live Convex query delivered. It keeps updating
    // while `articles` is frozen, so it is the only in-process record of what
    // the database now holds once the working set has stopped taking updates.
    sourceArticles: document.original,
    // Non-null exactly while the working set is refusing live updates because
    // it holds unapplied changes. A surface that writes with an `expected`
    // baseline read out of `articles` has to be able to say so.
    articlesRefreshConflict: document.refreshConflict,
    getOriginalArticle,
    getOriginalArticles: document.getOriginal,
    markChangesSaved: document.markSaved,
    replaceArticles: document.replaceDraft,
    resetArticleAt,
    resetArticlesToOriginal: document.reset,
    updateArticleAt,
  };
}
