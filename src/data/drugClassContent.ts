/**
 * Drug class summary content extracted from EffectIndex.
 *
 * Provides introductory content for psychoactive substance category pages
 * at /category/{psychedelic|dissociative|deliriant}. The prose lives in
 * `content/taxonomy/drug-classes.json`; this module types it.
 */

import drugClassesSource from "@content/taxonomy/drug-classes.json";
import type { IconName } from "../components/common/Icon";

export interface DrugClassSection {
  title: string;
  icon: IconName;
  description: string;
  /** Tags to filter effects for this section (all must match) */
  effectTags: string[];
  /** Tags to exclude from this section */
  excludeTags?: string[];
}

export interface DrugClassContent {
  /** Matches definition.key in psychoactiveIndexManual.json */
  categoryKey: string;
  /** Page title */
  title: string;
  /** Intro paragraphs (HTML) */
  introHtml: string;
  /** List of example substances (italic) */
  applicableSubstances: string;
  /** Optional sections grouping effects */
  sections?: DrugClassSection[];
}

/**
 * Drug class content for hallucinogen categories.
 */
export const DRUG_CLASS_CONTENT: DrugClassContent[] = drugClassesSource as DrugClassContent[];

/**
 * Get drug class content by category key.
 */
export function getDrugClassContent(categoryKey: string): DrugClassContent | undefined {
  return DRUG_CLASS_CONTENT.find(content => content.categoryKey === categoryKey);
}
