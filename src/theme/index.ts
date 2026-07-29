import { SITE_FLAVOR_CONFIG, type SiteFlavorConfig } from "@/config/siteFlavor";
import tokenInterface from "./theme-token-interface.json";

export const THEME_TOKEN_INTERFACE = tokenInterface;

export type ThemeName = (typeof THEME_TOKEN_INTERFACE.supportedThemes)[number];

export const SUPPORTED_THEMES = THEME_TOKEN_INTERFACE.supportedThemes as readonly ThemeName[];
export const DEFAULT_THEME = THEME_TOKEN_INTERFACE.defaultTheme as ThemeName;
export const THEME_STORAGE_KEY = THEME_TOKEN_INTERFACE.storageKey;
export const THEME_META_ID = THEME_TOKEN_INTERFACE.metaId;
export const THEME_META_COLORS = THEME_TOKEN_INTERFACE.metaColors as Record<ThemeName, string>;

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

export function isThemeName(value: string | null | undefined): value is ThemeName {
  return SUPPORTED_THEMES.includes(value as ThemeName);
}

/**
 * Browser-chrome tint per theme for one publication.
 *
 * A flavor that pins itself to a single theme ({@link SiteFlavorConfig.lockedTheme}) tints
 * that theme with its own `manifest.themeColor`, so the address bar matches the page the
 * reader actually gets instead of the shared lilac-white. A flavor whose readers choose
 * their own theme keeps the shared map — identity, same object, no delta.
 */
export function getThemeMetaColors(
  config: SiteFlavorConfig = SITE_FLAVOR_CONFIG,
): Readonly<Record<ThemeName, string>> {
  const lockedTheme = config.lockedTheme;

  if (!lockedTheme) {
    return THEME_META_COLORS;
  }

  return { ...THEME_META_COLORS, [lockedTheme]: config.manifest.themeColor };
}

export function getThemeMetaColor(theme: ThemeName, config: SiteFlavorConfig = SITE_FLAVOR_CONFIG) {
  return getThemeMetaColors(config)[theme];
}

/**
 * The theme the server must render for: a locked flavor's pinned theme, otherwise the
 * shared default the bootstrap falls back to. Rendering the matching `theme-color` meta
 * value keeps the browser chrome from flashing the wrong tint before hydration.
 */
export function getInitialTheme(config: SiteFlavorConfig = SITE_FLAVOR_CONFIG): ThemeName {
  return config.lockedTheme ?? DEFAULT_THEME;
}

export type ThemeBootstrapOptions = {
  /**
   * Theme to apply unconditionally. When set, the emitted script never reads the stored
   * preference — it is not consulted and then overridden, it is never consulted at all.
   */
  lockedTheme?: ThemeName | null;
  /**
   * Theme → `theme-color` map. Doubles as the validity set for the stored preference on
   * the unlocked path, so it must stay a full map over the supported themes.
   */
  metaColors?: Readonly<Record<ThemeName, string>>;
};

export function buildThemeBootstrapScript({
  lockedTheme = SITE_FLAVOR_CONFIG.lockedTheme,
  metaColors = getThemeMetaColors(),
}: ThemeBootstrapOptions = {}) {
  const storageKey = JSON.stringify(THEME_STORAGE_KEY);
  const defaultTheme = JSON.stringify(DEFAULT_THEME);
  const metaId = JSON.stringify(THEME_META_ID);
  const themes = JSON.stringify(metaColors);

  if (lockedTheme) {
    // No STORAGE_KEY, no getItem, no validity check: on a locked flavor the stored
    // preference is not part of the resolution at all. The catch re-applies the same
    // locked theme so a throwing meta lookup still leaves a valid theme on the document.
    return `(() => {
  const THEME = ${JSON.stringify(lockedTheme)};
  const THEMES = ${themes};

  try {
    document.documentElement.dataset.theme = THEME;
    document.documentElement.style.colorScheme = THEME;

    const meta = document.getElementById(${metaId});
    if (meta) {
      meta.setAttribute("content", THEMES[THEME]);
    }
  } catch {
    document.documentElement.dataset.theme = THEME;
    document.documentElement.style.colorScheme = THEME;
  }
})();`;
  }

  return `(() => {
  const STORAGE_KEY = ${storageKey};
  const DEFAULT_THEME = ${defaultTheme};
  const THEMES = ${themes};

  try {
    const storedTheme = window.localStorage.getItem(STORAGE_KEY);
    const theme = Object.prototype.hasOwnProperty.call(THEMES, storedTheme) ? storedTheme : DEFAULT_THEME;
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;

    const meta = document.getElementById(${metaId});
    if (meta) {
      meta.setAttribute("content", THEMES[theme]);
    }
  } catch {
    document.documentElement.dataset.theme = DEFAULT_THEME;
    document.documentElement.style.colorScheme = DEFAULT_THEME;
  }
})();`;
}
