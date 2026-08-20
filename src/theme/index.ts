import { SITE_FLAVOR_CONFIG } from "@/config/siteFlavor";
import { LEGACY_ACCENT_TO_HUE } from "./accents";
import { BASE_SURFACE_ID, LEGACY_SURFACE_TO_HUE } from "./surfaces";
import {
  ACCENT_HUE_PROPERTY,
  ACCENT_LEVEL_PROPERTY,
  CHROMA_STYLESHEET_HREF,
  CHROMA_STYLESHEET_LINK_ID,
  DEFAULT_ACCENT_HUE,
  DEFAULT_ACCENT_LEVEL,
  DEFAULT_PRO_SURFACE_LEVEL,
  DEFAULT_SURFACE_HUE,
  DEFAULT_SURFACE_LEVEL,
  SURFACE_HUE_PROPERTY,
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
 * The colour axes: continuous hue rotations and saturation levels over the one authored
 * palette (Orchid surfaces, the Default plum accent), carried as the `--dw-*-hue` and
 * `--dw-*-level` custom properties the generated chroma stylesheet composes into every
 * chromatic token. No colourway vocabulary reaches the document root any more — the retired
 * `data-surface`/`data-accent` ids survive only as {@link LEGACY_SURFACE_TO_HUE} and
 * {@link LEGACY_ACCENT_TO_HUE}, which map a stored id onto the hue rotation (and, for the
 * achromatic Graphite/Neutral pair, the saturation level 0) that reproduces its look.
 */
export { isAccent, LEGACY_ACCENT_TO_HUE, type AccentId, type ProAccentSeeds } from "./accents";
export { isSurface, LEGACY_SURFACE_TO_HUE, type SurfaceId } from "./surfaces";

/**
 * One resolved appearance: a point on the two attribute axes. The colour axes (hue and
 * saturation) are numeric, resolved separately from storage-or-default by the bootstrap
 * and the provider.
 */
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
/**
 * The retired colourway keys. Never written any more: the bootstrap and the provider read
 * them only to migrate a saved colourway onto the hue axes, and the provider removes them
 * once the migrated hue is persisted.
 */
export const ACCENT_STORAGE_KEY = THEME_TOKEN_INTERFACE.accentStorageKey;
export const SURFACE_STORAGE_KEY = THEME_TOKEN_INTERFACE.surfaceStorageKey;
export const APPEARANCE_STORAGE_KEY = THEME_TOKEN_INTERFACE.appearanceStorageKey;
export const SURFACE_CHROMA_STORAGE_KEY = THEME_TOKEN_INTERFACE.surfaceChromaStorageKey;
export const ACCENT_CHROMA_STORAGE_KEY = THEME_TOKEN_INTERFACE.accentChromaStorageKey;
export const SURFACE_HUE_STORAGE_KEY = THEME_TOKEN_INTERFACE.surfaceHueStorageKey;
export const ACCENT_HUE_STORAGE_KEY = THEME_TOKEN_INTERFACE.accentHueStorageKey;
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
 * The two attribute axes carry a `default*` here — each publication opens on its own point.
 * The colour axes (hue and saturation, one pair per picker flag) carry none: their site
 * defaults are the `DEFAULT_*` constants in `appearanceChroma.ts`, and a lock simply leaves
 * the authored palette untouched.
 */
export type AppearancePolicy = {
  readonly defaultColorScheme: ColorScheme;
  readonly showColorSchemeToggle: boolean;
  readonly defaultVisualStyle: VisualStyle;
  readonly showVisualStyleToggle: boolean;
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
 * The one pre-paint script. Resolves the style and scheme axes independently, then applies
 * the root attributes, `color-scheme` and the style-by-scheme browser-chrome tint.
 *
 * The root attributes are written outside any `try` so they always land: a missing or
 * throwing `theme-color` meta element must cost the reader their chrome tint, never their
 * theme. The style is resolved first because it selects the scheme's validity row.
 *
 * The retired colourway attributes (`data-surface`/`data-accent`) are unconditionally
 * removed rather than left alone, so the script does not depend on the server having
 * rendered no attribute. Their stored ids survive as *inputs* to the hue axes: a reader
 * with no saved hue but a saved colourway id gets the hue rotation that reproduces it —
 * and, for the achromatic Graphite/Neutral pair, the saturation level 0 — pre-paint. The
 * script never writes storage; persisting the migrated values and removing the old keys is
 * the provider's job on hydration.
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
  const accentLocked = !policy.showAccentPicker;
  const surfaceLocked = !policy.showSurfacePicker;
  // A locked surface still compiles to this constant, unused though it is next to the
  // unconditional attribute removal below: these are the exact bytes Effect Index's pinned
  // CSP hash covers (lib/next/cspObservationPolicy.ts), and the colourway axis's retirement
  // must not move that publication's locked script by a single byte.
  const surface = surfaceLocked ? `\n  const surface = ${JSON.stringify(BASE_SURFACE_ID)};` : "";
  // The colour axes: numeric rather than enumerated, so they cannot share
  // buildAxisResolution's membership test. A stored level is a decimal in 0..1 and a stored
  // hue an integer 0..359; anything else — including "" — resolves to the site default,
  // except that a missing hue falls back once more to a saved colourway id through the
  // legacy tables (entries that would be no-ops are filtered out at build time). Each
  // pair's read is gated on the same lock as its parent picker, so a fully locked
  // publication (Effect Index) emits none of this and its script stays byte-identical.
  // Every other reader — including one who never touched a slider — gets the attribute,
  // all four custom properties (stored ?? default), and the render-blocking <link> to the
  // generated stylesheet, all pre-paint, so neither a saved value nor the default ever
  // flashes the authored palette. The href's ?v= is the stylesheet's content hash from
  // appearanceChroma.generated.json.
  const chromaRead = ({
    levelVariable,
    hueVariable,
    defaultLevel,
    defaultHue,
    levelKey,
    hueKey,
    legacyKey,
    legacyHues,
  }: {
    levelVariable: string;
    hueVariable: string;
    /**
     * A number, or an emitted JS expression. The surface passes an expression
     * over the already-resolved `style` variable: its default level is per
     * visual style (Fun 0.15, Pro 0 — see `DEFAULT_PRO_SURFACE_LEVEL`), while
     * a *stored* level keeps meaning one knob for both styles.
     */
    defaultLevel: number | string;
    defaultHue: number;
    levelKey: string;
    hueKey: string;
    legacyKey: string;
    legacyHues: Readonly<Record<string, { readonly hue: number; readonly chroma?: 0 }>>;
  }) => {
    const legacy = JSON.stringify(
      Object.fromEntries(
        Object.entries(legacyHues).filter(([, mapped]) => mapped.hue !== 0 || mapped.chroma === 0),
      ),
    );
    return `  let ${levelVariable} = ${defaultLevel};
  let ${hueVariable} = ${defaultHue};
  try {
    const raw = window.localStorage.getItem(${JSON.stringify(levelKey)});
    const level = raw ? +raw : NaN;
    if (level >= 0 && level <= 1) ${levelVariable} = level;
  } catch {}
  try {
    const raw = window.localStorage.getItem(${JSON.stringify(hueKey)});
    if (raw && /^\\d+$/.test(raw) && +raw <= 359) {
      ${hueVariable} = +raw;
    } else {
      const LEGACY = ${legacy};
      const stored = window.localStorage.getItem(${JSON.stringify(legacyKey)});
      if (Object.prototype.hasOwnProperty.call(LEGACY, stored)) {
        ${hueVariable} = LEGACY[stored].hue;
        if (LEGACY[stored].chroma === 0) ${levelVariable} = 0;
      }
    }
  } catch {}`;
  };
  const chromaResolution = [
    surfaceLocked
      ? ""
      : `\n${chromaRead({
          levelVariable: "chromaSurface",
          hueVariable: "hueSurface",
          defaultLevel: `style === "pro" ? ${DEFAULT_PRO_SURFACE_LEVEL} : ${DEFAULT_SURFACE_LEVEL}`,
          defaultHue: DEFAULT_SURFACE_HUE,
          levelKey: SURFACE_CHROMA_STORAGE_KEY,
          hueKey: SURFACE_HUE_STORAGE_KEY,
          legacyKey: SURFACE_STORAGE_KEY,
          legacyHues: LEGACY_SURFACE_TO_HUE,
        })}`,
    accentLocked
      ? ""
      : `\n${chromaRead({
          levelVariable: "chromaAccent",
          hueVariable: "hueAccent",
          defaultLevel: DEFAULT_ACCENT_LEVEL,
          defaultHue: DEFAULT_ACCENT_HUE,
          levelKey: ACCENT_CHROMA_STORAGE_KEY,
          hueKey: ACCENT_HUE_STORAGE_KEY,
          legacyKey: ACCENT_STORAGE_KEY,
          legacyHues: LEGACY_ACCENT_TO_HUE,
        })}`,
  ].join("");
  const chromaWrite =
    surfaceLocked && accentLocked
      ? ""
      : `\n\n  root.dataset.chroma = "";${
          surfaceLocked
            ? ""
            : `
  root.style.setProperty(${JSON.stringify(SURFACE_LEVEL_PROPERTY)}, "" + chromaSurface);
  root.style.setProperty(${JSON.stringify(SURFACE_HUE_PROPERTY)}, "" + hueSurface);`
        }${
          accentLocked
            ? ""
            : `
  root.style.setProperty(${JSON.stringify(ACCENT_LEVEL_PROPERTY)}, "" + chromaAccent);
  root.style.setProperty(${JSON.stringify(ACCENT_HUE_PROPERTY)}, "" + hueAccent);`
        }
  try {
    const link = document.createElement("link");
    link.id = ${JSON.stringify(CHROMA_STYLESHEET_LINK_ID)};
    link.rel = "stylesheet";
    link.href = ${JSON.stringify(CHROMA_STYLESHEET_HREF)};
    document.head.appendChild(link);
  } catch {}`;

  return `(() => {
  const COLORS = ${JSON.stringify(APPEARANCE_META_COLORS)};
${visualStyle}
${colorScheme}${surface}${chromaResolution}

  const root = document.documentElement;
  root.dataset.visualStyle = style;
  root.dataset.theme = scheme;
  root.style.colorScheme = scheme;

  delete root.dataset.surface;

  delete root.dataset.accent;${chromaWrite}

  try {
    const meta = document.getElementById(${JSON.stringify(THEME_META_ID)});
    if (meta) {
      meta.setAttribute("content", COLORS[style][scheme]);
    }
  } catch {}
})();`;
}
