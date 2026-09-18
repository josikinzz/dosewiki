/**
 * Transforms SubstanceArticle entries into the normalized structures
 * consumed by the UI. The source JSON uses the structured SubstanceArticle
 * schema which we transform into SubstanceContent for components.
 */
import type { IconName } from "@/components/common/Icon";
import { resolveEffectNameAlias, type EffectLocation } from "@/data/effectNameAliases";
import { stripCitationTokens } from "@/lib/citations/citationTokens";
import { slugify } from "@/utils/slug";

import type {
  SubstanceContent,
  HeroBadge,
  InfoSection,
  InfoSectionItemChip,
  NameVariant,
} from "../../types/content";
import type {
  Identification,
  SubjectiveEffects,
  SubstanceArticlePublicProjection,
  SubstanceArticleProjectionInput,
} from "../../schema";
import { getCategoryIcon } from "../config/categoryIcons";
import {
  isDirectUrlOnlySubstance,
  isHiddenSubstance,
  normalizeMechanisms,
  projectSubstanceArticle,
  type NormalizedMechanism,
  type SubstancePriority,
} from "../../schema";
import {
  cleanString,
  normalizeKey,
  slugifyDrugName,
  titleize,
} from "./contentBuilderShared";
import { buildRoutes } from "./contentBuilderRoutes";
import {
  buildInteractionGroups,
  buildToleranceEntries,
} from "./contentBuilderInteractions";
import { buildArticleChemistryPresentation } from "./articleChemistryPresentation";
export { slugifyDrugName } from "./contentBuilderShared";

export interface SubstanceRecord {
  id: number | null;
  name: string;
  slug: string;
  aliases: string[];
  categories: string[];
  indexCategories: string[];
  chemicalClasses: string[];
  psychoactiveClasses: string[];
  priority: SubstancePriority;
  isHidden: boolean;
  isDirectUrlOnly: boolean;
  mechanisms: SubstanceMechanism[];
  content: SubstanceContent;
}

type SubstanceMechanism = NormalizedMechanism

function buildMechanisms(mechanismTags: string[]): SubstanceMechanism[] {
  return normalizeMechanisms(mechanismTags);
}

function buildInfoSections(
  projection: SubstanceArticlePublicProjection,
  mechanisms: SubstanceMechanism[],
): InfoSection[] {
  const items: InfoSection["items"] = [];
  const { identity, taxonomy, pharmacology } = projection;

  const substitutiveName = cleanString(identity.substitutiveName);
  if (substitutiveName) {
    items.push({ label: "Substitutive name", value: substitutiveName, icon: "lucide:atom" as IconName });
  }

  const iupacName = cleanString(identity.iupacName);
  if (iupacName) {
    items.push({ label: "IUPAC name", value: iupacName, icon: "lucide:flask-round" as IconName });
  }

  const chemicalClass = taxonomy.chemicalClasses.join("; ");
  if (chemicalClass) {
    items.push({ label: "Chemical class", value: chemicalClass, icon: "lucide:hexagon" as IconName });
  }

  if (mechanisms.length > 0) {
    const mechanism = mechanisms.map((entry) => entry.label).join("; ");
    const chips: InfoSectionItemChip[] = mechanisms.map((entry) => ({
      label: entry.label,
      base: entry.base,
      slug: entry.slug,
      qualifier: entry.qualifier,
      qualifierSlug: entry.qualifierSlug,
    }));

    items.push({
      label: "Mechanism of Action",
      value: mechanism,
      icon: "lucide:cog" as IconName,
      chips,
    });
  }

  const psychoClass = taxonomy.psychoactiveClasses.join("; ");
  if (psychoClass) {
    items.push({ label: "Psychoactive class", value: psychoClass, icon: "lucide:brain-circuit" as IconName });
  }

  const halfLife = cleanString(pharmacology.halfLife);
  if (halfLife) {
    items.push({ label: "Half-life", value: halfLife, icon: "lucide:trending-down" as IconName });
  }

  if (items.length === 0) {
    return [];
  }

  return [
    {
      title: "Chemistry & Pharmacology",
      icon: "lucide:brain-cog" as IconName,
      items,
    },
  ];
}

function buildHeroBadges(categories: string[], normalizedKeys: string[]): HeroBadge[] {
  const badges: HeroBadge[] = [];
  const seen = new Set<string>();

  categories.forEach((category, index) => {
    const normalized = normalizedKeys[index];
    if (!normalized || seen.has(normalized)) {
      return;
    }
    seen.add(normalized);

    const icon = getCategoryIcon(normalized);
    badges.push({
      icon,
      label: titleize(category),
      categoryKey: normalized,
    });
  });

  return badges;
}

function buildPlaceholder(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    return "";
  }

  return trimmed
    .split(/\s+/)
    .map((segment) => segment.charAt(0).toUpperCase())
    .slice(0, 3)
    .join(" ");
}

function buildNameVariants(identification: Identification | undefined, baseName: string): NameVariant[] {
  const variants: NameVariant[] = [];
  const seen = new Set<string>();

  const baseKey = baseName.trim().toLocaleLowerCase("en-US");
  if (baseKey) {
    seen.add(baseKey);
  }

  const addVariant = (
    kind: NameVariant["kind"],
    label: string,
    values: string[] | string | null | undefined,
  ) => {
    const valueArray = Array.isArray(values) ? values : (cleanString(values) ? [values as string] : []);
    const cleanedValues: string[] = [];

    valueArray.forEach((entry) => {
      const normalizedEntry = cleanString(entry);
      if (!normalizedEntry) {
        return;
      }

      if (normalizedEntry.localeCompare(baseName, undefined, { sensitivity: "accent" }) === 0) {
        return;
      }

      const key = normalizedEntry.toLocaleLowerCase("en-US");
      if (seen.has(key)) {
        return;
      }

      seen.add(key);
      cleanedValues.push(normalizedEntry);
    });

    if (cleanedValues.length > 0) {
      variants.push({
        kind,
        label,
        values: cleanedValues,
      });
    }
  };

  addVariant("substitutive", "Substitutive name", identification?.substitutive_name);
  addVariant("iupac", "IUPAC name", identification?.iupac_name);
  addVariant("alternative", "Alternative names", identification?.alternative_names);

  return variants;
}

/**
 * The canonical effect slug a chip name resolves to, mirroring what the renderer
 * links. Kept alongside the raw name so the effect -> substances join matches the
 * substance -> effect link: without it, an article saying "Euphoria" never appears
 * on the Cognitive Euphoria page even though its chip links there.
 */
function resolveEffectRefSlug(name: string, location: EffectLocation): string | null {
  const nameSlug = slugify(name);
  const alias = resolveEffectNameAlias(nameSlug, location);

  if (alias === undefined) {
    return nameSlug;
  }

  // Deliberately unlinked, or an umbrella term pointing at a category index:
  // neither names a single effect, so neither belongs in the reverse join.
  return alias === null || alias.startsWith("/effects/category/")
    ? null
    : alias.slice("/effects/".length);
}

// Extract effect names from a flexible effect category (Record<string, { note, effects }>)
function extractEffectNames(category: Record<string, { note: string; effects: { name: string; description: string }[] }> | undefined): string[] {
  if (!category || typeof category !== "object") {
    return [];
  }

  const names: string[] = [];
  for (const subcategory of Object.values(category)) {
    if (!subcategory || typeof subcategory !== "object") {
      continue;
    }
    const effects = subcategory.effects;
    if (!Array.isArray(effects)) {
      continue;
    }
    for (const entry of effects) {
      const name = cleanString(entry?.name);
      if (name) {
        names.push(name);
      }
    }
  }
  return names;
}

// Flatten subjective effects from categorized structure to flat array
function flattenSubjectiveEffects(effects: SubjectiveEffects | undefined): {
  names: string[];
  slugs: (string | null)[];
} {
  if (!effects) {
    return { names: [], slugs: [] };
  }

  const names: string[] = [];
  const slugs: (string | null)[] = [];

  const collect = (
    category: Parameters<typeof extractEffectNames>[0],
    location: EffectLocation,
  ) => {
    for (const name of extractEffectNames(category)) {
      names.push(name);
      slugs.push(resolveEffectRefSlug(name, location));
    }
  };

  // Flatten sensory effects (each sense now has { note, subcategories })
  if (effects.sensory) {
    const sensory = effects.sensory;
    collect(sensory.visual?.subcategories, "sensory.visual");
    collect(sensory.auditory?.subcategories, "sensory.auditory");
    collect(sensory.tactile?.subcategories, "sensory.tactile");
    collect(sensory.olfactory?.subcategories, "sensory.olfactory");
    collect(sensory.gustatory?.subcategories, "sensory.gustatory");
    collect(sensory.multisensory?.subcategories, "sensory.multisensory");
  }

  // Add cognitive and physical effects (still Record<string, EffectEntry[]>)
  collect(effects.cognitive, "cognitive");
  collect(effects.physical, "physical");

  return { names, slugs };
}

export function buildSubstanceRecord(article: SubstanceArticleProjectionInput): SubstanceRecord | null {
  const projection = projectSubstanceArticle(article);
  const identification = article.identification;
  const harmPotential = projection.harmPotential;

  const { identity, taxonomy } = projection;
  const baseName = identity.displayName;
  if (!baseName) {
    return null;
  }

  const id = identity.id;
  const slug = slugifyDrugName(baseName, id !== null ? `article-${id}` : baseName);

  // Categories derived from classification
  const psychoactiveClasses = taxonomy.psychoactiveClasses;
  const chemicalClasses = taxonomy.chemicalClasses;
  const categories = [...psychoactiveClasses, ...chemicalClasses];
  const normalizedCategories = categories.map((category) => normalizeKey(category));

  // Index categories from article
  const indexCategories = taxonomy.indexCategories;
  const normalizedIndexCategories = indexCategories.map((value) => normalizeKey(value)).filter((value) => value.length > 0);
  const isHidden = isHiddenSubstance(normalizedIndexCategories);

  // Priority from article (defaults to "normal")
  const priority = article.priority ?? "normal";
  const isDirectUrlOnly = isDirectUrlOnlySubstance(priority);

  const nameVariants = buildNameVariants(identification, baseName);
  const aliases = nameVariants.flatMap((variant) => variant.values);
  const referenceName = identity.substitutiveName || identity.iupacName || null;
  const displayAliases = referenceName
    ? aliases.filter(
        (alias) =>
          alias.localeCompare(referenceName, undefined, { sensitivity: "accent" }) !== 0,
      )
    : aliases;

  const { routes, routeOrder, note } = buildRoutes(
    projection.routes.dosage,
    projection.routes.duration,
  );
  const mechanisms = buildMechanisms(projection.pharmacology.mechanismTags);

  // Get addiction summary from harm_potential
  const addictionSummary = typeof (harmPotential as { addiction_liability?: unknown } | null | undefined)?.addiction_liability === "string"
    ? cleanString((harmPotential as { addiction_liability?: string }).addiction_liability) ?? ""
    : "";

  // Flatten subjective effects
  const { names: subjectiveEffects, slugs: subjectiveEffectSlugs } =
    flattenSubjectiveEffects(article.subjective_effects);

  const content: SubstanceContent = {
    name: baseName,
    // The search index shows this as a result's secondary line, and there is no
    // citation marker to render into there, so the summary's inline
    // `[cite:...]` tokens have to come out rather than ship as visible text.
    subtitle: cleanString(stripCitationTokens(article.summary ?? "")) ?? "",
    aliases: displayAliases,
    nameVariants,
    moleculePlaceholder: buildPlaceholder(baseName),
    heroBadges: buildHeroBadges(categories, normalizedCategories),
    categoryKeys: normalizedCategories,
    dosageUnitsNote: note,
    routes,
    routeOrder,
    addictionSummary,
    subjectiveEffects,
    subjectiveEffectSlugs,
    interactions: buildInteractionGroups(projection.interactions),
    tolerance: buildToleranceEntries(article.tolerance),
    reagentTesting: article.reagent_testing ?? {},
    chemistryPresentation: buildArticleChemistryPresentation(article),
    notes: cleanString(article.summary) ?? "",
    sourceCitations: projection.citations.source,
    citations: projection.citations.supporting,
    infoSections: buildInfoSections(projection, mechanisms),
    categories,
  };

  return {
    id,
    name: baseName,
    aliases,
    slug,
    categories,
    indexCategories,
    chemicalClasses,
    psychoactiveClasses,
    priority,
    isHidden,
    isDirectUrlOnly,
    mechanisms,
    content,
  };
}
