import type { SubstanceArticle } from "@/schema";
import type { ManualIndexConfig } from "@/data/builders/manualIndexLoader";
import type { DevArticleHydration } from "./useDevArticleHydration";
import type { EditorDocumentRefreshConflict } from "./editorDocumentSession";

export type ArticleRecord = SubstanceArticle;

export type ManualPsychoactiveIndexConfig = ManualIndexConfig;
export type ManualChemicalIndexConfig = ManualIndexConfig;
export type ManualMechanismIndexConfig = ManualIndexConfig;

export type DevActiveProposal = {
  proposalId: string;
  reason: string | null;
  summary: string;
};

export type DevProposalSeed = {
  proposalId: string;
  summary: string;
  reason: string | null;
  payload: {
    articles?: ReadonlyArray<Partial<SubstanceArticle> & { title: string; slug?: string }>;
    indexLayouts?: ReadonlyArray<ManualIndexConfig & { type: "psychoactive" | "chemical" | "mechanism" }>;
  };
};
export type DevIndexLayoutsReadiness =
  | { status: "idle"; error: null }
  | { status: "loading"; error: null }
  | { status: "ready"; error: null }
  | { status: "error"; error: string };


export type DevModeContextValue = {
  articles: ArticleRecord[];
  sourceArticles: ArticleRecord[];
  articlesRefreshConflict: EditorDocumentRefreshConflict<ArticleRecord[]> | null;
  psychoactiveIndexManual: ManualPsychoactiveIndexConfig;
  chemicalIndexManual: ManualChemicalIndexConfig;
  mechanismIndexManual: ManualMechanismIndexConfig;
  indexLayoutsReadiness: DevIndexLayoutsReadiness;
  requestIndexLayouts: () => void;
  retryIndexLayouts: () => void;
  requestLibrary: () => Promise<void>;
  close: () => void;
  updateArticleAt: (index: number, nextArticle: ArticleRecord) => void;
  resetArticleAt: (index: number) => void;
  getOriginalArticle: (index: number) => ArticleRecord | undefined;
  getOriginalArticles: () => ArticleRecord[];
  getArticleBaseHashes: () => Record<string, string>;
  restoreArticleBaseHashes: (hashes: Record<string, string>) => void;
  replaceArticles: (nextArticles: ArticleRecord[]) => void;
  applyArticlesTransform: (transform: (previous: ArticleRecord[]) => ArticleRecord[]) => void;
  articleHydration: DevArticleHydration;
  replacePsychoactiveIndexManual: (nextConfig: ManualPsychoactiveIndexConfig) => void;
  resetPsychoactiveIndexManual: () => void;
  getOriginalPsychoactiveIndexManual: () => ManualPsychoactiveIndexConfig;
  applyPsychoactiveIndexManualTransform: (
    transform: (previous: ManualPsychoactiveIndexConfig) => ManualPsychoactiveIndexConfig,
  ) => void;
  replaceChemicalIndexManual: (nextConfig: ManualChemicalIndexConfig) => void;
  resetChemicalIndexManual: () => void;
  getOriginalChemicalIndexManual: () => ManualChemicalIndexConfig;
  applyChemicalIndexManualTransform: (
    transform: (previous: ManualChemicalIndexConfig) => ManualChemicalIndexConfig,
  ) => void;
  replaceMechanismIndexManual: (nextConfig: ManualMechanismIndexConfig) => void;
  resetMechanismIndexManual: () => void;
  getOriginalMechanismIndexManual: () => ManualMechanismIndexConfig;
  applyMechanismIndexManualTransform: (
    transform: (previous: ManualMechanismIndexConfig) => ManualMechanismIndexConfig,
  ) => void;
  markChangesSaved: (receipts?: Array<{ slug: string; baseHash: string }>) => void;
  activeProposal: DevActiveProposal | null;
  loadProposal: (seed: DevProposalSeed) => Promise<void>;
  clearActiveProposal: () => void;
  discardActiveProposal: () => void;
};
