export const WARNING_BANNER_TONES = ["danger", "unsafe", "caution"] as const;

export type WarningBannerTone = (typeof WARNING_BANNER_TONES)[number];

export type WarningBannerPreset = {
  key: string;
  tone: WarningBannerTone;
  icon: string;
  severityLabel: string;
  headline: string;
  points: string[];
  enabled: boolean;
  allSubstances?: boolean;
  enabledSlugs: string[];
};

export const MAX_BANNERS_PER_ARTICLE = 2;

export const MAX_ENABLED_SLUGS = 250;

export const CITATION_OVERHAUL_BANNER_KEY_PREFIX = "citation-system-overhaul";

export const WARNING_BANNER_KEY_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

export const WARNING_BANNER_ICON_PATTERN =
  /^(?:custom:[a-z0-9-]+|[a-z0-9]+(?:-[a-z0-9]+)*:[a-z0-9]+(?:-[a-z0-9]+)*)$/;

export const WARNING_BANNER_LIMITS = {
  iconMaxLength: 64,
  severityLabelMaxLength: 40,
  headlineMaxLength: 120,
  pointMaxLength: 400,
  maxPoints: 8,
  slugMaxLength: 120,
  maxEnabledSlugs: MAX_ENABLED_SLUGS,
} as const;

export const SAFETY_BANNER_ICON_SIZE_DEFAULT = 44;

export const SAFETY_BANNER_ICON_SIZE_MIN = 24;

export const SAFETY_BANNER_ICON_SIZE_MAX = 72;

export function clampSafetyBannerIconSize(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return SAFETY_BANNER_ICON_SIZE_DEFAULT;
  }

  const rounded = Math.round(value);
  if (rounded < SAFETY_BANNER_ICON_SIZE_MIN) {
    return SAFETY_BANNER_ICON_SIZE_MIN;
  }
  if (rounded > SAFETY_BANNER_ICON_SIZE_MAX) {
    return SAFETY_BANNER_ICON_SIZE_MAX;
  }
  return rounded;
}

export function isWarningBannerTone(value: unknown): value is WarningBannerTone {
  return typeof value === "string" && (WARNING_BANNER_TONES as readonly string[]).includes(value);
}

function normalizeClassToken(value: string): string {
  return value
    .replace(/\s*\([^)]*\)/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

type ClassSource = {
  psychoactiveClasses?: readonly unknown[] | null;
  chemicalClasses?: readonly unknown[] | null;
  indexCategories?: readonly unknown[] | null;
};

export function substanceClassValues(source: ClassSource): string[] {
  const values = [
    ...(source.psychoactiveClasses ?? []),
    ...(source.chemicalClasses ?? []),
    ...(source.indexCategories ?? []),
  ].filter((value): value is string => typeof value === "string" && value.trim().length > 0);

  const seen = new Set<string>();
  const unique: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    const fingerprint = trimmed.toLowerCase();
    if (!seen.has(fingerprint)) {
      seen.add(fingerprint);
      unique.push(trimmed);
    }
  }
  return unique;
}

export function classSourceFromSubstanceDocument(document: {
  classification?: unknown;
  index_categories?: unknown;
}): ClassSource {
  const classification =
    typeof document.classification === "object" && document.classification !== null
      ? (document.classification as Record<string, unknown>)
      : {};

  return {
    psychoactiveClasses: Array.isArray(classification.psychoactive_class)
      ? classification.psychoactive_class
      : [],
    chemicalClasses: Array.isArray(classification.chemical_class)
      ? classification.chemical_class
      : [],
    indexCategories: Array.isArray(document.index_categories) ? document.index_categories : [],
  };
}

export type WarningBannerTarget = {
  slug: string;
  title: string;
  classes: string[];
};

export type WarningBannerTargetMatch = WarningBannerTarget & {
  kind: "name" | "class";
  reason: string;
};

export function searchWarningBannerTargets(
  query: string,
  targets: readonly WarningBannerTarget[],
  limit = 60,
): WarningBannerTargetMatch[] {
  const needle = normalizeClassToken(query);
  if (needle.length < 2) {
    return [];
  }

  const byName: WarningBannerTargetMatch[] = [];
  const byClass: WarningBannerTargetMatch[] = [];

  for (const target of targets) {
    if (target.slug.includes(needle) || normalizeClassToken(target.title).includes(needle)) {
      byName.push({ ...target, kind: "name", reason: target.title });
      continue;
    }
    const hit = target.classes.find(
      (value) =>
        normalizeClassToken(value).includes(needle) || value.toLowerCase().includes(needle),
    );
    if (hit) {
      byClass.push({ ...target, kind: "class", reason: hit });
    }
  }

  byName.sort((a, b) => a.title.localeCompare(b.title));
  byClass.sort((a, b) => a.title.localeCompare(b.title));
  return [...byName, ...byClass].slice(0, limit);
}

export function compareWarningBanners(a: WarningBannerPreset, b: WarningBannerPreset): number {
  const toneDelta = WARNING_BANNER_TONES.indexOf(a.tone) - WARNING_BANNER_TONES.indexOf(b.tone);
  return toneDelta !== 0 ? toneDelta : a.key.localeCompare(b.key);
}

export function presetAppliesToSlug(
  preset: Pick<WarningBannerPreset, "enabled" | "allSubstances" | "enabledSlugs">,
  slug: string,
): boolean {
  const target = slug.trim().toLowerCase();
  return Boolean(
    target &&
      preset.enabled &&
      (preset.allSubstances || preset.enabledSlugs.includes(target)),
  );
}

export function resolveEnabledBanners(
  presets: readonly WarningBannerPreset[],
  slug: string,
): WarningBannerPreset[] {
  return matchingPresets(presets, slug).slice(0, MAX_BANNERS_PER_ARTICLE);
}

export function resolveArticleBanners(
  presets: readonly WarningBannerPreset[],
  slug: string,
  { showBetaDisclaimer }: { showBetaDisclaimer: boolean },
): WarningBannerPreset[] {
  return resolveEnabledBanners(
    showBetaDisclaimer
      ? presets.filter((preset) => !preset.key.startsWith(CITATION_OVERHAUL_BANNER_KEY_PREFIX))
      : presets,
    slug,
  );
}

export function resolveSuppressedBanners(
  presets: readonly WarningBannerPreset[],
  slug: string,
): WarningBannerPreset[] {
  return matchingPresets(presets, slug).slice(MAX_BANNERS_PER_ARTICLE);
}

function matchingPresets(
  presets: readonly WarningBannerPreset[],
  slug: string,
): WarningBannerPreset[] {
  return presets.filter((preset) => presetAppliesToSlug(preset, slug)).sort(compareWarningBanners);
}

export type WarningBannerPresetState = "live" | "dormant" | "off";

export function warningBannerPresetState(
  preset: Pick<WarningBannerPreset, "enabled" | "allSubstances" | "enabledSlugs">,
): WarningBannerPresetState {
  if (!preset.enabled) {
    return "off";
  }
  return preset.allSubstances || preset.enabledSlugs.length > 0 ? "live" : "dormant";
}

export function normalizeEnabledSlugs(slugs: readonly string[]): string[] {
  const seen = new Set<string>();
  for (const slug of slugs) {
    const value = slug.trim().toLowerCase();
    if (value) {
      seen.add(value);
    }
  }
  return [...seen].sort();
}

export const WARNING_BANNER_ICON_SUGGESTIONS: readonly { icon: string; hint: string }[] = [
  { icon: "lucide:wind", hint: "Respiratory depression" },
  { icon: "lucide:skull", hint: "Overdose, lethality" },
  { icon: "lucide:activity", hint: "Seizures, withdrawal" },
  { icon: "lucide:eye", hint: "Delirium, hallucination" },
  { icon: "lucide:octagon-alert", hint: "Narrow margin" },
  { icon: "lucide:triangle-alert", hint: "General caution" },
  { icon: "lucide:hospital", hint: "Needs medical care" },
  { icon: "lucide:brain", hint: "Psychosis, neurotoxicity" },
  { icon: "lucide:thermometer", hint: "Hyperthermia" },
  { icon: "lucide:heart-pulse", hint: "Cardiac risk" },
];

export type WarningBannerBlock =
  | { kind: "paragraph"; text: string }
  | { kind: "list"; items: string[] };

const LIST_MARKER = /^\s*[-*]\s+/;

const MARKER_ONLY = /^[-*]\s*$/;

export function toWarningBannerBlocks(points: readonly string[]): WarningBannerBlock[] {
  const blocks: WarningBannerBlock[] = [];

  for (const point of points) {
    const text = point.trim();
    if (!text || MARKER_ONLY.test(text)) {
      continue;
    }

    if (!LIST_MARKER.test(text)) {
      blocks.push({ kind: "paragraph", text });
      continue;
    }

    const item = text.replace(LIST_MARKER, "").trim();
    if (!item) {
      continue;
    }

    const previous = blocks[blocks.length - 1];
    if (previous?.kind === "list") {
      previous.items.push(item);
    } else {
      blocks.push({ kind: "list", items: [item] });
    }
  }

  return blocks;
}
