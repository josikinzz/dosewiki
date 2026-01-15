/**
 * Hook for loading and managing articles from Convex.
 * 
 * This hook provides reactive access to articles stored in Convex.
 * When articles are updated in Convex, subscribed components automatically re-render.
 */

import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { isConvexEnabled } from "../lib/convex";
import type { SubstanceArticle } from "../schema";

/**
 * Hook to get all articles from Convex.
 * Returns undefined while loading, then the array of articles.
 * 
 * This is a reactive subscription - updates automatically when data changes.
 */
export function useConvexArticles() {
  const enabled = isConvexEnabled();
  
  // Only call useQuery if Convex is enabled
  // When disabled, this returns undefined
  const articles = useQuery(
    enabled ? api.articles.getAll : undefined as never
  );

  return {
    articles: articles as SubstanceArticle[] | undefined,
    isLoading: enabled && articles === undefined,
    isEnabled: enabled,
  };
}

/**
 * Hook to get a single article by its ID.
 */
export function useConvexArticle(id: number | null) {
  const enabled = isConvexEnabled() && id !== null;
  
  const article = useQuery(
    enabled ? api.articles.getById : undefined as never,
    enabled ? { id: id as number } : undefined as never
  );

  return {
    article: article as SubstanceArticle | null | undefined,
    isLoading: enabled && article === undefined,
    isEnabled: isConvexEnabled(),
  };
}

/**
 * Hook to get a single article by title.
 */
export function useConvexArticleByTitle(title: string | null) {
  const enabled = isConvexEnabled() && title !== null;
  
  const article = useQuery(
    enabled ? api.articles.getByTitle : undefined as never,
    enabled ? { title: title as string } : undefined as never
  );

  return {
    article: article as SubstanceArticle | null | undefined,
    isLoading: enabled && article === undefined,
    isEnabled: isConvexEnabled(),
  };
}

/**
 * Hook to save a single article to Convex.
 */
export function useSaveConvexArticle() {
  const enabled = isConvexEnabled();
  const mutation = useMutation(api.articles.saveArticle);

  return {
    saveArticle: enabled ? mutation : null,
    isEnabled: enabled,
  };
}

/**
 * Hook to save multiple articles to Convex.
 */
export function useSaveConvexArticles() {
  const enabled = isConvexEnabled();
  const mutation = useMutation(api.articles.saveArticles);

  return {
    saveArticles: enabled ? mutation : null,
    isEnabled: enabled,
  };
}

/**
 * Hook to replace all articles in Convex (bulk sync).
 */
export function useReplaceAllConvexArticles() {
  const enabled = isConvexEnabled();
  const mutation = useMutation(api.articles.replaceAllArticles);

  return {
    replaceAllArticles: enabled ? mutation : null,
    isEnabled: enabled,
  };
}

/**
 * Hook to delete an article from Convex.
 */
export function useDeleteConvexArticle() {
  const enabled = isConvexEnabled();
  const mutation = useMutation(api.articles.deleteArticle);

  return {
    deleteArticle: enabled ? mutation : null,
    isEnabled: enabled,
  };
}
