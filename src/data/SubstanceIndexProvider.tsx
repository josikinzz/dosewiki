/**
 * React context provider for lazy-loaded substance index data.
 *
 * Wraps the application and provides substance data via context.
 * Uses React Suspense for loading states.
 */

import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import type { SubstanceArticle } from "../schema";
import type { SubstanceRecord } from "./builders/contentBuilder";
import type {
  DosageCategoryGroup,
  CategoryDefinition,
  CategoryDetail,
  EffectSummary,
  EffectDetail,
  MechanismSummary,
  MechanismDetail,
  ClassificationDetail,
  InteractionIndex,
} from "./builders/library";
import type { TaxonomyRouteSurface } from "./builders/taxonomy";

export type PublicTaxonomyDetail =
  | CategoryDetail
  | ClassificationDetail
  | MechanismDetail
  | EffectDetail;

/**
 * Shape of the library data computed from substance index.
 * This mirrors the exports from library.ts.
 */
export interface LibraryData {
  // Raw articles
  articles: SubstanceArticle[];

  // Substance records
  allSubstanceRecords: SubstanceRecord[];
  substanceRecords: SubstanceRecord[];
  allSubstancesBySlug: Map<string, SubstanceRecord>;
  substanceBySlug: Map<string, SubstanceRecord>;

  // Interaction index
  interactionIndex: InteractionIndex;

  // Category groups
  dosageCategoryGroups: DosageCategoryGroup[];
  chemicalClassIndexGroups: DosageCategoryGroup[];
  mechanismIndexGroups: DosageCategoryGroup[];

  // Effect summaries
  effectSummaries: EffectSummary[];

  // Mechanism summaries
  mechanismSummaries: MechanismSummary[];

  // Lookup functions
  findCategoryByKey: (input: string) => CategoryDefinition | undefined;
  normalizeCategoryKey: (value: string) => string;
  getCategoryDetail: (categoryKey: string) => CategoryDetail | null;
  getEffectDetail: (effectSlug: string) => EffectDetail | null;
  getEffectSummary: (effectSlug: string) => EffectSummary | undefined;
  getMechanismDetail: (mechanismSlug: string) => MechanismDetail | null;
  getMechanismSummary: (mechanismSlug: string) => MechanismSummary | undefined;
  getChemicalClassDetail: (identifier: string) => ClassificationDetail | null;
  getPsychoactiveClassDetail: (identifier: string) => ClassificationDetail | null;
  getTaxonomyRouteDetail: (
    surface: TaxonomyRouteSurface,
    identifier: string,
  ) => PublicTaxonomyDetail | null;
  getTaxonomyRoutePath: (surface: TaxonomyRouteSurface, identifier: string) => string | null;
  getInteractionsForSubstance: (slug: string) => SubstanceRecord["content"]["interactions"] | undefined;
  buildCategoryGroupsForRecords: (records: SubstanceRecord[]) => DosageCategoryGroup[];
}

/**
 * Context for library data.
 */
const SubstanceIndexContext = createContext<LibraryData | null>(null);

/**
 * Props for SubstanceIndexProvider.
 */
interface SubstanceIndexProviderProps {
  children: ReactNode;
  libraryData: LibraryData;
}

/**
 * Provider component that supplies library data to the app.
 *
 * Usage:
 * ```tsx
 * <SubstanceIndexProvider libraryData={data}>
 *   <App />
 * </SubstanceIndexProvider>
 * ```
 */
export function SubstanceIndexProvider({ children, libraryData }: SubstanceIndexProviderProps) {
  return (
    <SubstanceIndexContext.Provider value={libraryData}>
      {children}
    </SubstanceIndexContext.Provider>
  );
}

/**
 * Hook to access the full library data.
 *
 * @throws Error if used outside of SubstanceIndexProvider
 */
export function useLibrary(): LibraryData {
  const context = useContext(SubstanceIndexContext);
  if (context === null) {
    throw new Error("useLibrary must be used within a SubstanceIndexProvider");
  }
  return context;
}

/**
 * Hook to access just the articles array.
 */
export function useArticles(): SubstanceArticle[] {
  const library = useLibrary();
  return library.articles;
}

/**
 * Hook to access substance records.
 */
export function useSubstanceRecords(): SubstanceRecord[] {
  const library = useLibrary();
  return library.substanceRecords;
}

/**
 * Hook to access the substance-by-slug map.
 */
export function useSubstanceBySlug(): Map<string, SubstanceRecord> {
  const library = useLibrary();
  return library.substanceBySlug;
}

/**
 * Hook to get a specific substance by slug.
 */
export function useSubstance(slug: string | undefined): SubstanceRecord | null {
  const substanceBySlug = useSubstanceBySlug();
  return useMemo(() => {
    if (!slug) return null;
    return substanceBySlug.get(slug) ?? null;
  }, [substanceBySlug, slug]);
}

/**
 * Hook to check if library data is available.
 * Returns true if inside SubstanceIndexProvider with data.
 */
export function useLibraryReady(): boolean {
  const context = useContext(SubstanceIndexContext);
  return context !== null;
}
