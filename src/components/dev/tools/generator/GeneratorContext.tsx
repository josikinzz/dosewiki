/**
 * GeneratorContext - Shares AI generation state across the Generator tab.
 * 
 * Provides API configuration, source content, and harm potential quotes
 * to section components for per-section AI generation.
 */

import { createContext, useContext, type ReactNode } from "react";
import type { SubstanceModule, SourceInfo } from "../../../../data/article-sources";

export interface GeneratorContextValue {
  // API configuration
  apiKey: string;
  model: string;
  isKeyValid: boolean | null;
  
  // Selected substance info
  selectedSubstanceSlug: string | null;
  substanceModule: SubstanceModule | null;
  availableSources: SourceInfo[];
  
  // Harm potential extracted content
  harmPotentialQuotes: string | null;
  
  // Helper to get source content
  getSourceContent: (sourceId: string) => string | null;
  
  // Get all sources as array for section generators
  getAllSources: () => Array<{ source: string; content: string }>;
}

const GeneratorContext = createContext<GeneratorContextValue | null>(null);

export function GeneratorProvider({
  children,
  value,
}: {
  children: ReactNode;
  value: GeneratorContextValue;
}) {
  return (
    <GeneratorContext.Provider value={value}>
      {children}
    </GeneratorContext.Provider>
  );
}

export function useGeneratorContext(): GeneratorContextValue {
  const context = useContext(GeneratorContext);
  if (!context) {
    throw new Error("useGeneratorContext must be used within a GeneratorProvider");
  }
  return context;
}

/**
 * Hook that returns null if not in generator context.
 * Useful for form sections that may be used outside the generator.
 */
export function useOptionalGeneratorContext(): GeneratorContextValue | null {
  return useContext(GeneratorContext);
}
