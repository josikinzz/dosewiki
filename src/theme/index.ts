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

export function getThemeMetaColor(theme: ThemeName) {
  return THEME_META_COLORS[theme];
}

export function buildThemeBootstrapScript() {
  const storageKey = JSON.stringify(THEME_STORAGE_KEY);
  const defaultTheme = JSON.stringify(DEFAULT_THEME);
  const metaId = JSON.stringify(THEME_META_ID);
  const themes = JSON.stringify(THEME_META_COLORS);

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
