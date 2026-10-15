import sheetsManifest from "./appearanceSheets.generated.json";
import { CHROMA_STYLESHEET_LINK_ID } from "./appearanceChroma";
import type { ColorScheme, VisualStyle } from "@/theme";

const LIGHT_MODE_STYLESHEET_ROUTE = "/theme-light-mode.css"
const PRO_THEME_STYLESHEET_ROUTE = "/pro-theme.css"

export const LIGHT_MODE_STYLESHEET_HREF = `${LIGHT_MODE_STYLESHEET_ROUTE}?v=${sheetsManifest.versions.lightMode}`;
export const PRO_THEME_STYLESHEET_HREF = `${PRO_THEME_STYLESHEET_ROUTE}?v=${sheetsManifest.versions.proTheme}`;

export const LIGHT_MODE_STYLESHEET_LINK_ID = "theme-light-mode";
export const PRO_THEME_STYLESHEET_LINK_ID = "pro-theme";

export const LIGHT_MODE_STYLESHEET_ANCHOR_IDS: readonly string[] = [
  PRO_THEME_STYLESHEET_LINK_ID,
  CHROMA_STYLESHEET_LINK_ID,
];
export const PRO_THEME_STYLESHEET_ANCHOR_IDS: readonly string[] = [CHROMA_STYLESHEET_LINK_ID];

function ensureAppearanceStylesheet(
  id: string,
  href: string,
  anchorIds: readonly string[],
): HTMLLinkElement {
  const existing = document.getElementById(id);
  if (existing instanceof HTMLLinkElement) {
    return existing;
  }
  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href = href;
  let anchor: HTMLElement | null = null;
  for (const anchorId of anchorIds) {
    anchor = document.getElementById(anchorId);
    if (anchor) break;
  }
  document.head.insertBefore(link, anchor);
  return link;
}

export function ensureColorSchemeStylesheet(colorScheme: ColorScheme): HTMLLinkElement | null {
  if (colorScheme !== "light") {
    return null;
  }
  return ensureAppearanceStylesheet(
    LIGHT_MODE_STYLESHEET_LINK_ID,
    LIGHT_MODE_STYLESHEET_HREF,
    LIGHT_MODE_STYLESHEET_ANCHOR_IDS,
  );
}

export function ensureVisualStyleStylesheet(visualStyle: VisualStyle): HTMLLinkElement | null {
  if (visualStyle !== "pro") {
    return null;
  }
  return ensureAppearanceStylesheet(
    PRO_THEME_STYLESHEET_LINK_ID,
    PRO_THEME_STYLESHEET_HREF,
    PRO_THEME_STYLESHEET_ANCHOR_IDS,
  );
}

export function whenStylesheetLoaded(link: HTMLLinkElement): Promise<void> {
  if (link.sheet) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const settle = () => {
      link.removeEventListener("load", settle);
      link.removeEventListener("error", settle);
      resolve();
    };
    link.addEventListener("load", settle);
    link.addEventListener("error", settle);
  });
}
