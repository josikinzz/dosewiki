/**
 * Transforms SubstanceArticle entries into the normalized structures
 * consumed by the UI. The source JSON uses the structured SubstanceArticle
 * schema which we transform into SubstanceContent for components.
 */
import { Atom, BrainCircuit, BrainCog, Cog, FlaskRound, Hexagon, TrendingDown } from "lucide-react";

import type {
  SubstanceContent,
  RouteInfo,
  RouteKey,
  HeroBadge,
  InteractionGroup,
  InteractionTarget,
  ToleranceEntry,
  InfoSection,
  CitationEntry,
  InfoSectionItemChip,
  MoleculeAsset,
  NameVariant,
} from "../../types/content";
import type {
  SubstanceArticle,
  DoseRange,
  DoseRanges,
  DosageRoute,
  DurationStage,
  DurationStages,
  DurationRoute,
  Interactions,
  Tolerance,
  Citation,
  Pharmacology,
  Classification,
  Identification,
  SubjectiveEffects,
  HarmPotential,
} from "../../schema";
import { slugify } from "../../utils/slug";
import { getCategoryIcon } from "../config/categoryIcons";
import { canonicalizeRouteLabel } from "../routeSynonyms";
import moleculeSvgMappings from "../mappings/moleculeSvgMappings.json";

export interface SubstanceRecord {
  id: number | null;
  name: string;
  slug: string;
  aliases: string[];
  categories: string[];
  indexCategories: string[];
  chemicalClasses: string[];
  psychoactiveClasses: string[];
  isHidden: boolean;
  content: SubstanceContent;
}

type InteractionSeverity = InteractionGroup["severity"];

type NonEmptyString = string & { __brand: "NonEmptyString" };

const INTERACTION_LABELS: Record<InteractionSeverity, string> = {
  danger: "Dangerous combinations",
  unsafe: "Unsafe combinations",
  caution: "Use caution",
};

const DURATION_LABELS: Record<string, string> = {
  total_duration: "Total",
  onset: "Onset",
  come_up: "Come-up",
  peak: "Peak",
  offset: "Offset",
  after_effects: "After effects",
};

type DurationStageKey = keyof typeof DURATION_LABELS;

interface MoleculeMappingEntry {
  filename: string;
  articleId: number;
  articleTitle: string;
  matchedField: string;
  matchedValue: string;
  resolution?: string;
  deduplicatedFrom?: string[];
}

interface MoleculeMappingFile {
  mappings: MoleculeMappingEntry[];
}

const moleculeMappingByArticleId: Map<number, MoleculeMappingEntry[]> = (() => {
  const raw = moleculeSvgMappings as MoleculeMappingFile;
  const map = new Map<number, MoleculeMappingEntry[]>();
  if (!raw?.mappings) {
    return map;
  }

  for (const entry of raw.mappings) {
    if (!entry || typeof entry.articleId !== "number") {
      continue;
    }
    if (!entry.filename) {
      continue;
    }

    const existing = map.get(entry.articleId);
    if (existing) {
      existing.push(entry);
      continue;
    }

    map.set(entry.articleId, [entry]);
  }

  return map;
})();

function isNonEmpty(value: unknown): value is NonEmptyString {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .trim();
}

function titleize(value: string): string {
  return value
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function cleanString(value: string | null | undefined): string | undefined {
  if (!isNonEmpty(value)) {
    return undefined;
  }
  return value.trim();
}

function cleanStringArray(values: unknown): string[] {
  if (!Array.isArray(values)) {
    return [];
  }
  return values
    .map((entry) => (isNonEmpty(entry) ? entry.trim() : undefined))
    .filter((entry): entry is string => Boolean(entry));
}

// Format a DoseRange { min, max, unit } into a display string like "10-25 mg"
function formatDoseRange(range: DoseRange | null | undefined): string | undefined {
  if (!range) {
    return undefined;
  }
  const { min, max, unit } = range;
  if (min == null && max == null) {
    return undefined;
  }
  const unitStr = cleanString(unit) || "";
  if (min != null && max != null) {
    return `${min}-${max} ${unitStr}`.trim();
  }
  if (min != null) {
    return `${min}+ ${unitStr}`.trim();
  }
  if (max != null) {
    return `<${max} ${unitStr}`.trim();
  }
  return undefined;
}

// Format a DurationStage { min, max, unit } into a display string like "30-60 minutes"
function formatDurationStage(stage: DurationStage | null | undefined): string | undefined {
  if (!stage) {
    return undefined;
  }
  const { min, max, unit } = stage;
  if (min == null && max == null) {
    return undefined;
  }
  const unitStr = cleanString(unit) || "";
  if (min != null && max != null) {
    return `${min}-${max} ${unitStr}`.trim();
  }
  if (min != null) {
    return `${min}+ ${unitStr}`.trim();
  }
  if (max != null) {
    return `<${max} ${unitStr}`.trim();
  }
  return undefined;
}

// Format threshold specially: min-only shows as "~X" instead of "X+"
function formatThresholdRange(range: DoseRange | null | undefined): string | undefined {
  if (!range) {
    return undefined;
  }
  const { min, max, unit } = range;
  if (min == null && max == null) {
    return undefined;
  }
  const unitStr = cleanString(unit) || "";
  if (min != null && max != null) {
    return `${min}-${max} ${unitStr}`.trim();
  }
  if (min != null) {
    return `~${min} ${unitStr}`.trim();
  }
  if (max != null) {
    return `<${max} ${unitStr}`.trim();
  }
  return undefined;
}

// Build dosage entries from SubstanceArticle DoseRanges
function buildDoseEntries(ranges: DoseRanges | null | undefined): RouteInfo["dosage"] {
  if (!ranges) {
    return [];
  }

  const doseKeys: Array<keyof DoseRanges> = ["threshold", "light", "moderate", "strong", "heavy"];

  return doseKeys
    .map((key) => {
      const range = ranges[key];
      // Use special formatting for threshold (shows "~X" instead of "X+")
      const value = key === "threshold" ? formatThresholdRange(range) : formatDoseRange(range);
      if (!value) {
        return null;
      }
      return {
        label: titleize(key),
        value,
      };
    })
    .filter((entry): entry is { label: string; value: string } => entry !== null);
}

// Build duration entries from SubstanceArticle DurationStages
function buildDurationEntries(stages: DurationStages | null | undefined): RouteInfo["duration"] {
  if (!stages) {
    return [];
  }

  const stageKeys: Array<[keyof DurationStages, string]> = [
    ["onset", "Onset"],
    ["come_up", "Come-up"],
    ["peak", "Peak"],
    ["offset", "Offset"],
    ["after_effects", "After effects"],
    ["total_duration", "Total"],
  ];

  return stageKeys
    .map(([key, label]) => {
      const stage = stages[key];
      const value = formatDurationStage(stage);
      if (!value) {
        return null;
      }
      return { label, value };
    })
    .filter((entry): entry is { label: string; value: string } => entry !== null);
}

// Find matching duration route for a dosage route
function findDurationRoute(
  durationRoutes: DurationRoute[] | undefined,
  routeLabel: string,
): DurationRoute | undefined {
  if (!durationRoutes || durationRoutes.length === 0) {
    return undefined;
  }

  const normalizedLabel = routeLabel.trim().toLowerCase();

  // Try direct match first
  const directMatch = durationRoutes.find((dr) => {
    const drRoute = cleanString(dr.route);
    return drRoute && drRoute.toLowerCase() === normalizedLabel;
  });

  if (directMatch) {
    return directMatch;
  }

  // Try canonical route matching
  const canonical = canonicalizeRouteLabel(routeLabel);
  for (const canonicalRoute of canonical.canonicalRoutes) {
    const match = durationRoutes.find((dr) => {
      const drRoute = cleanString(dr.route);
      return drRoute && drRoute.toLowerCase() === canonicalRoute.toLowerCase();
    });
    if (match) {
      return match;
    }
  }

  // Fall back to first route
  return durationRoutes[0];
}

// Build routes from SubstanceArticle dosage and duration
function buildRoutes(
  dosageRoutes: DosageRoute[] | undefined,
  durationRoutes: DurationRoute[] | undefined,
) {
  const routes: Record<RouteKey, RouteInfo> = {};
  const routeOrder: RouteKey[] = [];
  const units = new Set<string>();

  if (dosageRoutes && dosageRoutes.length > 0) {
    dosageRoutes.forEach((dosageRoute, index) => {
      const routeLabel = cleanString(dosageRoute.route);
      if (!routeLabel) {
        return;
      }

      const key = slugifyDrugName(routeLabel, `route-${index}`);
      const dosageEntries = buildDoseEntries(dosageRoute.dose_ranges);

      // Find matching duration for this route
      const matchingDuration = findDurationRoute(durationRoutes, routeLabel);
      const durationEntries = buildDurationEntries(matchingDuration?.stages);

      // Extract unit from dose ranges
      const firstRange = dosageRoute.dose_ranges?.threshold ||
                         dosageRoute.dose_ranges?.light ||
                         dosageRoute.dose_ranges?.moderate;
      const unit = cleanString(firstRange?.unit);
      if (unit) {
        units.add(unit);
      }

      routes[key] = {
        label: routeLabel,
        units: unit,
        dosage: dosageEntries,
        duration: durationEntries,
        bioavailability: cleanString(dosageRoute.bioavailability),
        notes: cleanString(dosageRoute.notes),
      };

      if (!routeOrder.includes(key)) {
        routeOrder.push(key);
      }
    });
  }

  // If no dosage routes but we have duration routes, create routes from duration
  if (routeOrder.length === 0 && durationRoutes && durationRoutes.length > 0) {
    durationRoutes.forEach((durationRoute, index) => {
      const routeLabel = cleanString(durationRoute.route) || "General";
      const key = slugifyDrugName(routeLabel, `route-${index}`);
      const durationEntries = buildDurationEntries(durationRoute.stages);

      if (durationEntries.length > 0) {
        routes[key] = {
          label: routeLabel,
          dosage: [],
          duration: durationEntries,
        };
        routeOrder.push(key);
      }
    });
  }

  const unitsNote = units.size > 0 ? `Units: ${Array.from(units).join(", ")}` : "";

  return {
    routes,
    routeOrder,
    note: unitsNote,
    unitsNote,
  };
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

function extractInteractionDetails(value: string): { base: string; rationale?: string } {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return { base: "" };
  }

  const trailingRationale = trimmed.match(/^(.*?)(?:\s*\(([^()]*)\)\s*)$/);
  if (!trailingRationale) {
    return { base: trimmed };
  }

  const base = trailingRationale[1]?.trim() ?? "";
  const rationale = trailingRationale[2]?.trim();
  if (base.length === 0) {
    return { base: trimmed };
  }

  return rationale && rationale.length > 0 ? { base, rationale } : { base };
}

function normalizeInteractionLabel(value: string): string {
  return value
    .replace(/[‒–—−]+/g, "-")
    .replace(/\s+/g, " ")
    .replace(/\s*([/,&])\s*/g, " $1 ")
    .trim();
}

function hashInteractionLabel(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

function buildInteractionItem(entry: string): InteractionTarget {
  const raw = entry.trim();
  const { base, rationale } = extractInteractionDetails(raw);
  const normalizedBase = normalizeInteractionLabel(base);
  const displayCandidate = normalizedBase.length > 0 ? normalizedBase : normalizeInteractionLabel(raw);
  const fallbackDisplay = displayCandidate.length > 0 ? displayCandidate : raw;

  let slug = slugify(displayCandidate);
  if (!slug) {
    slug = slugify(raw);
  }
  if (!slug) {
    slug = `interaction-${hashInteractionLabel(raw)}`;
  }

  return {
    raw,
    display: fallbackDisplay,
    slug,
    rationale: rationale && rationale.length > 0 ? rationale : undefined,
    matchType: "unknown",
  } satisfies InteractionTarget;
}

function buildInteractionGroups(interactions: Interactions | undefined): InteractionGroup[] {
  if (!interactions) {
    return [];
  }

  const severityOrder: InteractionSeverity[] = ["danger", "unsafe", "caution"];

  return severityOrder
    .map((severity) => {
      const listKey = severity === "danger" ? "dangerous" : severity;
      const rawItems = (interactions as Record<string, unknown>)[listKey];
      const items = cleanStringArray(rawItems).map((entry) => buildInteractionItem(entry));

      if (items.length === 0) {
        return null;
      }

      return {
        label: INTERACTION_LABELS[severity],
        severity,
        items,
      } satisfies InteractionGroup;
    })
    .filter((group): group is InteractionGroup => group !== null);
}

function buildToleranceEntries(tolerance: Tolerance | undefined): ToleranceEntry[] {
  if (!tolerance) {
    return [];
  }

  const entries: ToleranceEntry[] = [];

  const full = cleanString(tolerance.full_tolerance);
  if (full) {
    entries.push({ label: "Full tolerance", description: full });
  }

  const half = cleanString(tolerance.half_tolerance);
  if (half) {
    entries.push({ label: "Half tolerance", description: half });
  }

  const baseline = cleanString(tolerance.baseline_tolerance);
  if (baseline) {
    entries.push({ label: "Baseline reset", description: baseline });
  }

  const cross = cleanStringArray(tolerance.cross_tolerance);
  if (cross.length > 0) {
    entries.push({ label: "Cross tolerance", description: cross.map(titleize).join(", ") });
  }

  return entries;
}

function buildInfoSections(
  identification: Identification | undefined,
  classification: Classification | undefined,
  pharmacology: Pharmacology | undefined,
): InfoSection[] {
  const items: InfoSection["items"] = [];

  const substitutiveName = cleanString(identification?.substitutive_name);
  if (substitutiveName) {
    items.push({ label: "Substitutive name", value: substitutiveName, icon: Atom });
  }

  const iupacName = cleanString(identification?.iupac_name);
  if (iupacName) {
    items.push({ label: "IUPAC name", value: iupacName, icon: FlaskRound });
  }

  const chemicalClass = classification?.chemical_class?.join("; ");
  if (chemicalClass) {
    items.push({ label: "Chemical class", value: chemicalClass, icon: Hexagon });
  }

  // Mechanism of action from pharmacology (now an array)
  const mechanismArray = pharmacology?.mechanism_of_action;
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
      icon: Cog,
      chips,
    });
  }

  const psychoClass = classification?.psychoactive_class?.join("; ");
  if (psychoClass) {
    items.push({ label: "Psychoactive class", value: psychoClass, icon: BrainCircuit });
  }

  const halfLife = cleanString(pharmacology?.half_life);
  if (halfLife) {
    items.push({ label: "Half-life", value: halfLife, icon: TrendingDown });
  }

  if (items.length === 0) {
    return [];
  }

  return [
    {
      title: "Chemistry & Pharmacology",
      icon: BrainCog,
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

function buildCitations(citations: Citation[] | undefined): CitationEntry[] {
  if (!Array.isArray(citations)) {
    return [];
  }

  return citations
    .map((citation) => {
      const label = cleanString(citation.name);
      if (!label) {
        return null;
      }
      const href = cleanString(citation.url);
      return {
        label,
        href,
      };
    })
    .filter((entry): entry is CitationEntry => entry !== null);
}

function buildSourceCitations(sourceCitations: Citation[] | undefined): CitationEntry[] {
  if (!Array.isArray(sourceCitations)) {
    return [];
  }

  return sourceCitations
    .map((citation) => {
      const label = cleanString(citation.name);
      if (!label) {
        return null;
      }
      const href = cleanString(citation.url);
      return {
        label,
        href,
      };
    })
    .filter((entry): entry is CitationEntry => entry !== null);
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

// Flatten subjective effects from categorized structure to flat array
function flattenSubjectiveEffects(effects: SubjectiveEffects | undefined): string[] {
  if (!effects) {
    return [];
  }

  const allEffects: string[] = [];

  // Flatten sensory effects
  if (effects.sensory) {
    const sensory = effects.sensory;
    allEffects.push(...cleanStringArray(sensory.visual));
    allEffects.push(...cleanStringArray(sensory.auditory));
    allEffects.push(...cleanStringArray(sensory.tactile));
    allEffects.push(...cleanStringArray(sensory.olfactory));
    allEffects.push(...cleanStringArray(sensory.gustatory));
    allEffects.push(...cleanStringArray(sensory.multisensory));
  }

  // Add cognitive and physical effects
  allEffects.push(...cleanStringArray(effects.cognitive));
  allEffects.push(...cleanStringArray(effects.physical));

  return allEffects;
}

export function slugifyDrugName(name: string, fallback: string): string {
  const normalized = normalizeKey(name);
  if (normalized) {
    return normalized;
  }
  return normalizeKey(fallback) || "article";
}

export function buildSubstanceRecord(article: SubstanceArticle): SubstanceRecord | null {
  const identification = article.identification;
  const classification = article.classification;
  const pharmacology = article.pharmacology;
  const harmPotential = article.harm_potential;

  // Determine base name from identification
  const commonName = cleanString(identification?.common_name);
  const substitutiveName = cleanString(identification?.substitutive_name);
  const iupacName = cleanString(identification?.iupac_name);
  const titleName = cleanString(article.title);

  const candidateNames = [commonName, titleName, substitutiveName, iupacName].filter(
    (value): value is string => Boolean(value),
  );

  const preferredName = candidateNames.find((value) => !value.includes("("));
  const baseName = preferredName ?? candidateNames[0];
  if (!baseName) {
    return null;
  }

  const id = typeof article.id === "number" ? article.id : null;
  const slug = slugifyDrugName(baseName, id !== null ? `article-${id}` : baseName);

  // Categories derived from classification
  const psychoactiveClasses = cleanStringArray(classification?.psychoactive_class);
  const chemicalClasses = cleanStringArray(classification?.chemical_class);
  const categories = [...psychoactiveClasses, ...chemicalClasses];
  const normalizedCategories = categories.map((category) => normalizeKey(category));

  // Index categories from article
  const indexCategories = cleanStringArray(article.index_categories);
  const normalizedIndexCategories = indexCategories.map((value) => normalizeKey(value)).filter((value) => value.length > 0);
  const isHidden = normalizedIndexCategories.includes("hidden");

  const nameVariants = buildNameVariants(identification, baseName);
  const aliases = nameVariants.flatMap((variant) => variant.values);
  const referenceName = substitutiveName ?? iupacName ?? null;
  const displayAliases = referenceName
    ? aliases.filter(
        (alias) =>
          alias.localeCompare(referenceName, undefined, { sensitivity: "accent" }) !== 0,
      )
    : aliases;

  const { routes, routeOrder, note } = buildRoutes(
    article.dosage?.routes,
    article.duration?.routes,
  );

  // Get addiction summary from harm_potential
  const addictionSummary = cleanString(harmPotential?.addiction_liability) ?? "";

  // Flatten subjective effects
  const subjectiveEffects = flattenSubjectiveEffects(article.subjective_effects);

  const content: SubstanceContent = {
    name: baseName,
    subtitle: cleanString(article.summary) ?? "",
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
    interactions: buildInteractionGroups(article.interactions),
    tolerance: buildToleranceEntries(article.tolerance),
    reagentTesting: article.reagent_testing ?? {},
    notes: cleanString(article.summary) ?? "",
    sourceCitations: buildSourceCitations(article.source_citations),
    citations: buildCitations(article.citations),
    infoSections: buildInfoSections(identification, classification, pharmacology),
    categories,
  };

  if (id !== null) {
    const mappings = moleculeMappingByArticleId.get(id);
    if (mappings && mappings.length > 0) {
      const assets: MoleculeAsset[] = mappings.map((mapping) => {
        const encodedFilename = encodeURI(mapping.filename);
        const moleculeAsset: MoleculeAsset = {
          filename: mapping.filename,
          url: `/molecules/${encodedFilename}`,
          matchedField: mapping.matchedField,
          matchedValue: mapping.matchedValue,
        };

        if (mapping.resolution) {
          moleculeAsset.resolution = mapping.resolution;
        }

        if (Array.isArray(mapping.deduplicatedFrom) && mapping.deduplicatedFrom.length > 0) {
          moleculeAsset.deduplicatedFrom = mapping.deduplicatedFrom;
        }

        return moleculeAsset;
      });

      if (assets.length > 0) {
        [content.moleculeAsset] = assets;
        content.moleculeAssets = assets;
      }
    }
  }

  return {
    id,
    name: baseName,
    aliases,
    slug,
    categories,
    indexCategories,
    chemicalClasses,
    psychoactiveClasses,
    isHidden,
    content,
  };
}
