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
    getOriginalArticle,
    getOriginalArticles: document.getOriginal,
    markChangesSaved: document.markSaved,
    replaceArticles: document.replaceDraft,
    resetArticleAt,
    resetArticlesToOriginal: document.reset,
    updateArticleAt,
  };
}
