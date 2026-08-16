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
 * Class strings survive only inside `searchWarningBannerTargets`, which is how
 * the Studio *finds* substances for an editor to tick. They are useful for
 * search and useless for assignment: cocaine carries
 * `chemical_class: "Alkaloid (tropane)"` and would match a deliriant rule; DXM
 * is a `"Morphinan (substituted)"` and would match an opioid rule.
 *
 * Keep this module free of server-only imports: the Studio imports it in the
 * browser and `convex/warningBanners.ts` imports it on the server.
 */

export const WARNING_BANNER_TONES = ["danger", "unsafe", "caution"] as const;

export type WarningBannerTone = (typeof WARNING_BANNER_TONES)[number];

/**
 * Every string and glyph a reader sees is a stored field. Nothing visible is
 * derived or looked up from a table in code, so rewording a banner is an edit,
 * not a deploy.
 *
 * Deliberately small. A studio-facing `label`, a `priority` tiebreak, a
 * `links` array, and stored `candidateMatchers` were all removed: three names
 * for one banner and a sort key nobody could reason about were the bulk of the
 * tool's clutter, and search does not need its inputs persisted.
 */
export type WarningBannerPreset = {
  /** Stored identity, kebab-case. Also the studio-facing name. */
  key: string;
  tone: WarningBannerTone;
  /** Any Iconify id (`lucide:skull`) or a `custom:` key. Editable. */
  icon: string;
  /** The chip word, e.g. "Danger". Editable, rendered uppercase. */
  severityLabel: string;
  headline: string;
  /**
   * One entry renders as a paragraph; several render as a list. Bullets are a
   * consequence of writing more than one thing, never a requirement.
   */
  points: string[];
  /** Master switch. False means this preset renders nowhere. */
  enabled: boolean;
  /** Explicit opt-in. Empty means this preset renders nowhere. */
  enabledSlugs: string[];
};

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
 * Every class string on a substance, deduplicated, in original casing — the
 * Studio prints the one that matched, so the reader-facing spelling is what
 * has to survive.
 *
 * Defensive by design: Convex stores `classification` as `v.any()`, so the
 * Studio receives whatever is in the document rather than a parsed shape.
 */
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

/** Reads `classification` / `index_categories` off a raw Convex substance row. */
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
  /** `name` ranks above `class`: an editor typing "diazepam" wants diazepam. */
  kind: "name" | "class";
  /** The substance title or the class string that matched, in its own casing. */
  reason: string;
};

/**
 * One search box for both jobs. Typing `diazepam` finds that substance by name;
 * typing `opioid` finds every substance whose classification says so. This is
 * what replaced a stored `candidateMatchers` array plus an add-matcher control
 * plus a separate suggestion list plus three commit buttons — an editor wanting
 * one drug and an editor wanting a class were never doing different things.
 */
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

/**
 * Danger before unsafe before caution, then alphabetical by key.
 *
 * There is deliberately no editor-facing priority field: with a two-banner cap
 * and a handful of presets, a numeric tiebreak was a control nobody could
 * reason about. Two same-tone banners on one substance are resolved by an
 * editor turning one off, which is a decision they can see.
 */
export function compareWarningBanners(a: WarningBannerPreset, b: WarningBannerPreset): number {
  const toneDelta = WARNING_BANNER_TONES.indexOf(a.tone) - WARNING_BANNER_TONES.indexOf(b.tone);
  return toneDelta !== 0 ? toneDelta : a.key.localeCompare(b.key);
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
 * the two cannot disagree about what a valid preset is.
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

/**
 * One-click glyphs offered beside the icon field. A shortcut, not a whitelist:
 * the field accepts any id `WARNING_BANNER_ICON_PATTERN` allows. Chosen because
 * each one reads as its risk at banner size, which most icons do not — an
 * ambiguous silhouette costs more here than variety gains.
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
