import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { CategoryLayout } from "../hooks/useCategoryLayout";
import { isDirectUrlOnlySubstance } from "../schema";

export interface SubstanceLookupEntry {
  slug: string;
  name: string;
  priority: string | null;
}

export interface LightweightData {
  layout: CategoryLayout;
  lookup: Map<string, SubstanceLookupEntry>;
  substances: SubstanceLookupEntry[];
  substanceCount: number;
  totalCount: number;
}

const LightweightDataContext = createContext<LightweightData | null>(null);

interface LightweightDataProviderProps {
  children: ReactNode;
  layout: CategoryLayout;
  substances: SubstanceLookupEntry[];
}

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

export function useLightweightData(): LightweightData {
  const context = useContext(LightweightDataContext);
  if (context === null) {
    throw new Error(
      "useLightweightData must be used within a LightweightDataProvider"
    );
  }
  return context;
}


