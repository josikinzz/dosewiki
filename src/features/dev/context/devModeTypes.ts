import type { SubstanceArticle } from "@/schema";
import type { ManualIndexConfig } from "@/data/builders/manualIndexLoader";
import type { DevArticleHydration } from "./useDevArticleHydration";
import type { EditorDocumentRefreshConflict } from "./editorDocumentSession";

export type ArticleRecord = SubstanceArticle;

export type ManualPsychoactiveIndexConfig = ManualIndexConfig;
export type ManualChemicalIndexConfig = ManualIndexConfig;
export type ManualMechanismIndexConfig = ManualIndexConfig;

/** The returned proposal the working set is a rebase of; the next save supersedes it. */
export type DevActiveProposal = {
  proposalId: string;
  /** Why it came back: the apply conflict, or the reviewer's note. Null when neither was recorded. */
  reason: string | null;
  summary: string;
};

/** What the queue hands the context to seed the working set from: one full proposal row. */
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
  /**
   * The latest articles the live Postgres query delivered.
   *
   * `articles` is the working-set draft, which stops accepting live updates
   * while it holds unapplied changes; this one never stops. The two agree
   * whenever the working set is clean, so reading a stored value from here is
   * only different from reading it out of `articles` in exactly the case where
   * `articles` has gone stale.
   */
  sourceArticles: ArticleRecord[];
  /** Non-null while the working set is holding `articles` back from `sourceArticles`. */
  articlesRefreshConflict: EditorDocumentRefreshConflict<ArticleRecord[]> | null;
  psychoactiveIndexManual: ManualPsychoactiveIndexConfig;
  chemicalIndexManual: ManualChemicalIndexConfig;
  mechanismIndexManual: ManualMechanismIndexConfig;
  /** Revision-bearing editor layouts are loaded only after a consuming tool asks for them. */
  indexLayoutsReadiness: DevIndexLayoutsReadiness;
  requestIndexLayouts: () => void;
  retryIndexLayouts: () => void;
  /** Start the complete corpus + layout read at explicit editor intent. */
  requestLibrary: () => Promise<void>;
  close: () => void;
  updateArticleAt: (index: number, nextArticle: ArticleRecord) => void;
  resetArticleAt: (index: number) => void;
  getOriginalArticle: (index: number) => ArticleRecord | undefined;
  getOriginalArticles: () => ArticleRecord[];
  replaceArticles: (nextArticles: ArticleRecord[]) => void;
  applyArticlesTransform: (transform: (previous: ArticleRecord[]) => ArticleRecord[]) => void;
  /**
   * On-demand whole-article loading.
   *
   * `articles` is built from the slim library list, so a row carries identity,
   * taxonomy, and review state but an empty body. Any surface that renders or
   * edits article content must ask for that content first and wait for it —
   * `requestArticle` for the one it has selected, `hydrateArticlesNow` for the
   * rows a mutation is about to rewrite.
   */
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
  markChangesSaved: () => void;
  /** Set while the working set was seeded from a returned proposal; null otherwise. */
  activeProposal: DevActiveProposal | null;
  /**
   * Seed the working set from a proposal: every article it carries is
   * hydrated from production, then overlaid with the proposed fields, and its
   * index layouts replace the layout drafts. Resolves once the seed is in
   * place; rejects when a production article it needs could not be loaded.
   */
  loadProposal: (seed: DevProposalSeed) => Promise<void>;
  /** Forget the proposal link but keep the edits: the next save is a fresh proposal. */
  clearActiveProposal: () => void;
  /** Put the seeded rows back to production and forget the proposal link. */
  discardActiveProposal: () => void;
};
