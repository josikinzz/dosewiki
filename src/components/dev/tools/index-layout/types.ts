import type { ReactNode } from "react";
import type {
  ManualCategoryDefinition,
  ManualCategorySection,
  ManualIndexConfig,
  ManualSectionLink,
} from "../../../../data/builders/manualIndexLoader";

export type { ManualCategoryDefinition, ManualCategorySection, ManualIndexConfig, ManualSectionLink };

export interface IndexLayoutTabProps {
  commitPanel?: ReactNode;
}

export type SubstanceOption = {
  slug: string;
  name: string;
  alias?: string;
  isHidden: boolean;
};

export type SlugIssue = "missing" | "hidden" | "duplicate";

export type SlugStatus = {
  slug: string;
  name?: string;
  alias?: string;
  issues: SlugIssue[];
};

export type AddSlugFilterMode = "all" | "missing-section" | "missing-category" | "missing-index";

export type ManualDatasetKey = "psychoactive" | "chemical" | "mechanism";

export const DATASET_CONFIG: Record<
  ManualDatasetKey,
  {
    label: string;
    description: string;
    getter: (config: ManualIndexConfig) => ManualCategoryDefinition[];
    setter: (config: ManualIndexConfig, next: ManualCategoryDefinition[]) => ManualIndexConfig;
  }
> = {
  psychoactive: {
    label: "Psychoactive",
    description: "Substances grouped by psychoactive class (e.g. Psychedelics, Stimulants)",
    getter: (config) => config.categories,
    setter: (config, next) => ({ ...config, categories: next }),
  },
  chemical: {
    label: "Chemical",
    description: "Substances grouped by chemical structure (e.g. Phenethylamines, Tryptamines)",
    getter: (config) => config.categories,
    setter: (config, next) => ({ ...config, categories: next }),
  },
  mechanism: {
    label: "Mechanism",
    description: "Substances grouped by mechanism of action (e.g. 5-HT agonists, GABA modulators)",
    getter: (config) => config.categories,
    setter: (config, next) => ({ ...config, categories: next }),
  },
};

export const slugIssueLabels: Record<SlugIssue, string> = {
  missing: "Missing",
  hidden: "Hidden",
  duplicate: "Duplicate",
};

export const slugIssueColors: Record<SlugIssue, string> = {
  missing: "text-rose-300 bg-rose-500/10",
  hidden: "text-amber-300 bg-amber-500/10",
  duplicate: "text-violet-300 bg-violet-500/20",
};
