"use client";

import { createContext, useContext } from "react";
import type { SubstanceArticle } from "@/schema";

const PublishedArticleContext = createContext<SubstanceArticle | null>(null);

export const PublishedArticleProvider = PublishedArticleContext.Provider;

export function usePublishedArticle(): SubstanceArticle | null {
  return useContext(PublishedArticleContext);
}
