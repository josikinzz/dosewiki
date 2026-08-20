import chromaManifest from "./appearanceChroma.generated.json";

/**
 * Runtime surface of the saturation and hue appearance axes.
 *
 * The axes' colour maths is CSS (`public/appearance-chroma.css`, built by
 * `npm run generate:chroma-css`); the runtime only writes five things on the
 * root — the engage attribute, up to two level custom properties and up to two
 * hue-shift custom properties — and makes sure the stylesheet is present. Kept
 * deliberately tiny and free of heavy imports: `src/theme/index.ts` inlines
 * this module's constants into the pre-paint bootstrap, which ships on every
 * page of both publications.
 *
 * A reader who never moved a slider gets the site defaults — the authored hues
 * at {@link DEFAULT_SURFACE_HUE}/{@link DEFAULT_ACCENT_HUE}, Orchid surfaces at
 * {@link DEFAULT_SURFACE_LEVEL} and the Default accent at {@link DEFAULT_ACCENT_LEVEL} —
 * so the axes engage on every dose.wiki page: the bootstrap writes all four
 * properties (stored ?? default) and attaches the stylesheet pre-paint. Only a
 * publication that locks both colour axes (Effect Index) stays inert.
 */

/** Root attribute every chroma block requires. Absent = the axis is inert. */
export const CHROMA_ATTRIBUTE = "data-chroma";

/** Reader-owned levels, written as inline custom properties on `<html>`. */
export const SURFACE_LEVEL_PROPERTY = "--dw-surface-level";
export const ACCENT_LEVEL_PROPERTY = "--dw-accent-level";

/** Reader-owned hue rotations, written as inline custom properties on `<html>`. */
export const SURFACE_HUE_PROPERTY = "--dw-surface-hue";
export const ACCENT_HUE_PROPERTY = "--dw-accent-hue";

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
 *
 * The surface default is per visual style — one stored knob still drives both
 * styles, but the *resting* look differs: Fun opens on the authored Orchid
 * tint softened to 0.15, while Pro opens on its authored untinted charcoal,
 * level 0 — the Pro surface blocks are additive (`c + K × level`), so 0 is
 * the authored palette itself. The style is resolved at apply time: the
 * bootstrap picks the default from the style it just resolved, and the
 * provider recomputes it when the style flips with nothing saved.
 */
export const DEFAULT_SURFACE_LEVEL = 0.15;
export const DEFAULT_PRO_SURFACE_LEVEL = 0;
export const DEFAULT_ACCENT_LEVEL = 0.65;

/**
 * The site-default hue rotations: 0 degrees is the authored palette (Orchid
 * surfaces, the Default plum accent). Same persistence rule as the levels —
 * a default is never written to storage, absence of the key means default.
 */
export const DEFAULT_SURFACE_HUE = 0;
export const DEFAULT_ACCENT_HUE = 0;

/**
 * Authored levels of the base colourways — where each slider rests before the
 * reader moves it, where its tick sits, and the CSS gain denominators.
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

/**
 * A stored hue is an integer degree count in 0..359; anything else reads as
 * null — "the reader never saved one" — with the same null-vs-default split
 * as {@link parseChromaLevel}.
 */
export function parseHueDegrees(raw: string | null): number | null {
  if (raw === null || !/^\d+$/.test(raw)) return null;
  const value = Number(raw);
  return value <= 359 ? value : null;
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
 * Write both axes to the root. A level or hue is always a number on an
 * unlocked axis — the reader's saved value or the `DEFAULT_*` one — so `null`
 * here means "this axis is locked". With all four null (Effect Index) the
 * axes disengage entirely — attribute removed, properties cleared — so the
 * page renders the authored palette. The stylesheet stays attached once
 * fetched; the attribute alone gates it.
 */
export function applyChromaToDocument(
  surfaceLevel: number | null,
  accentLevel: number | null,
  surfaceHue: number | null,
  accentHue: number | null,
): void {
  const root = document.documentElement;
  const properties: readonly [property: string, value: string | null][] = [
    [SURFACE_LEVEL_PROPERTY, surfaceLevel === null ? null : String(surfaceLevel)],
    [ACCENT_LEVEL_PROPERTY, accentLevel === null ? null : String(accentLevel)],
    [SURFACE_HUE_PROPERTY, surfaceHue === null ? null : String(surfaceHue)],
    [ACCENT_HUE_PROPERTY, accentHue === null ? null : String(accentHue)],
  ];
  if (properties.every(([, value]) => value === null)) {
    delete root.dataset.chroma;
    for (const [property] of properties) root.style.removeProperty(property);
    return;
  }
  root.dataset.chroma = "";
  for (const [property, value] of properties) {
    if (value === null) root.style.removeProperty(property);
    else root.style.setProperty(property, value);
  }
  ensureChromaStylesheet();
}
