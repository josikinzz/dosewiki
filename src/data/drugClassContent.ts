import drugClassesSource from "@content/taxonomy/drug-classes.json";
import type { IconName } from "../components/common/Icon";

export interface DrugClassSection {
  title: string;
  icon: IconName;
  description: string;
  effectTags: string[];
  excludeTags?: string[];
}

export interface DrugClassContent {
  categoryKey: string;
  title: string;
  introHtml: string;
  applicableSubstances: string;
  sections?: DrugClassSection[];
}

export const DRUG_CLASS_CONTENT: DrugClassContent[] = drugClassesSource as DrugClassContent[];

export function getDrugClassContent(categoryKey: string): DrugClassContent | undefined {
  return DRUG_CLASS_CONTENT.find(content => content.categoryKey === categoryKey);
}
