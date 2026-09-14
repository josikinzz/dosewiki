/**
 * React context provider for lazy-loaded substance index data.
 *
 * Wraps the application and provides substance data via context.
 * Uses React Suspense for loading states.
 */

import {
  createContext,
  useContext,
  type ReactNode,
} from "react";
import type { SubstanceArticle } from "../schema";
import type { LibraryArticleInput } from "./builders/articleNormalization";
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
export interface LibraryData<
  TArticle extends LibraryArticleInput = LibraryArticleInput,
> {
  // Raw articles
  articles: TArticle[];

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
type EditorLibraryData = LibraryData<SubstanceArticle>;

const SubstanceIndexContext = createContext<EditorLibraryData | null>(null);

/**
 * Props for SubstanceIndexProvider.
 */
interface SubstanceIndexProviderProps {
  children: ReactNode;
  libraryData: EditorLibraryData;
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
export function useLibrary(): EditorLibraryData {
  const context = useContext(SubstanceIndexContext);
  if (context === null) {
    throw new Error("useLibrary must be used within a SubstanceIndexProvider");
  }
  return context;
}


