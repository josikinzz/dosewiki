"use client";

import { createContext, useContext } from "react";
import type { SubstanceArticle } from "@/schema";

/**
 * The published article a section form is editing against, so a field can
 * say what readers see now beside the value being typed ("Live: 50-150 ug").
 * Absent (null) wherever a form has no published baseline to compare with.
 */
const PublishedArticleContext = createContext<SubstanceArticle | null>(null);

export const PublishedArticleProvider = PublishedArticleContext.Provider;

export function usePublishedArticle(): SubstanceArticle | null {
  return useContext(PublishedArticleContext);
}
