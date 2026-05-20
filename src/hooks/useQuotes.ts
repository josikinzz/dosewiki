import { useCallback, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { isConvexEnabled } from "../lib/convex";
import { getAvailabilityQuoteSectionIds } from "../../lib/quoteSections.js";

// Convex skip token for conditional queries
const SKIP = "skip" as const;

// ============================================================================
// Types
// ============================================================================

export type QuoteSection =
  | "harm_potential"
  | "pharmacology"
  | "history_culture"
  | "summary"
  | "dosage_duration"
  | "tolerance"
  | "legality"
  | "subjective_effects";

export interface QuoteData {
  slug: string;
  section: QuoteSection;
  content: string;
  updatedAt?: string;
  updatedBy?: string;
  isFromConvex: boolean;
}

export interface UseQuoteResult {
  /** The quote content from Convex */
  content: string | null;
  /** Whether the quote exists in Convex */
  exists: boolean;
  /** Whether the quote is loaded from Convex (always true when exists) */
  isFromConvex: boolean;
  /** Whether the query is still loading */
  isLoading: boolean;
  /** Last update timestamp */
  updatedAt?: string;
  /** Last updater */
  updatedBy?: string;
  /** Save the quote to Convex */
  save: (content: string, updatedBy?: string) => Promise<void>;
  /** Whether saving is in progress */
  isSaving: boolean;
  /** Refetch the quote */
  refetch: () => void;
}

// ============================================================================
// Hooks
// ============================================================================

/**
 * Hook to load and optionally save a quote document from Convex.
 *
 * Quotes are stored ONLY in Convex - there is no static fallback.
 * Run `node scripts/migrate-quotes-to-convex.mjs` to populate quotes.
 *
 * @param slug - The substance slug (e.g., "ketamine")
 * @param section - The section type (e.g., "harm_potential")
 * @returns QuoteData with content and save function
 */
export function useQuote(slug: string | null, section: QuoteSection): UseQuoteResult {
  const enabled = isConvexEnabled();
  const [refetchTrigger, setRefetchTrigger] = useState(0);

  // Query Convex for the quote (use "skip" to conditionally skip the query)
  const convexQuote = useQuery(
    api.quotes.getBySlugAndSection,
    enabled && slug ? { slug, section } : SKIP
  );

  // Determine content and loading state
  const isLoading = enabled && convexQuote === undefined;
  const exists = convexQuote !== undefined && convexQuote !== null;
  const content = exists ? convexQuote.content : null;
  const isFromConvex = exists;

  // Save function
  const save = useCallback(
    async (newContent: string, _updatedBy?: string) => {
      if (!enabled) {
        console.warn("Convex is not enabled. Quote save skipped.");
        return;
      }
      if (!slug) {
        console.warn("No slug provided. Quote save skipped.");
        return;
      }

      const response = await fetch("/api/save-quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          section,
          content: newContent,
        }),
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        const error = typeof result.error === "string" ? result.error : "Failed to save quote.";
        throw new Error(error);
      }
    },
    [enabled, slug, section]
  );

  // Refetch function
  const refetch = useCallback(() => {
    setRefetchTrigger((prev) => prev + 1);
  }, []);

  // Use refetchTrigger in the dependency to ensure it's not optimized away
  void refetchTrigger;

  return {
    content,
    exists,
    isFromConvex,
    isLoading,
    updatedAt: exists ? convexQuote.updatedAt : undefined,
    updatedBy: exists ? convexQuote.updatedBy : undefined,
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
    api.quotes.getBySlug,
    enabled && slug ? { slug } : SKIP
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

export function useSummaryQuote(slug: string | null): UseQuoteResult {
  return useQuote(slug, "summary");
}

export function useDosageDurationQuote(slug: string | null): UseQuoteResult {
  return useQuote(slug, "dosage_duration");
}

export function useToleranceQuote(slug: string | null): UseQuoteResult {
  return useQuote(slug, "tolerance");
}

export function useLegalityQuote(slug: string | null): UseQuoteResult {
  return useQuote(slug, "legality");
}

export function useSubjectiveEffectsQuote(slug: string | null): UseQuoteResult {
  return useQuote(slug, "subjective_effects");
}

/**
 * Hook to get all available quote sections for a substance.
 * Returns which sections have content available.
 * Uses a single Convex query instead of 8 separate queries.
 */
export function useQuoteAvailability(slug: string | null) {
  const enabled = isConvexEnabled();

  // Single query for all section availability
  const availability = useQuery(
    api.quotes.getAvailabilityBySlug,
    enabled && slug ? { slug } : SKIP
  );

  const isLoading = enabled && availability === undefined;
  const isFromConvex = enabled && availability !== undefined;

  // Return consistent shape whether loading or loaded
  const sections = getAvailabilityQuoteSectionIds();

  // Build result object with same interface as before
  return Object.fromEntries(
    sections.map((section) => [
      section,
      {
        available: availability?.[section]?.available ?? false,
        isLoading,
        isFromConvex,
      },
    ])
  ) as Record<
    QuoteSection,
    { available: boolean; isLoading: boolean; isFromConvex: boolean }
  >;
}
