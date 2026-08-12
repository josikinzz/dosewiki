import type { SubstanceArticle } from "@/schema";
import type { ManualIndexConfig } from "@/data/builders/manualIndexLoader";
import type { DevTab } from "@/types/navigation";
import type { DevArticleHydration } from "./useDevArticleHydration";
import type { EditorDocumentRefreshConflict } from "./editorDocumentSession";

export type ArticleRecord = SubstanceArticle;

export type ManualPsychoactiveIndexConfig = ManualIndexConfig;
export type ManualChemicalIndexConfig = ManualIndexConfig;
export type ManualMechanismIndexConfig = ManualIndexConfig;

export type DevModeOpenOptions = {
  tab?: DevTab;
  slug?: string;
};

export type DevModeContextValue = {
  articles: ArticleRecord[];
  /**
   * The latest articles the live Convex query delivered.
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
  aboutMarkdown: string;
  aboutSubtitle: string;
  aboutFounderKeys: string[];
  open: (options?: DevModeOpenOptions) => void;
  close: () => void;
  updateArticleAt: (index: number, nextArticle: ArticleRecord) => void;
  resetArticleAt: (index: number) => void;
  resetAll: () => void;
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
   * `requestArticle` for the one it has selected, `requestFullCorpus` for the
   * tools that sweep every body.
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
  replaceAboutMarkdown: (nextMarkdown: string) => void;
  resetAboutMarkdown: () => void;
  getOriginalAboutMarkdown: () => string;
  replaceAboutSubtitle: (nextSubtitle: string) => void;
  resetAboutSubtitle: () => void;
  getOriginalAboutSubtitle: () => string;
  replaceAboutFounderKeys: (nextKeys: string[]) => void;
  resetAboutFounderKeys: () => void;
  getOriginalAboutFounderKeys: () => string[];
  markChangesSaved: () => void;
};
