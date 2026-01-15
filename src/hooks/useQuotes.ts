import { useCallback, useEffect, useState } from "react";
import { useQuery, useMutation as useConvexMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { isConvexEnabled } from "../lib/convex";
import {
  loadHarmPotentialQuotes,
  loadPharmacologyQuotes,
  loadHistoryCultureQuotes,
} from "../utils/sectionSources";

// ============================================================================
// Types
// ============================================================================

export type QuoteSection = "harm_potential" | "pharmacology" | "history_culture";

export interface QuoteData {
  slug: string;
  section: QuoteSection;
  content: string;
  updatedAt?: string;
  updatedBy?: string;
  isFromConvex: boolean;
}

export interface UseQuoteResult {
  /** The quote content (from Convex if available, otherwise static) */
  content: string | null;
  /** Whether the quote is loaded from Convex */
  isFromConvex: boolean;
  /** Whether the query is still loading */
  isLoading: boolean;
  /** Last update timestamp (only if from Convex) */
  updatedAt?: string;
  /** Last updater (only if from Convex) */
  updatedBy?: string;
  /** Save the quote to Convex */
  save: (content: string, updatedBy?: string) => Promise<void>;
  /** Whether saving is in progress */
  isSaving: boolean;
  /** Refetch the quote */
  refetch: () => void;
}

// ============================================================================
// Static Loaders Map
// ============================================================================

const staticLoaders: Record<QuoteSection, (slug: string) => Promise<string | null>> = {
  harm_potential: loadHarmPotentialQuotes,
  pharmacology: loadPharmacologyQuotes,
  history_culture: loadHistoryCultureQuotes,
};

// ============================================================================
// Hooks
// ============================================================================

/**
 * Hook to load and optionally save a quote document.
 * 
 * @param slug - The substance slug (e.g., "ketamine")
 * @param section - The section type (e.g., "harm_potential")
 * @returns QuoteData with content and save function
 */
export function useQuote(slug: string | null, section: QuoteSection): UseQuoteResult {
  const enabled = isConvexEnabled();
  
  // State for static content (loaded asynchronously)
  const [staticContent, setStaticContent] = useState<string | null>(null);
  const [staticLoading, setStaticLoading] = useState(false);
  const [refetchTrigger, setRefetchTrigger] = useState(0);
  
  // Query Convex for the quote
  const convexQuote = useQuery(
    enabled && slug ? api.quotes.getBySlugAndSection : undefined as never,
    enabled && slug ? { slug, section } : undefined as never
  );
  
  // Mutation for saving
  const saveMutation = useConvexMutation(api.quotes.save);
  
  // Load static content as fallback
  useEffect(() => {
    if (!slug) {
      setStaticContent(null);
      return;
    }
    
    // Only load static if Convex is not enabled or returns null
    if (!enabled || convexQuote === null) {
      setStaticLoading(true);
      const loader = staticLoaders[section];
      loader(slug)
        .then((content) => {
          setStaticContent(content);
          setStaticLoading(false);
        })
        .catch(() => {
          setStaticContent(null);
          setStaticLoading(false);
        });
    }
  }, [slug, section, enabled, convexQuote, refetchTrigger]);
  
  // Determine content source
  const isFromConvex = enabled && convexQuote !== undefined && convexQuote !== null;
  const content = isFromConvex ? convexQuote.content : staticContent;
  
  // Loading state
  const isLoading = (enabled && convexQuote === undefined) || staticLoading;
  
  // Save function
  const save = useCallback(async (newContent: string, updatedBy?: string) => {
    if (!enabled) {
      console.warn("Convex is not enabled. Quote save skipped.");
      return;
    }
    if (!slug) {
      console.warn("No slug provided. Quote save skipped.");
      return;
    }
    await saveMutation({ slug, section, content: newContent, updatedBy });
  }, [enabled, slug, section, saveMutation]);
  
  // Refetch function
  const refetch = useCallback(() => {
    setRefetchTrigger((prev) => prev + 1);
  }, []);
  
  return {
    content,
    isFromConvex,
    isLoading,
    updatedAt: isFromConvex ? convexQuote.updatedAt : undefined,
    updatedBy: isFromConvex ? convexQuote.updatedBy : undefined,
    save,
    isSaving: false,
    refetch,
  };
}

/**
 * Hook to load all quotes for a substance.
 * 
 * @param slug - The substance slug
 */
export function useQuotesBySlug(slug: string | null) {
  const enabled = isConvexEnabled();
  
  const convexQuotes = useQuery(
    enabled && slug ? api.quotes.getBySlug : undefined as never,
    enabled && slug ? { slug } : undefined as never
  );
  
  const isLoading = enabled && convexQuotes === undefined;
  
  return {
    quotes: convexQuotes ?? [],
    isLoading,
    isConvexEnabled: enabled,
  };
}

/**
 * Convenience hooks for specific sections.
 */
export function useHarmPotentialQuote(slug: string | null): UseQuoteResult {
  return useQuote(slug, "harm_potential");
}

export function usePharmacologyQuote(slug: string | null): UseQuoteResult {
  return useQuote(slug, "pharmacology");
}

export function useHistoryCultureQuote(slug: string | null): UseQuoteResult {
  return useQuote(slug, "history_culture");
}

/**
 * Hook to get all available quote sections for a substance.
 * Returns which sections have content available.
 */
export function useQuoteAvailability(slug: string | null) {
  const harmPotential = useQuote(slug, "harm_potential");
  const pharmacology = useQuote(slug, "pharmacology");
  const historyCulture = useQuote(slug, "history_culture");
  
  return {
    harm_potential: {
      available: harmPotential.content !== null,
      isLoading: harmPotential.isLoading,
      isFromConvex: harmPotential.isFromConvex,
    },
    pharmacology: {
      available: pharmacology.content !== null,
      isLoading: pharmacology.isLoading,
      isFromConvex: pharmacology.isFromConvex,
    },
    history_culture: {
      available: historyCulture.content !== null,
      isLoading: historyCulture.isLoading,
      isFromConvex: historyCulture.isFromConvex,
    },
  };
}
