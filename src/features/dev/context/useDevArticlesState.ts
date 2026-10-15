import { useMemo } from "react";
import type { ArticleRecord } from "./devModeTypes";
import { deepClone, resolveEditorArticleSlug } from "./devModeUtils";
import { useEditorDocument } from "./editorDocumentSession";

export type LoadedEditorArticle = { article: ArticleRecord; baseHash: string };
export type ArticleBaseHashes = Record<string, string>;
type WorkingArticles = { articles: ArticleRecord[]; baseHashes: ArticleBaseHashes };

export function useDevArticlesState(articlesSource: ArticleRecord[]) {
  const source = useMemo<WorkingArticles>(() => ({ articles: articlesSource, baseHashes: {} }), [articlesSource]);
  const document = useEditorDocument(source);
  const applyArticlesTransform = (transform: (previous: ArticleRecord[]) => ArticleRecord[]) => {
    document.applyDraftTransform(previous => ({ ...previous, articles: transform(previous.articles) }));
  };
  const updateArticleAt = (index: number, article: ArticleRecord) => {
    applyArticlesTransform(previous => previous.map((row, position) => position === index ? deepClone(article) : row));
  };
  const resetArticleAt = (index: number) => {
    const original = document.getOriginal().articles[index];
    if (original) updateArticleAt(index, original);
  };
  const getOriginalArticles = () => document.getOriginal().articles;
  const getOriginalArticle = (index: number) => {
    const original = getOriginalArticles()[index];
    return original ? deepClone(original) : undefined;
  };
  const getArticleBaseHashes = () => document.draft.baseHashes;
  const restoreArticleBaseHashes = (baseHashes: ArticleBaseHashes) => {
    document.applyDraftTransform(previous => ({ ...previous, baseHashes: { ...previous.baseHashes, ...baseHashes } }));
  };
  const hydrateArticles = (articlesBySlug: ReadonlyMap<string, LoadedEditorArticle>) => {
    document.applyHydration(({ draft, original }) => {
      const nextDraft = [...draft.articles], nextOriginal = [...original.articles];
      const draftHashes = { ...draft.baseHashes }, originalHashes = { ...original.baseHashes };
      let changed = false;
      original.articles.forEach((baseline, index) => {
        const slug = resolveEditorArticleSlug(baseline);
        const loaded = slug ? articlesBySlug.get(slug) : undefined;
        if (!slug || !loaded || draft.articles[index] !== baseline) return;
        nextDraft[index] = loaded.article;
        nextOriginal[index] = loaded.article;
        draftHashes[slug] = loaded.baseHash;
        originalHashes[slug] = loaded.baseHash;
        changed = true;
      });
      return changed ? { draft: { articles: nextDraft, baseHashes: draftHashes }, original: { articles: nextOriginal, baseHashes: originalHashes } } : null;
    });
  };
  const markChangesSaved = (receipts: Array<{ slug: string; baseHash: string }> = []) => {
    const baseHashes = { ...document.draft.baseHashes };
    for (const receipt of receipts) baseHashes[receipt.slug] = receipt.baseHash;
    document.markSaved({ articles: document.draft.articles, baseHashes });
  };
  const conflict = document.refreshConflict;
  return {
    applyArticlesTransform,
    hasUnsavedArticleChanges: document.isDirty,
    articles: document.draft.articles,
    sourceArticles: (conflict?.incomingSource ?? document.original).articles,
    articlesRefreshConflict: conflict ? { ...conflict, previousOriginal: conflict.previousOriginal.articles, incomingSource: conflict.incomingSource.articles } : null,
    getOriginalArticle, getOriginalArticles, getArticleBaseHashes, restoreArticleBaseHashes, hydrateArticles, markChangesSaved,
    replaceArticles: (articles: ArticleRecord[]) => document.replaceDraft({ ...document.draft, articles }),
    resetArticleAt, updateArticleAt,
  };
}
