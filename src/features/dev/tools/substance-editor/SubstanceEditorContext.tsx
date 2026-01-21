/**
 * SubstanceEditorContext - Shares AI generation state across the Substance Editor tab.
 *
 * Provides API configuration, source content, and extracted quotes
 * to section components for per-section AI generation.
 */

import { createContext, useContext, type ReactNode } from "react";
import type { SubstanceModule, SourceInfo } from "@/hooks/useArticleSources";
import type { ExtractedSourceInfo } from "@/utils/sectionSources";

export interface SubstanceEditorContextValue {
  // API configuration
  apiKey: string;
  model: string;
  isKeyValid: boolean | null;

  // Selected substance info
  selectedSubstanceSlug: string | null;
  substanceModule: SubstanceModule | null;
  availableSources: SourceInfo[];

  // Extracted content for section generators (raw content)
  summaryQuotes: string | null;
  harmPotentialQuotes: string | null;
  pharmacologyQuotes: string | null;
  historyCultureQuotes: string | null;
  dosageDurationQuotes: string | null;
  toleranceQuotes: string | null;
  legalityQuotes: string | null;

  // Parsed source info with favicons for section generators
  summarySources: ExtractedSourceInfo | null;
  harmPotentialSources: ExtractedSourceInfo | null;
  pharmacologySources: ExtractedSourceInfo | null;
  historyCultureSources: ExtractedSourceInfo | null;
  dosageDurationSources: ExtractedSourceInfo | null;
  toleranceSources: ExtractedSourceInfo | null;
  legalitySources: ExtractedSourceInfo | null;

  // Helper to get source content
  getSourceContent: (sourceId: string) => string | null;

  // Get all sources as array for section generators
  getAllSources: () => Array<{ source: string; content: string }>;
}

const SubstanceEditorContext = createContext<SubstanceEditorContextValue | null>(null);

export function SubstanceEditorProvider({
  children,
  value,
}: {
  children: ReactNode;
  value: SubstanceEditorContextValue;
}) {
  return (
    <SubstanceEditorContext.Provider value={value}>
      {children}
    </SubstanceEditorContext.Provider>
  );
}

export function useSubstanceEditorContext(): SubstanceEditorContextValue {
  const context = useContext(SubstanceEditorContext);
  if (!context) {
    throw new Error("useSubstanceEditorContext must be used within a SubstanceEditorProvider");
  }
  return context;
}

/**
 * Hook that returns null if not in substance editor context.
 * Useful for form sections that may be used outside the substance editor tab.
 */
export function useOptionalSubstanceEditorContext(): SubstanceEditorContextValue | null {
  return useContext(SubstanceEditorContext);
}
