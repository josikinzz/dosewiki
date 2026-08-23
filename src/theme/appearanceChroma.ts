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
 * A reader who never moved a slider gets the current visual-style and
 * colour-scheme combination's defaults. The axes therefore engage on every
 * dose.wiki page: the layout server-renders the stylesheet `<link>`
 * (parser-discoverable, fetched in parallel with the HTML) and the bootstrap
 * writes all four properties (stored ?? appearance default) pre-paint.
 * Only a publication that locks both colour axes (Effect Index) stays inert —
 * and skips the `<link>` entirely.
 */

/** Root attribute every chroma block requires. Absent = the axis is inert. */
export const CHROMA_ATTRIBUTE = "data-chroma";

/** Reader-owned levels, written as inline custom properties on `<html>`. */
export const SURFACE_LEVEL_PROPERTY = "--dw-surface-level";
export const ACCENT_LEVEL_PROPERTY = "--dw-accent-level";

/** Reader-owned hue rotations, written as inline custom properties on `<html>`. */
export const SURFACE_HUE_PROPERTY = "--dw-surface-hue";
export const ACCENT_HUE_PROPERTY = "--dw-accent-hue";

/**
 * URL of the generated stylesheet, and its content-hash cache-buster. Because any
 * change to the sheet changes this URL, `next.config.ts` serves the route with
 * `Cache-Control: immutable`: repeat visitors never pay a revalidation round-trip.
 */
export const CHROMA_STYLESHEET_ROUTE = "/appearance-chroma.css";
export const CHROMA_STYLESHEET_VERSION: string = chromaManifest.version;
export const CHROMA_STYLESHEET_HREF = `${CHROMA_STYLESHEET_ROUTE}?v=${CHROMA_STYLESHEET_VERSION}`;

/** The one `<link>` id, so bootstrap and provider agree on idempotence. */
export const CHROMA_STYLESHEET_LINK_ID = "appearance-chroma";

/**
 * The site-default coordinates, applied wherever a reader has no saved
 * number. A default is never *written* to storage: absence of the key is what
 * "default" means, so a future default change reaches every reader who never
 * chose.
 *
 * Defaults are resolved from both appearance axes. One stored knob still
 * drives every combination, but each unsaved Fun/Pro × light/dark appearance
 * has its own resting coordinates. The bootstrap resolves the matrix entry
 * from the style and scheme it just painted, and the provider recomputes it
 * whenever either axis flips with nothing saved.
 */
export type AppearanceColorCoordinates = {
  readonly surfaceHue: number;
  readonly surfaceLevel: number;
  readonly accentHue: number;
  readonly accentLevel: number;
};

export const DEFAULT_APPEARANCE_COLORS = {
  fun: {
    light: { surfaceHue: 0, surfaceLevel: 0, accentHue: 238, accentLevel: 0.41 },
    dark: { surfaceHue: 0, surfaceLevel: 0.21, accentHue: 352, accentLevel: 0.96 },
  },
  pro: {
    light: { surfaceHue: 222, surfaceLevel: 0, accentHue: 217, accentLevel: 0.65 },
    dark: { surfaceHue: 0, surfaceLevel: 0, accentHue: 217, accentLevel: 0.5 },
  },
} as const satisfies Record<
  "fun" | "pro",
  Record<"light" | "dark", AppearanceColorCoordinates>
>;

export function getDefaultAppearanceColors(
  visualStyle: "fun" | "pro",
  colorScheme: "light" | "dark",
): AppearanceColorCoordinates {
  return DEFAULT_APPEARANCE_COLORS[visualStyle][colorScheme];
}

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
 * "the reader never saved one". Callers resolve null through
 * {@link getDefaultAppearanceColors}; the null itself is the persistence distinction, which
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

/**
 * Defensive idempotence: the root layout server-renders this exact `<link>` and the
 * bootstrap emits the same guarded shape, so creating one here is only a fallback for a
 * document somehow missing that markup — the check keeps all three owners duplicate-free.
 */
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
 * fetched; the attribute alone gates it. Synchronous by design — one call is
 * one write batch; the provider rAF-throttles its calls during a slider drag.
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
