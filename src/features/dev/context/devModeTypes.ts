import type { SubstanceArticle } from "@/schema";
import type { ManualIndexConfig } from "@/data/builders/manualIndexLoader";
import type { DevTab } from "@/types/navigation";

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
