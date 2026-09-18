/**
 * Lightweight data provider for the initial app load.
 *
 * This provides the minimum data needed to render the home page
 * without loading all 679 articles (~5MB). Only ~20KB is loaded:
 * - Category layout structure
 * - Slug-name-priority map for all substances
 */

import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { CategoryLayout } from "../hooks/useCategoryLayout";
import { isDirectUrlOnlySubstance } from "../schema";

/**
 * Substance lookup entry - minimal data for each substance.
 */
export interface SubstanceLookupEntry {
  slug: string;
  name: string;
  priority: string;
}

/**
 * Shape of the lightweight data provided by this context.
 */
export interface LightweightData {
  /** Category layout for home page structure */
  layout: CategoryLayout;
  /** Map from slug to substance info for O(1) lookups */
  lookup: Map<string, SubstanceLookupEntry>;
  /** Raw array of substance entries */
  substances: SubstanceLookupEntry[];
  /** Total count of visible substances (high/normal priority) */
  substanceCount: number;
  /** Total count of all substances including low priority */
  totalCount: number;
}

const LightweightDataContext = createContext<LightweightData | null>(null);

interface LightweightDataProviderProps {
  children: ReactNode;
  layout: CategoryLayout;
  substances: SubstanceLookupEntry[];
}

/**
 * Provider component that supplies lightweight data to the app.
 *
 * Usage:
 * ```tsx
 * <LightweightDataProvider layout={layout} substances={substances}>
 *   <App />
 * </LightweightDataProvider>
 * ```
 */
export function LightweightDataProvider({
  children,
  layout,
  substances,
}: LightweightDataProviderProps) {
  const value = useMemo<LightweightData>(() => {
    const lookup = new Map<string, SubstanceLookupEntry>(
      substances.map((s) => [s.slug, s])
    );

    const visibleSubstances = substances.filter(
      (s) => !isDirectUrlOnlySubstance(s.priority)
    );

    return {
      layout,
      lookup,
      substances,
      substanceCount: visibleSubstances.length,
      totalCount: substances.length,
    };
  }, [layout, substances]);

  return (
    <LightweightDataContext.Provider value={value}>
      {children}
    </LightweightDataContext.Provider>
  );
}

/**
 * Hook to access the lightweight data.
 *
 * @throws Error if used outside of LightweightDataProvider
 */
export function useLightweightData(): LightweightData {
  const context = useContext(LightweightDataContext);
  if (context === null) {
    throw new Error(
      "useLightweightData must be used within a LightweightDataProvider"
    );
  }
  return context;
}


