/**
 * Transforms raw KnowDrugs article entries into the normalized structures
 * consumed by the UI. The source JSON ships fields like `drug_info`,
 * `dosages.routes_of_administration`, and `subjective_effects` that we
 * restructure into `SubstanceContent` for components.
 */
import { BrainCircuit, BrainCog, Cog, Hexagon, Timer } from "lucide-react";

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
} from "../types/content";
import { slugify } from "../utils/slug";
import { tokenizeTagString } from "../utils/tagDelimiters";
import { getCategoryIcon } from "./categoryIcons";
import { canonicalizeRouteLabel } from "./routeSynonyms";

interface RawDoseRanges {
  [key: string]: string | null | undefined;
}

interface RawRouteDefinition {
  route?: string;
  units?: string;
  dose_ranges?: RawDoseRanges;
}

interface RawDosages {
  routes_of_administration?: RawRouteDefinition[];
}

interface LegacyDurationStages {
  total_duration?: string | null;
  onset?: string | null;
  comeup?: string | null;
  peak?: string | null;
  offset?: string | null;
  comedown?: string | null;
  after_effects?: string | null;
}

interface StructuredDurationRoute {
  route?: string | null;
  canonical_routes?: string[] | null;
  stages?: LegacyDurationStages | null;
}

interface StructuredDuration {
  general?: LegacyDurationStages | null;
  routes_of_administration?: StructuredDurationRoute[] | null;
}

type RawDuration = LegacyDurationStages | StructuredDuration;

interface RawInteractions {
  dangerous?: string[];
  unsafe?: string[];
  caution?: string[];
}

interface RawTolerance {
  full_tolerance?: string | null;
  half_tolerance?: string | null;
  zero_tolerance?: string | null;
  cross_tolerances?: string[];
}

interface RawCitation {
  name?: string | null;
  reference?: string | null;
}

interface RawDrugInfo {
  drug_name?: string | null;
  chemical_name?: string | null;
  alternative_name?: string | null;
  chemical_class?: string | null;
  psychoactive_class?: string | null;
  dosages?: RawDosages;
  duration?: RawDuration;
  addiction_potential?: string | null;
  interactions?: RawInteractions;
  notes?: string | null;
  subjective_effects?: string[];
  tolerance?: RawTolerance;
  half_life?: string | null;
  mechanism_of_action?: string | null;
  citations?: RawCitation[];
  categories?: string[];
}

interface RawArticle {
  id?: number;
  title?: string | null;
  drug_info?: RawDrugInfo;
  "index-category"?: string | null;
}

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
  total_duration: "Total duration",
  onset: "Onset",
  comeup: "Come-up",
  peak: "Peak",
  offset: "Offset",
  comedown: "Come-down",
  after_effects: "After effects",
};

type DurationStageKey = keyof typeof DURATION_LABELS;
type StageValueMap = Partial<Record<DurationStageKey, string>>;

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

function splitToList(value: string | null | undefined): string[] {
  const cleaned = cleanString(value);
  if (!cleaned) {
    return [];
  }
  return tokenizeTagString(cleaned, { splitOnComma: true, splitOnSlash: true });
}

function buildDoseEntries(ranges?: RawDoseRanges): RouteInfo["dosage"] {
  if (!ranges) {
    return [];
  }

  return Object.entries(ranges)
    .map(([key, rawValue]) => {
      const value = cleanString(rawValue);
      if (!value) {
        return null;
      }
      const label = titleize(key);
      return {
        label,
        value,
      };
    })
    .filter((entry): entry is RouteInfo["dosage"][number] => entry !== null);
}

function isStructuredDurationValue(duration?: RawDuration): duration is StructuredDuration {
  if (!duration || typeof duration !== "object") {
    return false;
  }
  return (
    Object.prototype.hasOwnProperty.call(duration, "general") ||
    Object.prototype.hasOwnProperty.call(duration, "routes_of_administration")
  );
}

function extractStageValues(source?: LegacyDurationStages | null): StageValueMap {
  const values: StageValueMap = {};
  if (!source || typeof source !== "object") {
    return values;
  }

  (Object.keys(DURATION_LABELS) as DurationStageKey[]).forEach((stageKey) => {
    const raw = (source as Record<string, unknown>)[stageKey];
    const value = cleanString(typeof raw === "string" ? raw : null);
    if (value) {
      values[stageKey] = value;
    }
  });

  return values;
}

function hasStageValues(map: StageValueMap): boolean {
  return Object.keys(map).some((stageKey) => Boolean(map[stageKey as DurationStageKey]));
}

function mergeStageMaps(primary: StageValueMap, fallback: StageValueMap): StageValueMap {
  const merged: StageValueMap = {};
  (Object.keys(DURATION_LABELS) as DurationStageKey[]).forEach((stageKey) => {
    const value = primary[stageKey] ?? fallback[stageKey];
    if (value) {
      merged[stageKey] = value;
    }
  });
  return merged;
}

function convertStageMapToEntries(stageMap: StageValueMap): RouteInfo["duration"] {
  return (Object.entries(DURATION_LABELS) as Array<[DurationStageKey, string]>)
    .map(([stageKey, label]) => {
      const value = stageMap[stageKey];
      if (!value) {
        return null;
      }
      return {
        label,
        value,
      };
    })
    .filter((entry): entry is RouteInfo["duration"][number] => entry !== null);
}

function getRouteStageMap(
  duration: StructuredDuration | undefined,
  routeLabel: string,
  canonicalRoutes: string[],
): StageValueMap {
  if (!duration || !Array.isArray(duration.routes_of_administration)) {
    return {};
  }

  const normalizedLabel = routeLabel.trim().toLowerCase();
  const entries = duration.routes_of_administration.filter((entry): entry is StructuredDurationRoute => Boolean(entry));

  const directMatch = entries.find((entry) => {
    if (!entry || typeof entry.route !== "string") {
      return false;
    }
    return entry.route.trim().toLowerCase() === normalizedLabel;
  });

  if (directMatch) {
    return extractStageValues(directMatch.stages ?? null);
  }

  for (const canonical of canonicalRoutes) {
    const match = entries.find((entry) =>
      Array.isArray(entry.canonical_routes) &&
      entry.canonical_routes.some((candidate) =>
        typeof candidate === "string" && candidate.trim().toLowerCase() === canonical,
      ),
    );
    if (match) {
      return extractStageValues(match.stages ?? null);
    }
  }

  return {};
}

function selectFallbackStageMap(
  structuredDuration: StructuredDuration | undefined,
  generalStages: StageValueMap,
): StageValueMap {
  if (hasStageValues(generalStages)) {
    return generalStages;
  }

  if (!structuredDuration || !Array.isArray(structuredDuration.routes_of_administration)) {
    return generalStages;
  }

  for (const entry of structuredDuration.routes_of_administration) {
    const stageMap = extractStageValues(entry?.stages ?? null);
    if (hasStageValues(stageMap)) {
      return stageMap;
    }
  }

  return generalStages;
}

function buildUnitsNote(units: Set<string>): string {
  if (units.size === 0) {
    return "";
  }
  const entries = Array.from(units);
  return `Units: ${entries.join(", ")}`;
}

function buildRoutes(dosages: RawDosages | undefined, duration: RawDuration | undefined) {
  const routes: Record<RouteKey, RouteInfo> = {};
  const routeOrder: RouteKey[] = [];
  const units = new Set<string>();

  const structuredDuration = isStructuredDurationValue(duration) ? duration : undefined;
  const generalStageMap = structuredDuration
    ? extractStageValues(structuredDuration.general ?? null)
    : extractStageValues(duration as LegacyDurationStages | undefined);

  (dosages?.routes_of_administration ?? []).forEach((definition, index) => {
    const routeLabel = cleanString(definition.route);
    if (!routeLabel) {
      return;
    }

    const canonical = canonicalizeRouteLabel(routeLabel);
    const routeSpecificStageMap = structuredDuration
      ? getRouteStageMap(structuredDuration, routeLabel, canonical.canonicalRoutes)
      : {};

    const mergedStageMap = mergeStageMaps(routeSpecificStageMap, generalStageMap);
    const durationEntries = convertStageMapToEntries(mergedStageMap);

    const key = slugifyDrugName(routeLabel, `route-${index}`);
    const dosageEntries = buildDoseEntries(definition.dose_ranges);
    const unit = cleanString(definition.units);
    if (unit) {
      units.add(unit);
    }

    routes[key] = {
      label: routeLabel,
      units: unit,
      dosage: dosageEntries,
      duration: durationEntries,
    };

    if (!routeOrder.includes(key)) {
      routeOrder.push(key);
    }
  });

  if (routeOrder.length === 0) {
    const fallbackMap = selectFallbackStageMap(structuredDuration, generalStageMap);
    const fallbackEntries = convertStageMapToEntries(fallbackMap);
    if (fallbackEntries.length > 0) {
      const fallbackKey: RouteKey = "general";
      routes[fallbackKey] = {
        label: "General",
        dosage: [],
        duration: fallbackEntries,
      };
      routeOrder.push(fallbackKey);
    }
  }

  return {
    routes,
    routeOrder,
    unitsNote: buildUnitsNote(units),
  };
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
    hash |= 0; // Convert to 32bit integer
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

function buildInteractionGroups(interactions?: RawInteractions): InteractionGroup[] {
  if (!interactions) {
    return [];
  }

  const severityOrder: InteractionSeverity[] = ["danger", "unsafe", "caution"];

  return severityOrder
    .map((severity) => {
      const listKey = severity === "danger" ? "dangerous" : severity;
      const items = cleanStringArray((interactions as Record<string, unknown>)[listKey]).map((entry) =>
        buildInteractionItem(entry),
      );

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

function buildToleranceEntries(tolerance?: RawTolerance): ToleranceEntry[] {
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

  const zero = cleanString(tolerance.zero_tolerance);
  if (zero) {
    entries.push({ label: "Baseline reset", description: zero });
  }

  const cross = cleanStringArray(tolerance.cross_tolerances);
  if (cross.length > 0) {
    entries.push({ label: "Cross tolerance", description: cross.map(titleize).join(", ") });
  }

  return entries;
}

function buildInfoSections(info: RawDrugInfo): InfoSection[] {
  const items: InfoSection["items"] = [];

  const chemicalClass = cleanString(info.chemical_class);
  if (chemicalClass) {
    items.push({ label: "Chemical class", value: chemicalClass, icon: Hexagon });
  }

  const mechanism = cleanString(info.mechanism_of_action);
  if (mechanism) {
    const entries = mechanism
      .split(";")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);

    const seen = new Set<string>();
    const chips: InfoSectionItemChip[] = [];

    entries.forEach((entry) => {
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

  const psychoClass = cleanString(info.psychoactive_class);
  if (psychoClass) {
    items.push({ label: "Psychoactive class", value: psychoClass, icon: BrainCircuit });
  }

  const halfLife = cleanString(info.half_life);
  if (halfLife) {
    items.push({ label: "Half-life", value: halfLife, icon: Timer });
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

function buildHeroBadges(info: RawDrugInfo, categories: string[], normalizedKeys: string[]): HeroBadge[] {
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
function buildCitations(citations?: RawCitation[]): CitationEntry[] {
  if (!Array.isArray(citations)) {
    return [];
  }

  return citations
    .map((citation) => {
      const label = cleanString(citation.name);
      if (!label) {
        return null;
      }
      const href = cleanString(citation.reference);
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

function splitAlternativeValues(value: string): string[] {
  const trimmed = value.trim();
  if (!trimmed) {
    return [];
  }

  const primarySegments = trimmed
    .split(";")
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);

  const expanded: string[] = [];

  primarySegments.forEach((segment) => {
    if (segment.includes(" / ")) {
      segment
        .split("/")
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0)
        .forEach((entry) => expanded.push(entry));
      return;
    }

    expanded.push(segment);
  });

  return expanded;
}

function extractAlternativeNames(info: RawDrugInfo, baseName: string): string[] {
  const names: string[] = [];
  const seen = new Set<string>();

  const addName = (raw?: string | null) => {
    const cleaned = cleanString(raw);
    if (!cleaned) {
      return;
    }

    if (cleaned.localeCompare(baseName, undefined, { sensitivity: "accent" }) === 0) {
      return;
    }

    const key = cleaned.toLocaleLowerCase("en-US");
    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    names.push(cleaned);
  };

  const alternativeRaw = cleanString(info.alternative_name);
  if (alternativeRaw) {
    const parts = splitAlternativeValues(alternativeRaw);
    if (parts.length > 0) {
      parts.forEach((part) => addName(part));
    } else {
      addName(alternativeRaw);
    }
  }

  addName(info.chemical_name);

  return names;
}

export function slugifyDrugName(name: string, fallback: string): string {
  const normalized = normalizeKey(name);
  if (normalized) {
    return normalized;
  }
  return normalizeKey(fallback) || "article";
}

export function buildSubstanceRecord(article: RawArticle): SubstanceRecord | null {
  const info = article.drug_info;
  if (!info) {
    return null;
  }

  const chemicalName = cleanString(info.chemical_name);
  const drugName = cleanString(info.drug_name);
  const titleName = cleanString(article.title);

  const candidateNames = [drugName, titleName, chemicalName].filter(
    (value): value is string => Boolean(value),
  );

  const preferredName = candidateNames.find((value) => !value.includes("("));
  const baseName = preferredName ?? candidateNames[0];
  if (!baseName) {
    return null;
  }

  const id = typeof article.id === "number" ? article.id : null;
  const slug = slugifyDrugName(baseName, id !== null ? `article-${id}` : baseName);

  const categories = cleanStringArray(info.categories);
  const normalizedCategories = categories.map((category) => normalizeKey(category));
  const rawIndexCategory = cleanString(article["index-category"]) ?? "";
  const indexCategories = rawIndexCategory
    ? tokenizeTagString(rawIndexCategory, { splitOnComma: false, splitOnSlash: true })
    : [];
  const normalizedIndexCategories = indexCategories.map((value) => normalizeKey(value)).filter((value) => value.length > 0);
  const isHidden = normalizedIndexCategories.includes("hidden");
  const chemicalClasses = splitToList(info.chemical_class);
  const psychoactiveClasses = splitToList(info.psychoactive_class);
  const aliases = extractAlternativeNames(info, baseName);

  const { routes, routeOrder, unitsNote } = buildRoutes(info.dosages, info.duration);

  const content: SubstanceContent = {
    name: baseName,
    subtitle: "",
    aliases,
    moleculePlaceholder: buildPlaceholder(baseName),
    heroBadges: buildHeroBadges(info, categories, normalizedCategories),
    categoryKeys: normalizedCategories,
    dosageUnitsNote: unitsNote,
    routes,
    routeOrder,
    addictionSummary: cleanString(info.addiction_potential) ?? "",
    subjectiveEffects: cleanStringArray(info.subjective_effects),
    interactions: buildInteractionGroups(info.interactions),
    tolerance: buildToleranceEntries(info.tolerance),
    notes: cleanString(info.notes) ?? "",
    citations: buildCitations(info.citations),
    infoSections: buildInfoSections(info),
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
    isHidden,
    content,
  };
}


