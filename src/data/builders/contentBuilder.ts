/**
 * Transforms SubstanceArticle entries into the normalized structures
 * consumed by the UI. The source JSON uses the structured SubstanceArticle
 * schema which we transform into SubstanceContent for components.
 */
import type { IconName } from "@/components/common/Icon";

import type {
  SubstanceContent,
  HeroBadge,
  InfoSection,
  InfoSectionItemChip,
  NameVariant,
} from "../../types/content";
import type {
  SubstanceArticle,
  Identification,
  SubjectiveEffects,
  SubstanceArticlePublicProjection,
} from "../../schema";
import { slugify } from "../../utils/slug";
import { getCategoryIcon } from "../config/categoryIcons";
import { projectSubstanceArticle } from "../../schema";
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
import { resolveMoleculeAssetsForArticle } from "../mappings/moleculeAssets";
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
  priority: "high" | "normal" | "low";
  isHidden: boolean;
  isLowPriority: boolean;
  content: SubstanceContent;
}


interface ParsedMechanismEntry {
  base: string;
  qualifier?: string;
}

function parseMechanismEntry(entry: string): ParsedMechanismEntry {
  const trimmed = entry.trim();
  if (trimmed.length === 0) {
    return { base: trimmed };
  }

  const match = trimmed.match(/^(.*?)(?:\s*\(([^()]+)\))$/);
  if (match) {
    const base = match[1]?.trim() ?? "";
    const qualifier = match[2]?.trim();
    if (base.length > 0) {
      return {
        base,
        qualifier: qualifier && qualifier.length > 0 ? qualifier : undefined,
      };
    }
  }

  return { base: trimmed };
}
function buildInfoSections(
  projection: SubstanceArticlePublicProjection,
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

  // Mechanism of action is projected from current receptor_profile tags and legacy fields.
  const mechanismArray = pharmacology.mechanismTags;
  if (mechanismArray && mechanismArray.length > 0) {
    const mechanism = mechanismArray.join("; ");
    const seen = new Set<string>();
    const chips: InfoSectionItemChip[] = [];

    mechanismArray.forEach((entry) => {
      const { base, qualifier } = parseMechanismEntry(entry);
      const normalizedBase = base.trim();
      if (!normalizedBase) {
        return;
      }

      const baseSlug = slugify(normalizedBase);
      if (!baseSlug) {
        return;
      }

      const qualifierSlug = qualifier ? slugify(qualifier) : undefined;
      const dedupeKey = `${baseSlug}::${qualifierSlug ?? ""}`;
      if (seen.has(dedupeKey)) {
        return;
      }
      seen.add(dedupeKey);

      chips.push({
        label: entry,
        base: normalizedBase,
        slug: baseSlug,
        qualifier,
        qualifierSlug,
      });
    });

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
function flattenSubjectiveEffects(effects: SubjectiveEffects | undefined): string[] {
  if (!effects) {
    return [];
  }

  const allEffects: string[] = [];

  // Flatten sensory effects (each sense now has { note, subcategories })
  if (effects.sensory) {
    const sensory = effects.sensory;
    allEffects.push(...extractEffectNames(sensory.visual?.subcategories));
    allEffects.push(...extractEffectNames(sensory.auditory?.subcategories));
    allEffects.push(...extractEffectNames(sensory.tactile?.subcategories));
    allEffects.push(...extractEffectNames(sensory.olfactory?.subcategories));
    allEffects.push(...extractEffectNames(sensory.gustatory?.subcategories));
    allEffects.push(...extractEffectNames(sensory.multisensory?.subcategories));
  }

  // Add cognitive and physical effects (still Record<string, EffectEntry[]>)
  allEffects.push(...extractEffectNames(effects.cognitive));
  allEffects.push(...extractEffectNames(effects.physical));

  return allEffects;
}

export function buildSubstanceRecord(article: SubstanceArticle): SubstanceRecord | null {
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
  const isHidden = normalizedIndexCategories.includes("hidden");

  // Priority from article (defaults to "normal")
  const priority = article.priority ?? "normal";
  const isLowPriority = priority === "low";

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

  // Get addiction summary from harm_potential
  const addictionSummary = typeof (harmPotential as { addiction_liability?: unknown } | null | undefined)?.addiction_liability === "string"
    ? cleanString((harmPotential as { addiction_liability?: string }).addiction_liability) ?? ""
    : "";

  // Flatten subjective effects
  const subjectiveEffects = flattenSubjectiveEffects(article.subjective_effects);
  const moleculeAssetResolution = resolveMoleculeAssetsForArticle({
    id,
    title: article.title,
    identification,
  });
  const moleculeAssets = moleculeAssetResolution.assets;

  const content: SubstanceContent = {
    name: baseName,
    subtitle: cleanString(article.summary) ?? "",
    aliases: displayAliases,
    nameVariants,
    moleculePlaceholder: buildPlaceholder(baseName),
    moleculeAsset: moleculeAssets[0],
    moleculeAssets,
    heroBadges: buildHeroBadges(categories, normalizedCategories),
    categoryKeys: normalizedCategories,
    dosageUnitsNote: note,
    routes,
    routeOrder,
    addictionSummary,
    subjectiveEffects,
    interactions: buildInteractionGroups(projection.interactions),
    tolerance: buildToleranceEntries(article.tolerance),
    reagentTesting: article.reagent_testing ?? {},
    chemistryPresentation: buildArticleChemistryPresentation(article),
    notes: cleanString(article.summary) ?? "",
    sourceCitations: projection.citations.source,
    citations: projection.citations.supporting,
    infoSections: buildInfoSections(projection),
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
    isLowPriority,
    content,
  };
}
