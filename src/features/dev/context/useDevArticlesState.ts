import { useCallback, useEffect, useRef, useState } from "react";
import type { ArticleRecord } from "./devModeTypes";
import { deepClone } from "./devModeUtils";

export function useDevArticlesState(articlesSource: ArticleRecord[]) {
  const originalArticlesRef = useRef<ArticleRecord[]>(deepClone(articlesSource));
  const [articles, setArticles] = useState<ArticleRecord[]>(() => deepClone(articlesSource));
  const hasLocalEditsRef = useRef(false);

  useEffect(() => {
    if (hasLocalEditsRef.current) {
      return;
    }

    originalArticlesRef.current = deepClone(articlesSource);
    setArticles(deepClone(articlesSource));
  }, [articlesSource]);

  const updateArticleAt = useCallback((index: number, nextArticle: ArticleRecord) => {
    hasLocalEditsRef.current = true;
    setArticles((previous) => {
      if (index < 0 || index >= previous.length) {
        return previous;
      }

      const next = [...previous];
      next[index] = deepClone(nextArticle);
      return next;
    });
  }, []);

  const resetArticleAt = useCallback((index: number) => {
    setArticles((previous) => {
      if (index < 0 || index >= previous.length) {
        return previous;
      }

      const original = originalArticlesRef.current[index];
      if (!original) {
        return previous;
      }

      const next = [...previous];
      next[index] = deepClone(original);
      return next;
    });
  }, []);

  const resetArticlesToOriginal = useCallback(() => {
    setArticles(deepClone(originalArticlesRef.current));
  }, []);

  const getOriginalArticle = useCallback((index: number) => {
    const original = originalArticlesRef.current[index];
    return original ? deepClone(original) : undefined;
  }, []);

  const getOriginalArticles = useCallback(() => deepClone(originalArticlesRef.current), []);

  const replaceArticles = useCallback((nextArticles: ArticleRecord[]) => {
    setArticles(deepClone(nextArticles));
  }, []);

  const applyArticlesTransform = useCallback((transform: (previous: ArticleRecord[]) => ArticleRecord[]) => {
    setArticles((previous) => deepClone(transform(previous)));
  }, []);

  const markChangesSaved = useCallback(() => {
    hasLocalEditsRef.current = false;
    originalArticlesRef.current = deepClone(articles);
  }, [articles]);

  return {
    applyArticlesTransform,
    articles,
    getOriginalArticle,
    getOriginalArticles,
    markChangesSaved,
    replaceArticles,
    resetArticleAt,
    resetArticlesToOriginal,
    updateArticleAt,
  };
}
