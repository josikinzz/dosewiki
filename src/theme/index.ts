import { SITE_FLAVOR_CONFIG } from "@/config/siteFlavor";
import { LEGACY_ACCENT_TO_HUE } from "./accents";
import { BASE_SURFACE_ID, LEGACY_SURFACE_TO_HUE } from "./surfaces";
import {
  ACCENT_HUE_PROPERTY,
  ACCENT_LEVEL_PROPERTY,
  CHROMA_STYLESHEET_HREF,
  CHROMA_STYLESHEET_LINK_ID,
  CHROMA_SUPPORT_PROBE,
  DEFAULT_APPEARANCE_COLORS,
  SURFACE_HUE_PROPERTY,
  SURFACE_LEVEL_PROPERTY,
} from "./appearanceChroma";
import {
  LIGHT_MODE_STYLESHEET_ANCHOR_IDS,
  LIGHT_MODE_STYLESHEET_HREF,
  LIGHT_MODE_STYLESHEET_LINK_ID,
  PRO_THEME_STYLESHEET_ANCHOR_IDS,
  PRO_THEME_STYLESHEET_HREF,
  PRO_THEME_STYLESHEET_LINK_ID,
} from "./appearanceSheets";
import {
  READER_LEADING_ATTRIBUTE,
  READER_LEADING_PROPERTY,
  READER_LEADING_RANGE,
  READER_TRACKING_PROPERTY,
  READER_TRACKING_RANGE,
  TEXT_SIZE_PROPERTY,
  TEXT_SIZE_RANGE,
} from "./appearanceTypography";
import tokenInterface from "./theme-token-interface.json";

const THEME_TOKEN_INTERFACE = tokenInterface;

/**
 * The colour axis: canvas, surfaces, ink, borders, accents, controls and browser chrome.
 * Carried on the document root as `data-theme`, which is also the storage key's history —
 * the attribute name predates the second axis and is kept so saved preferences survive.
 */
export type ColorScheme = "light" | "dark";

/**
 * What the reader may *store* on the colour axis: an explicit scheme, or "system" —
 * follow the OS `prefers-color-scheme` live. The document attribute (`data-theme`) only
 * ever carries a resolved {@link ColorScheme}; "system" exists in storage and provider
 * state, and both the bootstrap and the provider resolve it before painting.
 */
export type ColorSchemePreference = ColorScheme | "system";

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
 * The type axis: which face the two `--font-family-*` tokens resolve to.
 * `"standard"` is the site default and is carried as *no* root attribute at all: the
 * authored `base.css` pairing (the Inter body face, the Blinker display face, and the
 * negative tracking ramp) is what a document with no `data-font` already wears, so the
 * default state re-seats nothing. Each other value re-seats both tokens to its own face
 * via `data-font="<face>"` on the document root, on both visual styles and both colour
 * schemes. A face list, not a binary toggle — dose.wiki offers the picker, Effect Index
 * locks the axis and never carries the attribute, reads the storage key, or ships the
 * faces.
 */
export type FontPreference =
  | "standard"
  | "lexend"
  | "inter"
  | "blinker"
  | "titillium"
  | "system";

/**
 * The runtime validity set for the type axis, in picker order. `"standard"` — the
 * default — is deliberately absent from the *painted* set: the default is the absence of
 * `data-font`, never a stored or painted value, on the never-write-a-default rule every
 * reader axis follows.
 */
const PAINTED_FONT_PREFERENCES: readonly Exclude<FontPreference, "standard">[] = [
  "lexend",
  "inter",
  "blinker",
  "titillium",
  "system",
];

/**
 * Stored values from the retired binary toggle, mapped onto the face that reproduces
 * them. A reader who turned the dyslexic toggle on was wearing Lexend, and that is an
 * accessibility choice, so the stored key resolves to the Lexend face rather than
 * decaying to the default the way an unrecognised value does.
 */
export const LEGACY_FONT_PREFERENCES: Readonly<Record<string, FontPreference>> = {
  dyslexic: "lexend",
};


/**
 * The colour axes: continuous hue rotations and saturation levels over the one authored
 * palette (Orchid surfaces, the Default plum accent), carried as the `--dw-*-hue` and
 * `--dw-*-level` custom properties the generated chroma stylesheet composes into every
 * chromatic token. No colourway vocabulary reaches the document root any more — the retired
 * `data-surface`/`data-accent` ids survive only as {@link LEGACY_SURFACE_TO_HUE} and
 * {@link LEGACY_ACCENT_TO_HUE}, which map a stored id onto the hue rotation (and, for the
 * achromatic Graphite/Neutral pair, the saturation level 0) that reproduces its look.
 */
export { LEGACY_ACCENT_TO_HUE } from "./accents";
export { LEGACY_SURFACE_TO_HUE } from "./surfaces";

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
 * The type axis's key. Only ever holds `"dyslexic"`: the default is expressed by
 * *removing* the key (and the root attribute), so a reader who never toggled — or who
 * toggled back — stores nothing, exactly like the colour axes' never-write-a-default rule.
 */
export const FONT_STORAGE_KEY = THEME_TOKEN_INTERFACE.fontStorageKey;
/**
 * The reading-type axes' keys — text size (px), letter spacing (em) and line height
 * (unitless). Paragraph spacing is deliberately absent: that rhythm is a fixed site
 * value (2x the font size), not a reader preference. Each key holds only a reader's
 * saved number: the default is expressed by *removing* the key, so a reader who never
 * moved a slider stores nothing, exactly like the colour and face axes.
 */
export const TEXT_SIZE_STORAGE_KEY = THEME_TOKEN_INTERFACE.textSizeStorageKey;
export const LETTER_SPACING_STORAGE_KEY = THEME_TOKEN_INTERFACE.letterSpacingStorageKey;
export const LINE_HEIGHT_STORAGE_KEY = THEME_TOKEN_INTERFACE.lineHeightStorageKey;
/**
 * The retired colourway keys. Never written any more: the bootstrap and the provider read
 * them only to migrate a saved colourway onto the hue axes, and the provider removes them
 * once the migrated hue is persisted.
 */
export const ACCENT_STORAGE_KEY = THEME_TOKEN_INTERFACE.accentStorageKey;
export const SURFACE_STORAGE_KEY = THEME_TOKEN_INTERFACE.surfaceStorageKey;
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


export function isColorScheme(value: string | null | undefined): value is ColorScheme {
  return SUPPORTED_COLOR_SCHEMES.includes(value as ColorScheme);
}

export function isColorSchemePreference(
  value: string | null | undefined,
): value is ColorSchemePreference {
  return value === "system" || isColorScheme(value);
}


export function isFontPreference(value: string | null | undefined): value is FontPreference {
  return (
    value === "standard" ||
    PAINTED_FONT_PREFERENCES.includes(value as Exclude<FontPreference, "standard">)
  );
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
  /**
   * The type axis carries no `default*` either: every publication opens on its visual
   * style's own face, and a lock simply never carries `data-font` or reads its key.
   */
  readonly showFontToggle: boolean;
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
  resolveSystem = false,
}: {
  variable: string;
  fallback: string;
  locked: boolean;
  storageKey: string;
  validitySet: string;
  /**
   * Scheme axis only: a stored "system" resolves through `prefers-color-scheme` before the
   * membership test, so the painted attribute still only ever carries a supported scheme.
   */
  resolveSystem?: boolean;
}): string {
  if (locked) {
    return `  const ${variable} = ${JSON.stringify(fallback)};`;
  }

  const read = resolveSystem
    ? `let stored = window.localStorage.getItem(${JSON.stringify(storageKey)});
    if (stored === "system") {
      stored = window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
    }`
    : `const stored = window.localStorage.getItem(${JSON.stringify(storageKey)});`;

  return `  let ${variable} = ${JSON.stringify(fallback)};
  try {
    ${read}
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
    resolveSystem: true,
  });
  const accentLocked = !policy.showAccentPicker;
  const surfaceLocked = !policy.showSurfacePicker;
  // A locked surface still compiles to this constant, unused though it is next to the
  // unconditional attribute removal below: these are the exact bytes Effect Index's pinned
  // CSP hash covers (lib/next/cspObservationPolicy.ts), and the colourway axis's retirement
  // must not move that publication's locked script by a single byte.
  const surface = surfaceLocked ? `\n  const surface = ${JSON.stringify(BASE_SURFACE_ID)};` : "";
  const colorDefaults =
    surfaceLocked && accentLocked
      ? ""
      : `\n  const DEFAULTS = ${JSON.stringify(DEFAULT_APPEARANCE_COLORS)};`;
  // The colour axes: numeric rather than enumerated, so they cannot share
  // buildAxisResolution's membership test. A stored level is a decimal in 0..1 and a stored
  // hue an integer 0..359; anything else — including "" — resolves to the site default,
  // except that a missing hue falls back once more to a saved colourway id through the
  // legacy tables (entries that would be no-ops are filtered out at build time). Each
  // pair's read is gated on the same lock as its parent picker, so a fully locked
  // publication (Effect Index) emits none of this and its script stays byte-identical.
  // Every other reader — including one who never touched a slider — gets the attribute and
  // all four custom properties (stored ?? default) pre-paint, so neither a saved value nor
  // the default ever flashes the authored palette. The stylesheet <link> itself is
  // server-rendered in the layout head — authored HTML the preload scanner fetches in
  // parallel with parsing, not a serial request discovered when this script runs — so the
  // guarded creation below is only a defensive fallback for a document missing that
  // markup, the same idempotent shape as ensureChromaStylesheet. The href's ?v= is the
  // stylesheet's content hash from appearanceChroma.generated.json.
  //
  // The whole write is gated on CSS.supports of the grammar the sheet is built from
  // (CHROMA_SUPPORT_PROBE): Safari 16.4 to 17.x types the relative-colour h channel as an
  // angle and 16.3 and older lacks the syntax, so engaging there would turn every
  // rewritten token invalid and paint the accent, logo and panels blank. Such a browser
  // keeps the authored palette; the sheet's own @supports wrapper makes the
  // server-rendered link harmless there too.
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
    /** An emitted lookup into the resolved style-and-scheme default matrix. */
    defaultLevel: string;
    defaultHue: string;
    /** The BASE name of the look-scoped keys; "-fun"/"-pro" is appended. */
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
    const raw = window.localStorage.getItem(${JSON.stringify(levelKey)} + "-" + style);
    const level = raw ? +raw : NaN;
    if (level >= 0 && level <= 1) ${levelVariable} = level;
  } catch {}
  try {
    const raw = window.localStorage.getItem(${JSON.stringify(hueKey)} + "-" + style);
    if (raw && /^\\d+$/.test(raw) && +raw <= 359) {
      ${hueVariable} = +raw;
    }
  } catch {}
  try {
    // The Fun look inherits the pre-look-global keys exactly once: those keys were
    // written before per-look storage existed, and Fun is the look the reader was
    // almost certainly wearing. Clinical starts fresh — the looks are independent
    // from this build on, while light and dark share a look's coordinates. The
    // provider removes the global keys on hydration, so this fallback answers for
    // one page load only.
    if (style === "fun") {
      const raw = window.localStorage.getItem(${JSON.stringify(levelKey)});
      const level = raw ? +raw : NaN;
      if (level >= 0 && level <= 1) ${levelVariable} = level;
    }
  } catch {}
  try {
    if (style === "fun") {
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
    }
  } catch {}`;
  };
  const chromaResolution = [
    surfaceLocked
      ? ""
      : `\n${chromaRead({
          levelVariable: "chromaSurface",
          hueVariable: "hueSurface",
          defaultLevel: "DEFAULTS[style][scheme].surfaceLevel",
          defaultHue: "DEFAULTS[style][scheme].surfaceHue",
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
          defaultLevel: "DEFAULTS[style][scheme].accentLevel",
          defaultHue: "DEFAULTS[style][scheme].accentHue",
          levelKey: ACCENT_CHROMA_STORAGE_KEY,
          hueKey: ACCENT_HUE_STORAGE_KEY,
          legacyKey: ACCENT_STORAGE_KEY,
          legacyHues: LEGACY_ACCENT_TO_HUE,
        })}`,
  ].join("");
  // The attribute-gated appearance sheets (Pro presentation, light scheme) left the bundled
  // chain: each is a static asset the reader only fetches when their appearance needs it.
  // The server renders the <link> when the flavor DEFAULT needs the sheet, so a branch is
  // emitted here only for the saved-preference case the server cannot know about: an
  // unlocked axis whose resolved value can differ from the default toward the sheet. A
  // locked axis always matches the default, and a default that needs the sheet always has
  // the server-rendered link — either way the branch would be dead bytes, so Effect Index
  // (locked pro, default light) emits none of this and its script stays byte-identical.
  // Insertion is anchored, not appended: the bundled order light-mode → pro → chroma is a
  // cascade contract (pro-theme.css re-overrides equal-specificity light rules by source
  // order), and the anchor lists reproduce it whichever links already exist.
  const lightSheetNeeded = policy.showColorSchemeToggle && policy.defaultColorScheme !== "light";
  const proSheetNeeded = policy.showVisualStyleToggle && policy.defaultVisualStyle !== "pro";
  const sheetWrite =
    !lightSheetNeeded && !proSheetNeeded
      ? ""
      : `\n\n  const addSheet = (id, href, anchorIds) => {
    try {
      if (document.getElementById(id)) return;
      const link = document.createElement("link");
      link.id = id;
      link.rel = "stylesheet";
      link.href = href;
      let anchor = null;
      for (const anchorId of anchorIds) {
        anchor = document.getElementById(anchorId);
        if (anchor) break;
      }
      document.head.insertBefore(link, anchor);
    } catch {}
  };${
          lightSheetNeeded
            ? `
  if (scheme === "light") addSheet(${JSON.stringify(LIGHT_MODE_STYLESHEET_LINK_ID)}, ${JSON.stringify(LIGHT_MODE_STYLESHEET_HREF)}, ${JSON.stringify(LIGHT_MODE_STYLESHEET_ANCHOR_IDS)});`
            : ""
        }${
          proSheetNeeded
            ? `
  if (style === "pro") addSheet(${JSON.stringify(PRO_THEME_STYLESHEET_LINK_ID)}, ${JSON.stringify(PRO_THEME_STYLESHEET_HREF)}, ${JSON.stringify(PRO_THEME_STYLESHEET_ANCHOR_IDS)});`
            : ""
        }`;
  const chromaWrite =
    surfaceLocked && accentLocked
      ? ""
      : `\n\n  if (typeof CSS !== "undefined" && CSS.supports("color", ${JSON.stringify(CHROMA_SUPPORT_PROBE)})) {
    root.dataset.chroma = "";${
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
      if (!document.getElementById(${JSON.stringify(CHROMA_STYLESHEET_LINK_ID)})) {
        const link = document.createElement("link");
        link.id = ${JSON.stringify(CHROMA_STYLESHEET_LINK_ID)};
        link.rel = "stylesheet";
        link.href = ${JSON.stringify(CHROMA_STYLESHEET_HREF)};
        document.head.appendChild(link);
      }
    } catch {}
  }`;
  // The type axes: face picker plus the three reading-type numbers. Emitted only where the
  // toggle is offered, on the locked-axis rule the other axes follow — a locked
  // publication's script carries neither the storage keys nor the attribute write, so
  // Effect Index's pinned bootstrap stays byte-identical. The face key either holds one
  // of the paintable faces or the axis is at its default Standard, which is the *absence*
  // of `data-font` (the server never renders the attribute, and the authored base.css
  // pairing is already what a document with no attribute wears). LEGACY maps the retired
  // binary toggle's stored "dyslexic" onto the Lexend face pre-paint, so a reader who
  // chose the dyslexia-friendly face keeps it without a flash of the default. The three
  // numbers are saved values on their slider domains; anything else reads as
  // "never saved".
  const fontWrite = !policy.showFontToggle
    ? ""
    : `\n\n  const FACES = ${JSON.stringify(
        Object.fromEntries(PAINTED_FONT_PREFERENCES.map((face) => [face, true])),
      )};
  const LEGACY = ${JSON.stringify(LEGACY_FONT_PREFERENCES)};
  try {
    const raw = window.localStorage.getItem(${JSON.stringify(FONT_STORAGE_KEY)});
    const stored = Object.prototype.hasOwnProperty.call(LEGACY, raw) ? LEGACY[raw] : raw;
    if (Object.prototype.hasOwnProperty.call(FACES, stored)) {
      root.dataset.font = stored;
    }
  } catch {}
  ${[
    {
      key: TEXT_SIZE_STORAGE_KEY,
      property: TEXT_SIZE_PROPERTY,
      unit: "",
      min: TEXT_SIZE_RANGE[0],
      max: TEXT_SIZE_RANGE[1],
    },
    {
      key: LETTER_SPACING_STORAGE_KEY,
      property: READER_TRACKING_PROPERTY,
      unit: "em",
      min: READER_TRACKING_RANGE[0],
      max: READER_TRACKING_RANGE[1],
    },
    {
      key: LINE_HEIGHT_STORAGE_KEY,
      property: READER_LEADING_PROPERTY,
      unit: "",
      min: READER_LEADING_RANGE[0],
      max: READER_LEADING_RANGE[1],
      attribute: READER_LEADING_ATTRIBUTE,
    },
  ]
    .map(({ key, property, unit, min, max, attribute }) => {
      // The unit is part of the write: a bare number substitutes into
      // letter-spacing as an invalid value and silently knocks the
      // property back to its inherited value. Leading and the text scale
      // are legitimately unitless numbers.
      const write = property
        ? `root.style.setProperty(${JSON.stringify(property)}, v + ${JSON.stringify(unit)});`
        : 'root.style.fontSize = v + "px";';
      return `try {
    const raw = window.localStorage.getItem(${JSON.stringify(key)});
    const v = raw ? +raw : NaN;
    if (v >= ${min} && v <= ${max}) {
      ${attribute ? `root.setAttribute(${JSON.stringify(attribute)}, "");` : ""}
      ${write}
    }
  } catch {}`;
    })
    .join("\n  ")}`;

  return `(() => {
  const COLORS = ${JSON.stringify(APPEARANCE_META_COLORS)};
${visualStyle}
${colorScheme}${colorDefaults}${surface}${chromaResolution}

  const root = document.documentElement;
  root.dataset.visualStyle = style;
  root.dataset.theme = scheme;
  root.style.colorScheme = scheme;

  delete root.dataset.surface;

  delete root.dataset.accent;${fontWrite}${sheetWrite}${chromaWrite}

  try {
    const meta = document.getElementById(${JSON.stringify(THEME_META_ID)});
    if (meta) {
      meta.setAttribute("content", COLORS[style][scheme]);
    }
  } catch {}
})();`;
}
