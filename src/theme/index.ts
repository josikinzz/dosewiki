import { SITE_FLAVOR_CONFIG } from "@/config/siteFlavor";
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

/** One resolved appearance: a point on both axes. */
export type Appearance = {
  readonly colorScheme: ColorScheme;
  readonly visualStyle: VisualStyle;
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

/**
 * The appearance the stylesheets render with no root attribute present: dark values live on
 * `:root` and Fun is the unqualified layer, so these are the token system's base rather than
 * a preference. A publication's own opening appearance is its {@link AppearancePolicy}.
 */
export const DEFAULT_COLOR_SCHEME = THEME_TOKEN_INTERFACE.defaultColorScheme as ColorScheme;
export const DEFAULT_VISUAL_STYLE = THEME_TOKEN_INTERFACE.defaultVisualStyle as VisualStyle;

export const COLOR_SCHEME_STORAGE_KEY = THEME_TOKEN_INTERFACE.colorSchemeStorageKey;
export const VISUAL_STYLE_STORAGE_KEY = THEME_TOKEN_INTERFACE.visualStyleStorageKey;
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
 */
export type AppearancePolicy = {
  readonly defaultColorScheme: ColorScheme;
  readonly showColorSchemeToggle: boolean;
  readonly defaultVisualStyle: VisualStyle;
  readonly showVisualStyleToggle: boolean;
};

/** Browser-chrome tint for one point on both axes. */
export function getAppearanceMetaColor({ colorScheme, visualStyle }: Appearance): string {
  return APPEARANCE_META_COLORS[visualStyle][colorScheme];
}

/**
 * The appearance the server must render, and the appearance the bootstrap falls back to per
 * axis. Rendering both root attributes and the matching `theme-color` meta value from one
 * source keeps the first painted frame — page *and* browser chrome — off the wrong style.
 */
export function getInitialAppearance(policy: AppearancePolicy = SITE_FLAVOR_CONFIG): Appearance {
  return {
    colorScheme: policy.defaultColorScheme,
    visualStyle: policy.defaultVisualStyle,
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
 * The one pre-paint script. Resolves both axes independently, then applies both root
 * attributes, `color-scheme` and the style-by-scheme browser-chrome tint.
 *
 * The root attributes are written outside any `try` so they always land: a missing or
 * throwing `theme-color` meta element must cost the reader their chrome tint, never their
 * theme. The style is resolved first because it selects the scheme's validity row.
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

  return `(() => {
  const COLORS = ${JSON.stringify(APPEARANCE_META_COLORS)};
${visualStyle}
${colorScheme}

  const root = document.documentElement;
  root.dataset.visualStyle = style;
  root.dataset.theme = scheme;
  root.style.colorScheme = scheme;

  try {
    const meta = document.getElementById(${JSON.stringify(THEME_META_ID)});
    if (meta) {
      meta.setAttribute("content", COLORS[style][scheme]);
    }
  } catch {}
})();`;
}
