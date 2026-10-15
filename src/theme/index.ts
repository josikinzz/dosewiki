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

export type ColorScheme = "light" | "dark";

export type ColorSchemePreference = ColorScheme | "system";

export type VisualStyle = "fun" | "pro";

export type FontPreference =
  | "standard"
  | "lexend"
  | "inter"
  | "blinker"
  | "titillium"
  | "system";

const PAINTED_FONT_PREFERENCES: readonly Exclude<FontPreference, "standard">[] = [
  "lexend",
  "inter",
  "blinker",
  "titillium",
  "system",
];

export const LEGACY_FONT_PREFERENCES: Readonly<Record<string, FontPreference>> = {
  dyslexic: "lexend",
};

export { LEGACY_ACCENT_TO_HUE } from "./accents";
export { LEGACY_SURFACE_TO_HUE } from "./surfaces";

export type Appearance = {
  readonly colorScheme: ColorScheme;
  readonly visualStyle: VisualStyle;
};

export const SUPPORTED_COLOR_SCHEMES =
  THEME_TOKEN_INTERFACE.supportedColorSchemes as readonly ColorScheme[];
export const SUPPORTED_VISUAL_STYLES =
  THEME_TOKEN_INTERFACE.supportedVisualStyles as readonly VisualStyle[];

export const DEFAULT_COLOR_SCHEME = THEME_TOKEN_INTERFACE.defaultColorScheme as ColorScheme;
export const DEFAULT_VISUAL_STYLE = THEME_TOKEN_INTERFACE.defaultVisualStyle as VisualStyle;

export const COLOR_SCHEME_STORAGE_KEY = THEME_TOKEN_INTERFACE.colorSchemeStorageKey;
export const VISUAL_STYLE_STORAGE_KEY = THEME_TOKEN_INTERFACE.visualStyleStorageKey;
export const FONT_STORAGE_KEY = THEME_TOKEN_INTERFACE.fontStorageKey;
export const TEXT_SIZE_STORAGE_KEY = THEME_TOKEN_INTERFACE.textSizeStorageKey;
export const LETTER_SPACING_STORAGE_KEY = THEME_TOKEN_INTERFACE.letterSpacingStorageKey;
export const LINE_HEIGHT_STORAGE_KEY = THEME_TOKEN_INTERFACE.lineHeightStorageKey;
export const ACCENT_STORAGE_KEY = THEME_TOKEN_INTERFACE.accentStorageKey;
export const SURFACE_STORAGE_KEY = THEME_TOKEN_INTERFACE.surfaceStorageKey;
export const SURFACE_CHROMA_STORAGE_KEY = THEME_TOKEN_INTERFACE.surfaceChromaStorageKey;
export const ACCENT_CHROMA_STORAGE_KEY = THEME_TOKEN_INTERFACE.accentChromaStorageKey;
export const SURFACE_HUE_STORAGE_KEY = THEME_TOKEN_INTERFACE.surfaceHueStorageKey;
export const ACCENT_HUE_STORAGE_KEY = THEME_TOKEN_INTERFACE.accentHueStorageKey;
export const THEME_META_ID = THEME_TOKEN_INTERFACE.metaId;

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

export type AppearancePolicy = {
  readonly defaultColorScheme: ColorScheme;
  readonly showColorSchemeToggle: boolean;
  readonly defaultVisualStyle: VisualStyle;
  readonly showVisualStyleToggle: boolean;
  readonly showSurfacePicker: boolean;
  readonly showAccentPicker: boolean;
  readonly showFontToggle: boolean;
};

export function getAppearanceMetaColor({
  colorScheme,
  visualStyle,
}: Pick<Appearance, "colorScheme" | "visualStyle">): string {
  return APPEARANCE_META_COLORS[visualStyle][colorScheme];
}

export function getInitialAppearance(policy: AppearancePolicy = SITE_FLAVOR_CONFIG): Appearance {
  return {
    colorScheme: policy.defaultColorScheme,
    visualStyle: policy.defaultVisualStyle,
  };
}

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
  const surface = surfaceLocked ? `\n  const surface = ${JSON.stringify(BASE_SURFACE_ID)};` : "";
  const colorDefaults =
    surfaceLocked && accentLocked
      ? ""
      : `\n  const DEFAULTS = ${JSON.stringify(DEFAULT_APPEARANCE_COLORS)};`;
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
    defaultLevel: string;
    defaultHue: string;
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
    // almost certainly wearing. Clinical starts fresh; the looks are independent
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
