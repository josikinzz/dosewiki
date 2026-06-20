import type { ReactNode } from "react";
import type { EditorStatusPillTone } from "@/features/dev/components";
import type {
  ManualCategoryDefinition,
  ManualCategorySection,
  ManualIndexConfig,
  ManualSectionLink,
} from "@/data/builders/manualIndexLoader";

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

/**
 * Slug-issue severity mapped to the shared `EditorStatusPill` semantic tones
 * (which resolve to `.theme-status-badge[data-badge-tone]` rose/yellow/gray).
 * Replaces the previous per-color literal classes (rose/amber/violet) that
 * never remapped and went off-hue in light mode. No violet badge tone exists,
 * so `duplicate` reads neutral (gray).
 */
export const slugIssueTones: Record<SlugIssue, EditorStatusPillTone> = {
  missing: "danger",
  hidden: "warning",
  duplicate: "neutral",
};
