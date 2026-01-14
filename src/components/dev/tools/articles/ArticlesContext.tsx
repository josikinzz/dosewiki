/**
 * ArticlesContext - Shares AI generation state across the Articles tab.
 * 
 * Provides API configuration, source content, and extracted quotes
 * to section components for per-section AI generation.
 */

import { createContext, useContext, type ReactNode } from "react";
import type { SubstanceModule, SourceInfo } from "../../../../data/article-sources";
import type { ExtractedSourceInfo } from "../../../../utils/sectionSources";

export interface ArticlesContextValue {
  // API configuration
  apiKey: string;
  model: string;
  isKeyValid: boolean | null;
  
  // Selected substance info
  selectedSubstanceSlug: string | null;
  substanceModule: SubstanceModule | null;
  availableSources: SourceInfo[];
  
  // Extracted content for section generators (raw content)
  harmPotentialQuotes: string | null;
  pharmacologyQuotes: string | null;
  historyCultureQuotes: string | null;
  
  // Parsed source info with favicons for section generators
  harmPotentialSources: ExtractedSourceInfo | null;
  pharmacologySources: ExtractedSourceInfo | null;
  historyCultureSources: ExtractedSourceInfo | null;
  
  // Helper to get source content
  getSourceContent: (sourceId: string) => string | null;
  
  // Get all sources as array for section generators
  getAllSources: () => Array<{ source: string; content: string }>;
}

const ArticlesContext = createContext<ArticlesContextValue | null>(null);

export function ArticlesProvider({
  children,
  value,
}: {
  children: ReactNode;
  value: ArticlesContextValue;
}) {
  return (
    <ArticlesContext.Provider value={value}>
      {children}
    </ArticlesContext.Provider>
  );
}

export function useArticlesContext(): ArticlesContextValue {
  const context = useContext(ArticlesContext);
  if (!context) {
    throw new Error("useArticlesContext must be used within an ArticlesProvider");
  }
  return context;
}

/**
 * Hook that returns null if not in articles context.
 * Useful for form sections that may be used outside the articles tab.
 */
export function useOptionalArticlesContext(): ArticlesContextValue | null {
  return useContext(ArticlesContext);
}
