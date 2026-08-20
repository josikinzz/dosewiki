import chromaManifest from "./appearanceChroma.generated.json";

/**
 * Runtime surface of the saturation appearance axis.
 *
 * The axis's colour maths is CSS (`public/appearance-chroma.css`, built by
 * `npm run generate:chroma-css`); the runtime only writes three things on the
 * root — the engage attribute and up to two level custom properties — and makes
 * sure the stylesheet is present. Kept deliberately tiny and free of heavy
 * imports: `src/theme/index.ts` inlines this module's constants into the
 * pre-paint bootstrap, which ships on every page of both publications.
 *
 * A reader who never moved a slider gets the site defaults — Orchid surfaces at
 * {@link DEFAULT_SURFACE_LEVEL} and the Default accent at {@link DEFAULT_ACCENT_LEVEL} —
 * so the axis engages on every dose.wiki page: the bootstrap writes both level
 * properties (stored ?? default) and attaches the stylesheet pre-paint. Only a
 * publication that locks both colour axes (Effect Index) stays inert.
 */

/** Root attribute every chroma block requires. Absent = the axis is inert. */
export const CHROMA_ATTRIBUTE = "data-chroma";

/** Reader-owned levels, written as inline custom properties on `<html>`. */
export const SURFACE_LEVEL_PROPERTY = "--dw-surface-level";
export const ACCENT_LEVEL_PROPERTY = "--dw-accent-level";

/** URL of the generated stylesheet, and its content-hash cache-buster. */
export const CHROMA_STYLESHEET_ROUTE = "/appearance-chroma.css";
export const CHROMA_STYLESHEET_VERSION: string = chromaManifest.version;
export const CHROMA_STYLESHEET_HREF = `${CHROMA_STYLESHEET_ROUTE}?v=${CHROMA_STYLESHEET_VERSION}`;

/** The one `<link>` id, so bootstrap and provider agree on idempotence. */
export const CHROMA_STYLESHEET_LINK_ID = "appearance-chroma";

/**
 * The site-default levels, applied wherever a reader has no saved decimal. A
 * default is never *written* to storage: absence of the key is what "default"
 * means, so a future default change reaches every reader who never chose.
 */
export const DEFAULT_SURFACE_LEVEL = 0.15;
export const DEFAULT_ACCENT_LEVEL = 0.65;

/**
 * Authored levels per colourway — where each slider rests before the reader
 * moves it, where its tick sits, and the CSS gain denominators. Achromatic
 * colourways (Graphite, Neutral) are absent: their slider is faded.
 */
export const CHROMA_LEVELS: {
  readonly surfaces: Readonly<Record<string, { readonly dark: number; readonly light: number }>>;
  readonly accents: Readonly<Record<string, number>>;
} = chromaManifest.levels;

/**
 * A stored level is a plain decimal in 0..1; anything else reads as null —
 * "the reader never saved one". Callers resolve null to the `DEFAULT_*` level
 * for display and paint; the null itself is the persistence distinction, which
 * is why this does not take a fallback.
 */
export function parseChromaLevel(raw: string | null): number | null {
  if (raw === null || raw === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 && value <= 1 ? value : null;
}

/** Idempotently attach the generated stylesheet; the bootstrap emits the same shape. */
export function ensureChromaStylesheet(): void {
  if (document.getElementById(CHROMA_STYLESHEET_LINK_ID)) return;
  const link = document.createElement("link");
  link.id = CHROMA_STYLESHEET_LINK_ID;
  link.rel = "stylesheet";
  link.href = CHROMA_STYLESHEET_HREF;
  document.head.appendChild(link);
}

/**
 * Write both levels to the root. A level is always a number on an unlocked
 * axis — the reader's saved decimal or the `DEFAULT_*` level — so `null` here
 * means "this axis is locked". With both null (Effect Index) the axis
 * disengages entirely — attribute removed, properties cleared — so the page
 * renders the authored palette. The stylesheet stays attached once fetched;
 * the attribute alone gates it.
 */
export function applyChromaToDocument(
  surfaceLevel: number | null,
  accentLevel: number | null,
): void {
  const root = document.documentElement;
  if (surfaceLevel === null && accentLevel === null) {
    delete root.dataset.chroma;
    root.style.removeProperty(SURFACE_LEVEL_PROPERTY);
    root.style.removeProperty(ACCENT_LEVEL_PROPERTY);
    return;
  }
  root.dataset.chroma = "";
  if (surfaceLevel === null) root.style.removeProperty(SURFACE_LEVEL_PROPERTY);
  else root.style.setProperty(SURFACE_LEVEL_PROPERTY, String(surfaceLevel));
  if (accentLevel === null) root.style.removeProperty(ACCENT_LEVEL_PROPERTY);
  else root.style.setProperty(ACCENT_LEVEL_PROPERTY, String(accentLevel));
  ensureChromaStylesheet();
}
