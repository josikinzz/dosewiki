/**
 * Transforms raw KnowDrugs article entries into the normalized structures
 * consumed by the UI. The source JSON ships fields like `drug_info`,
 * `dosages.routes_of_administration`, and `subjective_effects` that we
 * restructure into `SubstanceContent` for components.
 */
import {
  Layers,
  Sparkles,
  Waves,
  AlertTriangle,
  Flower,
  Zap,
  Syringe,
  Dumbbell,
  SmilePlus,
  Brain,
  Beaker,
  BedDouble,
  Moon,
  Leaf,
  BrainCircuit,
  Pill,
  Sprout,
  Eye,
  Timer,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import type {
  SubstanceContent,
  RouteInfo,
  RouteKey,
  HeroBadge,
  InteractionGroup,
  ToleranceEntry,
  InfoSection,
  CitationEntry,
} from "../types/content";
import { slugify } from "../utils/slug";

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

interface RawDuration {
  total_duration?: string | null;
  onset?: string | null;
  comeup?: string | null;
  peak?: string | null;
  offset?: string | null;
  comedown?: string | null;
  after_effects?: string | null;
}

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
  search_url?: string | null;
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
  content?: string | null;
  drug_info?: RawDrugInfo;
}

export interface SubstanceRecord {
  id: number | null;
  name: string;
  slug: string;
  categories: string[];
  chemicalClasses: string[];
  psychoactiveClasses: string[];
  content: SubstanceContent;
  searchUrl?: string;
}

type InteractionSeverity = InteractionGroup["severity"];

type NonEmptyString = string & { __brand: "NonEmptyString" };

const CATEGORY_ICON_MAP: Record<string, LucideIcon> = {
  psychedelic: Sparkles,
  psychedelics: Sparkles,
  dissociative: Waves,
  dissociatives: Waves,
  deliriant: AlertTriangle,
  deliriants: AlertTriangle,
  entactogen: Flower,
  entactogens: Flower,
  empathogen: Flower,
  empathogens: Flower,
  stimulant: Zap,
  stimulants: Zap,
  opioid: Syringe,
  opioids: Syringe,
  "anabolic-steroid": Dumbbell,
  "anabolic steroids": Dumbbell,
  antidepressant: SmilePlus,
  antidepressants: SmilePlus,
  antipsychotic: Brain,
  antipsychotics: Brain,
  barbiturate: Beaker,
  barbiturates: Beaker,
  benzodiazepine: Pill,
  benzodiazepines: Pill,
  sedative: BedDouble,
  sedatives: BedDouble,
  depressant: Moon,
  depressants: Moon,
  cannabinoid: Leaf,
  cannabinoids: Leaf,
  nootropic: BrainCircuit,
  nootropics: BrainCircuit,
  supplement: Sprout,
  supplements: Sprout,
  hallucinogen: Eye,
  hallucinogens: Eye,
  "a-typical hallucinogen": Eye,
  "a-typical hallucinogens": Eye,
  "atypical hallucinogen": Eye,
  "atypical hallucinogens": Eye,
  other: Layers,
};

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

function splitToList(value: string | null | undefined): string[] {
  const cleaned = cleanString(value);
  if (!cleaned) {
    return [];
  }
  return cleaned
    .split(/[;,/]/)
    .map((segment) => segment.trim())
    .filter(Boolean);
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

function buildDurationEntries(duration?: RawDuration): RouteInfo["duration"] {
  if (!duration) {
    return [];
  }

  return Object.entries(DURATION_LABELS)
    .map(([key, label]) => {
      const value = cleanString(duration[key as keyof RawDuration]);
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
  const durationEntries = buildDurationEntries(duration);

  (dosages?.routes_of_administration ?? []).forEach((definition, index) => {
    const routeLabel = cleanString(definition.route);
    if (!routeLabel) {
      return;
    }

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

  if (routeOrder.length === 0 && durationEntries.length > 0) {
    const fallbackKey: RouteKey = "general";
    routes[fallbackKey] = {
      label: "General",
      dosage: [],
      duration: durationEntries,
    };
    routeOrder.push(fallbackKey);
  }

  return {
    routes,
    routeOrder,
    unitsNote: buildUnitsNote(units),
  };
}

function buildInteractionGroups(interactions?: RawInteractions): InteractionGroup[] {
  if (!interactions) {
    return [];
  }

  const severityOrder: InteractionSeverity[] = ["danger", "unsafe", "caution"];

  return severityOrder
    .map((severity) => {
      const listKey = severity === "danger" ? "dangerous" : severity;
      const items = cleanStringArray((interactions as Record<string, unknown>)[listKey]);
      if (items.length === 0) {
        return null;
      }

      return {
        label: INTERACTION_LABELS[severity],
        severity,
        substances: items.map((entry) => titleize(entry)),
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
    items.push({ label: "Chemical class", value: chemicalClass, icon: Beaker });
  }

  const mechanism = cleanString(info.mechanism_of_action);
  if (mechanism) {
    const entries = mechanism
      .split(";")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
    const chips = entries
      .map((entry) => ({ label: entry, slug: slugify(entry) }))
      .filter((chip) => chip.slug.length > 0);

    items.push({
      label: "Mechanism of Action",
      value: mechanism,
      icon: Brain,
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
      icon: Beaker,
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

    const icon = CATEGORY_ICON_MAP[normalized] ?? Layers;
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

  const baseName = cleanString(info.drug_name) ?? cleanString(article.title);
  if (!baseName) {
    return null;
  }

  const id = typeof article.id === "number" ? article.id : null;
  const slug = slugifyDrugName(baseName, id !== null ? `article-${id}` : baseName);

  const categories = cleanStringArray(info.categories);
  const normalizedCategories = categories.map((category) => normalizeKey(category));
  const chemicalClasses = splitToList(info.chemical_class);
  const psychoactiveClasses = splitToList(info.psychoactive_class);

  const { routes, routeOrder, unitsNote } = buildRoutes(info.dosages, info.duration);

  const content: SubstanceContent = {
    name: baseName,
    subtitle: [cleanString(info.chemical_class), cleanString(info.psychoactive_class)]
      .filter((segment): segment is string => Boolean(segment))
      .join(" Â· "),
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
    searchUrl: cleanString(info.search_url),
  };

  return {
    id,
    name: baseName,
    slug,
    categories,
    chemicalClasses,
    psychoactiveClasses,
    content,
    searchUrl: content.searchUrl,
  };
}


