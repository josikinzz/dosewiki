import sheetsManifest from "./appearanceSheets.generated.json";
import { CHROMA_STYLESHEET_LINK_ID } from "./appearanceChroma";
// Type-only, so it is erased at compile time: `@/theme` re-exports this module's runtime
// surface, and a value import in this direction would close that into a runtime cycle.
import type { ColorScheme, VisualStyle } from "@/theme";

/**
 * Runtime surface of the two attribute-gated appearance sheets that left the
 * bundled @import chain: the Pro presentation (inert without
 * html[data-visual-style="pro"]) and the light colour scheme (inert without
 * html[data-theme="light"]). A fun+dark reader — the dose.wiki default —
 * downloads neither; every other reader gets exactly the sheet their
 * appearance needs, as its own immutable-cached request.
 *
 * Three attachment paths share this module's constants and agree through the
 * link ids:
 *   1. The server renders a <link> when the flavor's DEFAULT appearance needs
 *      the sheet (layout.tsx) — parser-visible, so the preload scanner fetches
 *      it in parallel with the document.
 *   2. The pre-paint bootstrap injects the <link> when the RESOLVED appearance
 *      needs a sheet the server did not render (buildThemeBootstrapScript) —
 *      render-blocking, so a saved preference never flashes the default look.
 *   3. The provider ensures the sheet before flipping an attribute on a toggle
 *      (applyAppearanceToDocument), so the first switch to Pro or light waits
 *      for the sheet instead of painting the new attribute unstyled.
 *
 * DOM order is part of the contract. In the bundled chain these sheets sat in
 * a fixed order — light-mode, then Pro, then the generated chroma sheet — and
 * pro-theme.css re-overrides several equal-specificity light-mode rules by
 * source order alone (its own comments name the line numbers). The anchor
 * lists below reproduce that order no matter which sheet arrives first.
 */
const LIGHT_MODE_STYLESHEET_ROUTE = "/theme-light-mode.css"
const PRO_THEME_STYLESHEET_ROUTE = "/pro-theme.css"

export const LIGHT_MODE_STYLESHEET_HREF = `${LIGHT_MODE_STYLESHEET_ROUTE}?v=${sheetsManifest.versions.lightMode}`;
export const PRO_THEME_STYLESHEET_HREF = `${PRO_THEME_STYLESHEET_ROUTE}?v=${sheetsManifest.versions.proTheme}`;

/** The one <link> id per sheet, so all three attachment paths agree on idempotence. */
export const LIGHT_MODE_STYLESHEET_LINK_ID = "theme-light-mode";
export const PRO_THEME_STYLESHEET_LINK_ID = "pro-theme";

/**
 * Where each sheet's <link> goes: before the first of these ids that exists,
 * or at the end of <head> when none does. The chroma sheet is last because it
 * re-tints tokens both sheets seed, exactly as it did when it was the only
 * late-attached sheet.
 */
export const LIGHT_MODE_STYLESHEET_ANCHOR_IDS: readonly string[] = [
  PRO_THEME_STYLESHEET_LINK_ID,
  CHROMA_STYLESHEET_LINK_ID,
];
export const PRO_THEME_STYLESHEET_ANCHOR_IDS: readonly string[] = [CHROMA_STYLESHEET_LINK_ID];

/**
 * Idempotently attach one sheet at its anchored position; the bootstrap emits
 * the same shape. Returns the link — existing or created — so a caller can
 * wait for it before flipping the attribute that makes the sheet matter.
 */
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

/**
 * The sheet a colour scheme needs, attached: light needs the light-mode sheet,
 * dark needs nothing (dark values are the token system's base). Null means
 * "nothing to wait for".
 */
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

/** Same contract for the style axis: pro needs the Pro sheet, fun needs nothing. */
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

/**
 * Resolves once the link's sheet is usable — immediately when it already
 * loaded, on `load` otherwise. `error` also resolves rather than rejecting:
 * a failed fetch must degrade to an unstyled flip, never to an appearance
 * toggle that hangs forever.
 */
export function whenStylesheetLoaded(link: HTMLLinkElement): Promise<void> {
  if (link.sheet) {
    return Promise.resolve();
  }
  // Executor form because the project's TS lib target predates Promise.withResolvers.
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
