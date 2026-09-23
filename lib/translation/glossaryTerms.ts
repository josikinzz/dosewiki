import "server-only";

import { EFFECT_CATEGORY_DEFINITIONS } from "../../src/data/effectCategoryDefinitions";
import chemicalIndexManual from "../../data/substances/chemicalIndexManual.json";
import psychoactiveIndexManual from "../../data/substances/psychoactiveIndexManual.json";
import { SUBCATEGORY_LABELS } from "../../src/data/subjectiveEffectSubcategories";
import {
  DOSE_TIERS,
  DURATION_STAGES,
} from "../../src/features/article/components/sections/dosageDurationLabels";
import {
  CARCINOGENICITY_LEVEL_CONFIG,
  EVIDENCE_LEVEL_CONFIG,
  RISK_LEVEL_CONFIG,
} from "../../src/features/article/components/sections/harm-potential/harmPotentialLabels";
import { INTERACTION_TIERS } from "../../src/features/article/components/sections/interactionTierLabels";
import { ROUTE_VOCABULARY } from "../../src/features/article/components/sections/routeLabels";
import { EFFECT_ARTICLE_SECTION_TITLES } from "../../src/features/effects/articleSectionModel";
import {
  FLAT_CATEGORIES,
  PARENT_CATEGORIES,
  TABS,
} from "../../src/features/effects/pages/effectsIndexConfig";
import { REPLICATION_VOCABULARY } from "../../src/features/replications/replicationVocabulary";
import { REAGENT_LABELS } from "../../src/lib/reagentTesting";
import {
  CANONICAL_LEGAL_STATUSES,
  CANONICAL_STATUS_LABELS,
} from "../../src/schema/substance/legalStatuses";
import {
  getCatalogSchemaSections,
  getSubstanceSectionManifestEntries,
} from "../../src/schema/substance/sectionCatalog";
import type { PublicDataReadAdapter } from "../data/publicData.reads";

/**
 * The five terms the intensity scales label every effect with. They appear as
 * `[sup](common)[/sup]` inside scale rosters and as an ordered list in the
 * frequency article, so one rendering has to serve both or the two surfaces
 * stop agreeing.
 */
const FREQUENCY_TERMS = [
  "Rare",
  "Uncommon",
  "Common",
  "Frequent",
  "Near universal",
];

/** The harm-reduction register: the words a reader meets on every page, small enough to hand-hold. */
const REGISTER_TERMS = [
  "come-up",
  "comedown",
  "dissociative",
  "deliriant",
  "dosage",
  "empathogenic",
  "entactogenic",
  "harm reduction",
  "hallucinogen",
  "psychedelic",
  "set and setting",
  "stimulant",
  "tolerance",
  "trip report",
  "withdrawal",
];

/**
 * The names the site and its lineage go by. A rendering equal to the term is
 * how a reviewer says "keep as-is": the drafter asks for a rendering like any
 * other term, and an approved row whose target is its own term pins the name
 * in Latin script across every segment that mentions it.
 */
const SITE_NAMES = [
  "dose.wiki",
  "Effect Index",
  "Subjective Effect Index",
  "SEI",
  "PsychonautWiki",
  "Disregard Everything I Say",
  "TripSit",
];

/**
 * The closed sets. A legal status, a dose tier, a duration stage, a harm level,
 * an evidence level and an interaction tier each have exactly one right
 * rendering, and each one appears both as a registry label and inside
 * substance prose. Left unfrozen they drift between the two: the layout
 * registry saying one thing and the article saying another about the same badge.
 */
const ENUM_LABELS: Record<string, readonly string[]> = {
  "legal-status": CANONICAL_LEGAL_STATUSES.map(
    (value) => CANONICAL_STATUS_LABELS[value],
  ),
  "dose-tier": DOSE_TIERS.map(({ label }) => label),
  "duration-stage": DURATION_STAGES.map(({ label }) => label),
  "risk-level": Object.values(RISK_LEVEL_CONFIG).map(({ label }) => label),
  "carcinogenicity-level": Object.values(CARCINOGENICITY_LEVEL_CONFIG).map(
    ({ label }) => label,
  ),
  "evidence-level": Object.values(EVIDENCE_LEVEL_CONFIG).map(
    ({ label }) => label,
  ),
  "interaction-tier": INTERACTION_TIERS.map(({ label }) => label),
};

export type GlossaryTerm = { term: string; kind: string };

/**
 * Every term the site publishes, deduped case-insensitively (first kind wins), sorted.
 *
 * Insertion order is kind precedence: a term two groups claim keeps the kind
 * of the earlier one ("Common" is a frequency before it is an index group,
 * "Psychedelic" a register word before a class). New groups go after the
 * existing ones so no historical row changes kind.
 */
export async function collectGlossaryTerms(
  reads: PublicDataReadAdapter,
): Promise<GlossaryTerm[]> {
  const terms = new Map<string, GlossaryTerm>();
  const add = (term: unknown, kind: string) => {
    const trimmed = String(term ?? "").trim();
    if (trimmed.length < 2 || terms.has(trimmed.toLowerCase())) return;
    terms.set(trimmed.toLowerCase(), { term: trimmed, kind });
  };

  for (const term of REGISTER_TERMS) add(term, "register");
  for (const effect of await reads.getPublicEffects())
    add(effect.name, "effect-name");
  for (const category of EFFECT_CATEGORY_DEFINITIONS)
    add(category.name, "effect-category");
  for (const category of psychoactiveIndexManual.categories)
    add(category.label, "psychoactive-class");
  for (const term of FREQUENCY_TERMS) add(term, "frequency");
  for (const [group, labels] of Object.entries(ENUM_LABELS))
    for (const label of labels) add(label, `enum:${group}`);
  for (const chemicalClass of chemicalIndexManual.classes)
    add(chemicalClass.label, "chemical-class");
  for (const term of REPLICATION_VOCABULARY) add(term, "replication");
  for (const term of SITE_NAMES) add(term, "site-name");
  for (const tab of TABS) add(tab.label, "index-name");
  for (const category of psychoactiveIndexManual.categories) {
    for (const section of category.sections) add(section.label, "index-name");
  }
  for (const category of PARENT_CATEGORIES) {
    add(category.displayTitle, "effect-subcategory");
    for (const subcategory of category.subcategories)
      add(subcategory.title, "effect-subcategory");
  }
  for (const category of FLAT_CATEGORIES)
    add(category.title, "effect-subcategory");
  for (const label of SUBCATEGORY_LABELS) add(label, "effect-subcategory");
  for (const entry of getSubstanceSectionManifestEntries())
    add(entry.label, "section-heading");
  for (const section of getCatalogSchemaSections())
    add(section.label, "section-heading");
  for (const title of Object.values(EFFECT_ARTICLE_SECTION_TITLES))
    add(title, "section-heading");
  for (const term of ROUTE_VOCABULARY) add(term, "route");
  for (const term of REAGENT_LABELS) add(term, "reagent-name");
  for (const chemicalClass of chemicalIndexManual.classes) {
    for (const alias of chemicalClass.aliases)
      add(alias, "chemical-class-alias");
  }

  return [...terms.values()].sort((a, b) => a.term.localeCompare(b.term));
}
