import { SITE_FLAVOR_CONFIG } from "@/config/siteFlavor";
import { isAccent, type AccentId } from "./accents";
import { isSurface, LEGACY_ACCENT_TO_SURFACE, type SurfaceId } from "./surfaces";
import {
  ACCENT_LEVEL_PROPERTY,
  CHROMA_STYLESHEET_HREF,
  CHROMA_STYLESHEET_LINK_ID,
  DEFAULT_ACCENT_LEVEL,
  DEFAULT_SURFACE_LEVEL,
  SURFACE_LEVEL_PROPERTY,
} from "./appearanceChroma";
import tokenInterface from "./theme-token-interface.json";

export const THEME_TOKEN_INTERFACE = tokenInterface;

/**
 * The colour axis: canvas, surfaces, ink, borders, accents, controls and browser chrome.
 * Carried on the document root as `data-theme`, which is also the storage key's history —
 * the attribute name predates the second axis and is kept so saved preferences survive.
 */
export type ColorScheme = "light" | "dark";

/**
 * The presentation axis: typography, radii, elevation, spacing treatment, logo treatment
 * and visual vocabulary. Carried on the document root as `data-visual-style`.
 *
 * This is deliberately *not* the publication axis. `data-site` still owns routes, copy,
 * navigation, wordmarks, metadata and licensing; Fun and Pro only change how the one shared
 * component kit looks, so either publication can wear either style without leaking the
 * other's identity.
 */
export type VisualStyle = "fun" | "pro";

/**
 * The accent axis: which hue the interactive surface wears. Carried on the document root as
 * `data-accent`, and **absent for the default accent**.
 *
 * Absence is the design, not a shortcut. The default accent has no CSS block at all, so a
 * page painted before any script has run is already correct; only a reader who chose
 * something else pays for an attribute and a block. The other two axes cannot work that way
 * because each publication opens on its own point (Effect Index opens light and Pro), but
 * every publication opens on the authored accent.
 *
 * {@link AccentId} is the compile-time union; `accents.ts` holds the table each id resolves
 * to, including the Fun colourway and Pro `--ei-*` seeds the generated stylesheet carries.
 */
export type { AccentId } from "./accents";
export { getAccent, isAccent, type Accent, type ProAccentSeeds } from "./accents";
export type { SurfaceId } from "./surfaces";
export { getSurface, isSurface, SURFACES, LEGACY_ACCENT_TO_SURFACE } from "./surfaces";

/** One resolved appearance: a point on all four axes. */
export type Appearance = {
  readonly colorScheme: ColorScheme;
  readonly visualStyle: VisualStyle;
  readonly surface: SurfaceId;
  readonly accent: AccentId;
};

/**
 * The unions above are the compile-time contract; these arrays are the runtime validity
 * sets, read from the manifest so the stylesheets, the bootstrap and the provider cannot
 * disagree about which values exist. The token-interface test asserts the two agree.
 */
export const SUPPORTED_COLOR_SCHEMES =
  THEME_TOKEN_INTERFACE.supportedColorSchemes as readonly ColorScheme[];
export const SUPPORTED_VISUAL_STYLES =
  THEME_TOKEN_INTERFACE.supportedVisualStyles as readonly VisualStyle[];
export const SUPPORTED_ACCENTS = THEME_TOKEN_INTERFACE.supportedAccents as readonly AccentId[];
export const SUPPORTED_SURFACES =
  THEME_TOKEN_INTERFACE.supportedSurfaces as readonly SurfaceId[];

/**
 * The appearance the stylesheets render with no root attribute present: dark values live on
 * `:root` and Fun is the unqualified layer, so these are the token system's base rather than
 * a preference. A publication's own opening appearance is its {@link AppearancePolicy}.
 */
export const DEFAULT_COLOR_SCHEME = THEME_TOKEN_INTERFACE.defaultColorScheme as ColorScheme;
export const DEFAULT_VISUAL_STYLE = THEME_TOKEN_INTERFACE.defaultVisualStyle as VisualStyle;
/**
 * The accent the stylesheets render with no `data-accent` present. It is the same value
 * `accents.ts` declares as {@link BASE_ACCENT_ID} — stated in both places because the
 * manifest is what the bootstrap and the stylesheets agree through, and the table is what
 * the type system checks; `accents.test.ts` asserts they have not drifted apart.
 *
 * This is the *base* of the paint, not where a publication opens. Those were one value until
 * dose.wiki chose to open on Neutral; {@link AppearancePolicy.defaultAccent} is the opening
 * accent now, and only a publication that opens on this one ships no attribute.
 */
export const BASE_ACCENT = THEME_TOKEN_INTERFACE.baseAccent as AccentId;
export const BASE_SURFACE = THEME_TOKEN_INTERFACE.baseSurface as SurfaceId;

export const COLOR_SCHEME_STORAGE_KEY = THEME_TOKEN_INTERFACE.colorSchemeStorageKey;
export const VISUAL_STYLE_STORAGE_KEY = THEME_TOKEN_INTERFACE.visualStyleStorageKey;
export const ACCENT_STORAGE_KEY = THEME_TOKEN_INTERFACE.accentStorageKey;
export const SURFACE_STORAGE_KEY = THEME_TOKEN_INTERFACE.surfaceStorageKey;
export const APPEARANCE_STORAGE_KEY = THEME_TOKEN_INTERFACE.appearanceStorageKey;
export const SURFACE_CHROMA_STORAGE_KEY = THEME_TOKEN_INTERFACE.surfaceChromaStorageKey;
export const ACCENT_CHROMA_STORAGE_KEY = THEME_TOKEN_INTERFACE.accentChromaStorageKey;
export const THEME_META_ID = THEME_TOKEN_INTERFACE.metaId;

/**
 * Browser-chrome tint per style, per scheme. A full matrix over both axes on purpose: the
 * pre-paint bootstrap uses it as the validity set for both stored preferences, so a missing
 * row or column would silently make a supported value look unsupported.
 */
export const APPEARANCE_META_COLORS = THEME_TOKEN_INTERFACE.metaColors as Readonly<
  Record<VisualStyle, Readonly<Record<ColorScheme, string>>>
>;

export const THEME_CLASS = {
  textPrimary: "theme-text-primary",
  textSecondary: "theme-text-secondary",
  textMuted: "theme-text-muted",
  textFaint: "theme-text-faint",
  accentHeading: "theme-accent-heading",
  cardSurface: "theme-card-surface",
  overlaySurface: "theme-overlay-surface",
  publicCard: "theme-public-card",
  publicCardSubtle: "theme-public-card-subtle",
  linkMuted: "theme-link-muted",
  iconButton: "theme-icon-button",
  focusSkipLink: "theme-skip-link",
  pageShell: "theme-page-shell",
} as const;

export function isColorScheme(value: string | null | undefined): value is ColorScheme {
  return SUPPORTED_COLOR_SCHEMES.includes(value as ColorScheme);
}

export function isVisualStyle(value: string | null | undefined): value is VisualStyle {
  return SUPPORTED_VISUAL_STYLES.includes(value as VisualStyle);
}

/**
 * A publication's appearance policy: where it opens on each axis, and which axes its readers
 * may change. Declared here because this module owns the axis vocabulary, and composed into
 * `SiteFlavorConfig`, which owns everything else about a publication.
 *
 * A `false` toggle flag is a *lock*, not merely a hidden control: the locked axis resolves
 * from the build and its storage key is never read or written. That is what keeps a reader's
 * dose.wiki style choice from following them into Effect Index's identity.
 *
 * All three axes carry a `default*` here. The accent one used to be absent, on the reasoning
 * that every publication opened on the authored base — true until dose.wiki chose to open on
 * Neutral. {@link BASE_ACCENT} remains the accent the stylesheets paint with no attribute;
 * `defaultAccent` is where a publication opens, and the two are only the same value for a
 * publication that wants the authored base. A locked accent axis ignores `defaultAccent` and
 * resolves to {@link BASE_ACCENT}, because a lock means "wear the publication's own identity".
 */
export type AppearancePolicy = {
  readonly defaultColorScheme: ColorScheme;
  readonly showColorSchemeToggle: boolean;
  readonly defaultVisualStyle: VisualStyle;
  readonly showVisualStyleToggle: boolean;
  readonly defaultAccent: AccentId;
  readonly defaultSurface: SurfaceId;
  readonly showSurfacePicker: boolean;
  readonly showAccentPicker: boolean;
};

/**
 * Browser-chrome tint for one point on the scheme and style axes.
 *
 * Narrowed to the two axes it reads rather than taking a whole {@link Appearance}: the accent
 * deliberately does not tint browser chrome. The address bar and the installed-app splash are
 * publication identity, and an accent is a reader's preference inside a publication, so
 * letting one repaint the other would put a reader's choice where the publication's own colour
 * belongs.
 */
export function getAppearanceMetaColor({
  colorScheme,
  visualStyle,
}: Pick<Appearance, "colorScheme" | "visualStyle">): string {
  return APPEARANCE_META_COLORS[visualStyle][colorScheme];
}

/**
 * The appearance the server must render, and the appearance the bootstrap falls back to per
 * axis. Rendering both root attributes and the matching `theme-color` meta value from one
 * source keeps the first painted frame — page *and* browser chrome — off the wrong style.
 *
 * The accent opens on the publication's own {@link AppearancePolicy.defaultAccent}, except
 * under a lock, where it resolves to {@link BASE_ACCENT} — the locked axis wears the
 * publication's identity rather than a reader-facing opening choice. When the result is not
 * `BASE_ACCENT` the server must render `data-accent` for it, or the markup it ships and the
 * frame the bootstrap paints are different ones.
 */
export function getInitialAppearance(policy: AppearancePolicy = SITE_FLAVOR_CONFIG): Appearance {
  return {
    colorScheme: policy.defaultColorScheme,
    visualStyle: policy.defaultVisualStyle,
    surface: policy.showSurfacePicker ? policy.defaultSurface : BASE_SURFACE,
    accent: policy.showAccentPicker ? policy.defaultAccent : BASE_ACCENT,
  };
}
export type StoredAppearanceV4 = Appearance & { readonly version: 4 };

export function resolveInitialAppearance(
  policy: AppearancePolicy,
  stored: Partial<Record<"visualStyle" | "colorScheme" | "surface" | "accent", string>> | null,
): Appearance {
  const initial = getInitialAppearance(policy);
  const legacyAccent = policy.showAccentPicker && isAccent(stored?.accent) ? stored.accent : initial.accent;
  return {
    visualStyle:
      policy.showVisualStyleToggle && isVisualStyle(stored?.visualStyle)
        ? stored.visualStyle
        : initial.visualStyle,
    colorScheme:
      policy.showColorSchemeToggle && isColorScheme(stored?.colorScheme)
        ? stored.colorScheme
        : initial.colorScheme,
    surface:
      policy.showSurfacePicker && isSurface(stored?.surface)
        ? stored.surface
        : policy.showSurfacePicker && isAccent(stored?.accent)
          ? LEGACY_ACCENT_TO_SURFACE[stored.accent]
          : initial.surface,
    accent: legacyAccent,
  };
}

/**
 * One axis of the pre-paint resolution, emitted as source.
 *
 * A locked axis compiles to a constant: no storage key appears in the script at all, so the
 * stored preference is not read and then overridden, it is never consulted. An unlocked axis
 * gets its own `try`, so a value this build does not support — or a storage read that throws
 * outright — costs that axis its default and leaves the other axis alone.
 */
function buildAxisResolution({
  variable,
  fallback,
  locked,
  storageKey,
  validitySet,
}: {
  variable: string;
  fallback: string;
  locked: boolean;
  storageKey: string;
  validitySet: string;
}): string {
  if (locked) {
    return `  const ${variable} = ${JSON.stringify(fallback)};`;
  }

  return `  let ${variable} = ${JSON.stringify(fallback)};
  try {
    const stored = window.localStorage.getItem(${JSON.stringify(storageKey)});
    if (Object.prototype.hasOwnProperty.call(${validitySet}, stored)) {
      ${variable} = stored;
    }
  } catch {}`;
}

/**
 * The one pre-paint script. Resolves all three axes independently, then applies the root
 * attributes, `color-scheme` and the style-by-scheme browser-chrome tint.
 *
 * The root attributes are written outside any `try` so they always land: a missing or
 * throwing `theme-color` meta element must cost the reader their chrome tint, never their
 * theme. The style is resolved first because it selects the scheme's validity row.
 *
 * The accent is the one axis that can resolve to *no attribute*. {@link BASE_ACCENT} has no
 * block in the generated stylesheet, so writing `data-accent="default"` would advertise an
 * override that does not exist and give the Theme Lab and the DOM inspector a value with no
 * meaning. That accent is therefore removed rather than set — the same rule
 * `applyAppearanceToDocument` follows in the provider, which is the only other writer. Every
 * other accent, including a publication opening on one, is written.
 */
export function buildThemeBootstrapScript(policy: AppearancePolicy = SITE_FLAVOR_CONFIG): string {
  const visualStyle = buildAxisResolution({
    variable: "style",
    fallback: policy.defaultVisualStyle,
    locked: !policy.showVisualStyleToggle,
    storageKey: VISUAL_STYLE_STORAGE_KEY,
    validitySet: "COLORS",
  });
  const colorScheme = buildAxisResolution({
    variable: "scheme",
    fallback: policy.defaultColorScheme,
    locked: !policy.showColorSchemeToggle,
    storageKey: COLOR_SCHEME_STORAGE_KEY,
    validitySet: "COLORS[style]",
  });
  // The accent's validity set is the only one this script has to carry for its own sake; the
  // other two read rows of the meta-colour matrix, which the chrome tint needs anyway. A
  // locked accent resolves at build time, so under a lock neither the set nor the resolution
  // nor the branch below is emitted at all — they would be dead bytes on every page.
  const accentLocked = !policy.showAccentPicker;
  const accent = accentLocked
    ? ""
    : `\n${buildAxisResolution({
        variable: "accent",
        fallback: policy.defaultAccent,
        locked: false,
        storageKey: ACCENT_STORAGE_KEY,
        validitySet: "ACCENTS",
      })}`;
  const accentValiditySet = accentLocked
    ? ""
    : `\n  const ACCENTS = ${JSON.stringify(Object.fromEntries(SUPPORTED_ACCENTS.map((id) => [id, 1])))};`;
  const surfaceLocked = !policy.showSurfacePicker;
  const surface = surfaceLocked
    ? `\n  const surface = ${JSON.stringify(BASE_SURFACE)};`
    : `\n  const SURFACES = ${JSON.stringify(Object.fromEntries(SUPPORTED_SURFACES.map((id) => [id, 1])))};
  const LEGACY_SURFACES = ${JSON.stringify(LEGACY_ACCENT_TO_SURFACE)};
  let surface = ${JSON.stringify(policy.defaultSurface)};
  try {
    const storedSurface = window.localStorage.getItem(${JSON.stringify(SURFACE_STORAGE_KEY)});
    const storedAccent = window.localStorage.getItem(${JSON.stringify(ACCENT_STORAGE_KEY)});
    if (Object.prototype.hasOwnProperty.call(SURFACES, storedSurface)) {
      surface = storedSurface;
    } else if (Object.prototype.hasOwnProperty.call(LEGACY_SURFACES, storedAccent)) {
      surface = LEGACY_SURFACES[storedAccent];
    }
  } catch {}`;
  const surfaceWrite = surfaceLocked
    ? `  delete root.dataset.surface;`
    : `  if (surface === ${JSON.stringify(BASE_SURFACE)}) {
    delete root.dataset.surface;
  } else {
    root.dataset.surface = surface;
  }`;
  // Under a lock the attribute is still *removed* rather than left alone. A locked accent
  // resolves to BASE_ACCENT rather than to `policy.defaultAccent` — a lock means the
  // publication's own identity, not a reader-facing opening choice — so this is one
  // unconditional statement instead of a branch over a constant. It is kept rather than
  // dropped so the script does not depend on the server having rendered no attribute.
  const accentWrite = accentLocked
    ? `  delete root.dataset.accent;`
    : `  if (accent === ${JSON.stringify(BASE_ACCENT)}) {
    delete root.dataset.accent;
  } else {
    root.dataset.accent = accent;
  }`;
  // The saturation axis. Numeric rather than enumerated, so it cannot share
  // buildAxisResolution's membership test: a stored level is a decimal in 0..1
  // and anything else — including "" — resolves to the site-default level.
  // Each axis's read is gated on the same lock as its parent picker, so a
  // fully locked publication (Effect Index) emits none of this and its script
  // stays byte-identical. Every other reader — including one who never touched
  // a slider — gets the attribute, both level properties (stored ?? default),
  // and the render-blocking <link> to the generated gain stylesheet, all
  // pre-paint, so neither a saved level nor the default ever flashes the
  // authored palette. The href's ?v= is the stylesheet's content hash from
  // appearanceChroma.generated.json.
  const chromaRead = (variable: string, storageKey: string, defaultLevel: number) => `  let ${variable} = ${defaultLevel};
  try {
    const raw = window.localStorage.getItem(${JSON.stringify(storageKey)});
    const level = raw ? +raw : NaN;
    if (level >= 0 && level <= 1) ${variable} = level;
  } catch {}`;
  const chromaResolution = [
    surfaceLocked
      ? ""
      : `\n${chromaRead("chromaSurface", SURFACE_CHROMA_STORAGE_KEY, DEFAULT_SURFACE_LEVEL)}`,
    accentLocked
      ? ""
      : `\n${chromaRead("chromaAccent", ACCENT_CHROMA_STORAGE_KEY, DEFAULT_ACCENT_LEVEL)}`,
  ].join("");
  const chromaWrite =
    surfaceLocked && accentLocked
      ? ""
      : `\n\n  root.dataset.chroma = "";${
          surfaceLocked
            ? ""
            : `
  root.style.setProperty(${JSON.stringify(SURFACE_LEVEL_PROPERTY)}, "" + chromaSurface);`
        }${
          accentLocked
            ? ""
            : `
  root.style.setProperty(${JSON.stringify(ACCENT_LEVEL_PROPERTY)}, "" + chromaAccent);`
        }
  try {
    const link = document.createElement("link");
    link.id = ${JSON.stringify(CHROMA_STYLESHEET_LINK_ID)};
    link.rel = "stylesheet";
    link.href = ${JSON.stringify(CHROMA_STYLESHEET_HREF)};
    document.head.appendChild(link);
  } catch {}`;

  return `(() => {
  const COLORS = ${JSON.stringify(APPEARANCE_META_COLORS)};${accentValiditySet}
${visualStyle}
${colorScheme}${accent}${surface}${chromaResolution}

  const root = document.documentElement;
  root.dataset.visualStyle = style;
  root.dataset.theme = scheme;
  root.style.colorScheme = scheme;

${surfaceWrite}

${accentWrite}${chromaWrite}

  try {
    const meta = document.getElementById(${JSON.stringify(THEME_META_ID)});
    if (meta) {
      meta.setAttribute("content", COLORS[style][scheme]);
    }
  } catch {}
})();`;
}
