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

export interface LibraryData<
  TArticle extends LibraryArticleInput = LibraryArticleInput,
> {
  articles: TArticle[];

  allSubstanceRecords: SubstanceRecord[];
  substanceRecords: SubstanceRecord[];
  allSubstancesBySlug: Map<string, SubstanceRecord>;
  substanceBySlug: Map<string, SubstanceRecord>;

  interactionIndex: InteractionIndex;

  dosageCategoryGroups: DosageCategoryGroup[];
  chemicalClassIndexGroups: DosageCategoryGroup[];
  mechanismIndexGroups: DosageCategoryGroup[];

  effectSummaries: EffectSummary[];

  mechanismSummaries: MechanismSummary[];

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

type EditorLibraryData = LibraryData<SubstanceArticle>;

const SubstanceIndexContext = createContext<EditorLibraryData | null>(null);

interface SubstanceIndexProviderProps {
  children: ReactNode;
  libraryData: EditorLibraryData;
}

export function SubstanceIndexProvider({ children, libraryData }: SubstanceIndexProviderProps) {
  return (
    <SubstanceIndexContext.Provider value={libraryData}>
      {children}
    </SubstanceIndexContext.Provider>
  );
}

export function useLibraryIfPresent(): EditorLibraryData | null {
  return useContext(SubstanceIndexContext);
}

export function useLibrary(): EditorLibraryData {
  const context = useContext(SubstanceIndexContext);
  if (context === null) {
    throw new Error("useLibrary must be used within a SubstanceIndexProvider");
  }
  return context;
}


