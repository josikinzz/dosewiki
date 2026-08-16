/**
 * Drug-class safety banners: the pure rules, shared by the Convex module, the
 * `/dev` Banner Studio, and the public article.
 *
 * The one invariant this file exists to enforce: **a banner is opt-in.** It
 * renders on a substance if and only if an editor switched its preset on and
 * named that substance. `resolveEnabledBanners` therefore takes a slug and
 * nothing else — it has no access to a substance's classification, so no
 * amount of future editing can quietly turn class matching back into an
 * assignment rule.
 *
 * `candidateMatchers` and `matcherHits` are the Studio's suggestion machinery.
 * They exist because free-form class strings are useful for *finding* articles
 * an editor should look at, and useless for deciding what a reader sees:
 * cocaine carries `chemical_class: "Alkaloid (tropane)"` and would match a
 * deliriant rule; DXM is a `"Morphinan (substituted)"` and would match an
 * opioid rule. Both are wrong, and neither is fixable by a better matcher.
 *
 * Keep this module free of server-only imports: the Studio imports it in the
 * browser and `convex/warningBanners.ts` imports it on the server.
 */

export const WARNING_BANNER_TONES = ["danger", "unsafe", "caution"] as const;

export type WarningBannerTone = (typeof WARNING_BANNER_TONES)[number];

/**
 * Anchor targets a banner link may point at. The *target* is constrained but the
 * link's *label* is free text (see `WarningBannerLink`): a banner must never be a
 * dead end, so the anchor has to resolve to a section the article actually
 * renders, while the wording stays the editor's to choose.
 */
export const WARNING_BANNER_LINK_SECTIONS = [
  "dosage",
  "duration",
  "interactions",
  "harm-potential",
  "pharmacology",
  "tolerance",
] as const;

export type WarningBannerLinkSection = (typeof WARNING_BANNER_LINK_SECTIONS)[number];

/** Suggested wording only. The editor overwrites `label` freely. */
export const WARNING_BANNER_SECTION_LABELS: Record<WarningBannerLinkSection, string> = {
  dosage: "Dosage",
  duration: "Duration",
  interactions: "Interactions",
  "harm-potential": "Harm potential",
  pharmacology: "Pharmacology",
  tolerance: "Tolerance",
};

export type WarningBannerLink = {
  /** Exact chip text. Editor-authored; never derived from `sectionId`. */
  label: string;
  sectionId: WarningBannerLinkSection;
};

/**
 * Every string and glyph a reader sees is a stored field on this object. Nothing
 * visible is derived, defaulted at render time, or looked up from a table in
 * code — an editor who wants different words or a different glyph edits the
 * preset, and does not need a deploy.
 */
export type WarningBannerPreset = {
  key: string;
  /** Studio-facing name. Never rendered publicly. */
  label: string;
  tone: WarningBannerTone;
  /** Any Iconify id (`lucide:wind`, `mdi:skull`) or a `custom:` key. Editable. */
  icon: string;
  /** Short gutter label, e.g. "Fatal combination". Editable, rendered uppercase. */
  severityLabel: string;
  headline: string;
  points: string[];
  links: WarningBannerLink[];
  priority: number;
  /** Master switch. False means this preset renders nowhere. */
  enabled: boolean;
  /** Explicit opt-in. Empty means this preset renders nowhere. */
  enabledSlugs: string[];
  /** Studio-only suggestion input. Never consulted when rendering. */
  candidateMatchers: string[];
};

export function isWarningBannerLinkSection(value: unknown): value is WarningBannerLinkSection {
  return (
    typeof value === "string" &&
    (WARNING_BANNER_LINK_SECTIONS as readonly string[]).includes(value)
  );
}

/**
 * Two is a layout budget, not a safety opinion. Three stacked danger banners
 * push the article H1 below the fold on a phone, which costs more than the
 * third warning gains. The Studio surfaces what the cap suppressed.
 */
export const MAX_BANNERS_PER_ARTICLE = 2;

/** Matches `MAX_GALLERY_CURATION_SLUGS` in `convex/substanceGalleries.ts`. */
export const MAX_ENABLED_SLUGS = 250;

export const WARNING_BANNER_KEY_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

/**
 * Any Iconify id (`collection:name`) or one of this repo's `custom:` glyphs.
 * Deliberately permissive about the collection — `@iconify/react` resolves every
 * collection lazily from the Iconify API, so restricting editors to `lucide:`
 * would be an arbitrary limit with no technical cause. The Studio validates a
 * typed id against the API before it can be saved, because an unknown id fails
 * silently: `Icon` renders nothing at all, which on a safety banner would be an
 * invisible regression.
 */
export const WARNING_BANNER_ICON_PATTERN = /^(?:custom:[a-z0-9-]+|[a-z0-9]+(?:-[a-z0-9]+)*:[a-z0-9]+(?:-[a-z0-9]+)*)$/;

export const WARNING_BANNER_LIMITS = {
  labelMaxLength: 120,
  iconMaxLength: 64,
  severityLabelMaxLength: 40,
  headlineMaxLength: 120,
  pointMaxLength: 400,
  maxPoints: 8,
  matcherMaxLength: 64,
  maxMatchers: 24,
  linkLabelMaxLength: 40,
  maxLinks: 4,
  slugMaxLength: 120,
  maxEnabledSlugs: MAX_ENABLED_SLUGS,
} as const;

export function isWarningBannerTone(value: unknown): value is WarningBannerTone {
  return typeof value === "string" && (WARNING_BANNER_TONES as readonly string[]).includes(value);
}

/**
 * Class-string normalization: drop parenthetical qualifiers, collapse
 * whitespace, lower-case. Mirrors `getIconKeyFromClass` in
 * `src/features/article/components/sections/HeroSection.tsx` so
 * `"Phenethylamine (N-benzylated)"` and `"Phenethylamine"` compare equal.
 */
export function normalizeClassToken(value: string): string {
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

/**
 * Every string a matcher may be tested against, both paren-stripped and raw,
 * so a matcher can target either `alkaloid` or `alkaloid (tropane)`.
 *
 * Defensive by design: Convex stores `classification` as `v.any()`, so the
 * Studio receives whatever is in the document rather than a parsed shape.
 */
export function substanceClassTokens(source: ClassSource): string[] {
  const raw = [
    ...(source.psychoactiveClasses ?? []),
    ...(source.chemicalClasses ?? []),
    ...(source.indexCategories ?? []),
  ].filter((value): value is string => typeof value === "string" && value.trim().length > 0);

  const tokens = new Set<string>();
  for (const value of raw) {
    tokens.add(value.trim().toLowerCase());
    const normalized = normalizeClassToken(value);
    if (normalized) {
      tokens.add(normalized);
    }
  }
  return [...tokens];
}

/** Reads `classification` / `index_categories` off a raw Convex substance row. */
export function classSourceFromSubstanceDocument(document: {
  classification?: unknown;
  index_categories?: unknown;
}): ClassSource {
  const classification =
    typeof document.classification === "object" && document.classification !== null
      ? (document.classification as Record<string, unknown>)
      : {};
  const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

  return {
    psychoactiveClasses: asArray(classification.psychoactive_class),
    chemicalClasses: asArray(classification.chemical_class),
    indexCategories: asArray(document.index_categories),
  };
}

/**
 * Which of a preset's matchers hit these tokens. Returns the matchers rather
 * than a boolean because the Studio prints the provenance — "matcher
 * `gabaergic` hit `GABAergic`" — and an unexplained suggestion is not
 * reviewable.
 */
export function matcherHits(
  preset: Pick<WarningBannerPreset, "candidateMatchers">,
  tokens: readonly string[],
): string[] {
  return preset.candidateMatchers.filter((matcher) => {
    const needle = matcher.trim().toLowerCase();
    if (!needle) {
      return false;
    }
    return tokens.some((token) => token.includes(needle));
  });
}

/** Danger before unsafe before caution, then by explicit priority, then by key. */
export function compareWarningBanners(a: WarningBannerPreset, b: WarningBannerPreset): number {
  const toneDelta = WARNING_BANNER_TONES.indexOf(a.tone) - WARNING_BANNER_TONES.indexOf(b.tone);
  if (toneDelta !== 0) {
    return toneDelta;
  }
  if (a.priority !== b.priority) {
    return a.priority - b.priority;
  }
  return a.key.localeCompare(b.key);
}

/**
 * THE RENDER RULE. Takes a slug, never a classification.
 *
 * Returns at most `MAX_BANNERS_PER_ARTICLE`; use `resolveSuppressedBanners` for
 * what the cap dropped.
 */
export function resolveEnabledBanners(
  presets: readonly WarningBannerPreset[],
  slug: string,
): WarningBannerPreset[] {
  return matchingPresets(presets, slug).slice(0, MAX_BANNERS_PER_ARTICLE);
}

/** Enabled on this slug but over the cap, so not rendered. Studio-facing. */
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
  const target = slug.trim().toLowerCase();
  if (!target) {
    return [];
  }
  return presets
    .filter((preset) => preset.enabled && preset.enabledSlugs.includes(target))
    .sort(compareWarningBanners);
}

/** `live` only when a reader can actually reach it. */
export type WarningBannerPresetState = "live" | "dormant" | "off";

export function warningBannerPresetState(
  preset: Pick<WarningBannerPreset, "enabled" | "enabledSlugs">,
): WarningBannerPresetState {
  if (!preset.enabled) {
    return "off";
  }
  return preset.enabledSlugs.length > 0 ? "live" : "dormant";
}

/**
 * Server-side normalization shared by the Convex mutation and the Next route so
 * the two cannot disagree about what a valid preset is. Throws through the
 * caller's `reject` so each side keeps its own error shape.
 */
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

export function normalizeMatchers(matchers: readonly string[]): string[] {
  const seen = new Set<string>();
  for (const matcher of matchers) {
    const value = matcher.replace(/\s+/g, " ").trim().toLowerCase();
    if (value) {
      seen.add(value);
    }
  }
  return [...seen];
}

/**
 * Keeps one link per anchor and drops unknown targets, so a banner cannot ship a
 * chip that scrolls nowhere. An empty `label` falls back to the suggested wording
 * rather than rendering a blank chip — the editor's silence means "use the
 * default", not "render nothing".
 */
export function normalizeLinks(links: readonly WarningBannerLink[]): WarningBannerLink[] {
  const bySection = new Map<WarningBannerLinkSection, WarningBannerLink>();
  for (const link of links) {
    if (!isWarningBannerLinkSection(link.sectionId)) {
      continue;
    }
    const label = link.label.replace(/\s+/g, " ").trim();
    bySection.set(link.sectionId, {
      sectionId: link.sectionId,
      label: label || WARNING_BANNER_SECTION_LABELS[link.sectionId],
    });
  }
  return [...bySection.values()];
}

/**
 * One-click glyphs offered beside the icon field. A shortcut, not a whitelist:
 * the field accepts any id `WARNING_BANNER_ICON_PATTERN` allows. Chosen because
 * each one reads as its risk at 22px in the banner gutter, which most icons do
 * not — an ambiguous silhouette costs more here than variety gains.
 */
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
