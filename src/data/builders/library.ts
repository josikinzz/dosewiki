import type { IconName } from "@/components/common/Icon";
import type {
  InteractionGroup,
  InteractionMatchType,
  InteractionTarget,
} from "../../types/content";

export interface DrugListEntry {
  name: string;
  slug: string;
  alias?: string;
}

export interface CategoryDefinition {
  key: string;
  name: string;
  icon: IconName;
  aliases?: string[];
  fallback?: boolean;
}

export interface DosageCategoryGroup {
  key: string;
  name: string;
  icon: IconName;
  total: number;
  drugs: DrugListEntry[];
  sections?: CategoryDetailGroup[];
  /** @deprecated Use columns instead */
  column?: number;
  columns?: Record<string, number>;
}

export interface CategoryDetailGroup {
  name: string;
  drugs: DrugListEntry[];
}

export interface CategoryDetail {
  definition: CategoryDefinition;
  total: number;
  groups: CategoryDetailGroup[];
}

export interface EffectSummary {
  name: string;
  slug: string;
  total: number;
}

export interface EffectDetail {
  definition: EffectSummary;
  groups: DosageCategoryGroup[];
}

export interface MechanismSummary {
  name: string;
  slug: string;
  total: number;
}

export interface MechanismDetail {
  definition: MechanismSummary;
  qualifiers: MechanismQualifierDetail[];
  defaultQualifierKey: string;
}

export interface MechanismQualifierDetail {
  key: string;
  label: string;
  qualifier?: string;
  total: number;
  groups: DosageCategoryGroup[];
}

export type ClassificationType = "chemical" | "psychoactive";

export interface ClassificationDetail {
  type: ClassificationType;
  label: string;
  slug: string;
  total: number;
  drugs: DrugListEntry[];
}

export interface InteractionReference {
  sourceSlug: string;
  sourceName: string;
  severity: InteractionGroup["severity"];
  target: InteractionTarget;
}

export interface InteractionIndexEntry {
  slug: string;
  display: string;
  matchType: InteractionMatchType;
  matchedSubstanceSlug?: string;
  matchedSubstanceName?: string;
  classKey?: string;
  classLabel?: string;
  references: InteractionReference[];
}

export type InteractionIndex = Map<string, InteractionIndexEntry>;
