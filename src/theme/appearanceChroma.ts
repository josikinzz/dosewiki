import chromaManifest from "./appearanceChroma.generated.json";

export const CHROMA_SUPPORT_PROBE = "oklch(from red l c calc(h + 1))";

export const CHROMA_ATTRIBUTE = "data-chroma";

export const SURFACE_LEVEL_PROPERTY = "--dw-surface-level";
export const ACCENT_LEVEL_PROPERTY = "--dw-accent-level";

export const SURFACE_HUE_PROPERTY = "--dw-surface-hue";
export const ACCENT_HUE_PROPERTY = "--dw-accent-hue";

const CHROMA_STYLESHEET_ROUTE = "/appearance-chroma.css"
const CHROMA_STYLESHEET_VERSION: string = chromaManifest.version
export const CHROMA_STYLESHEET_HREF = `${CHROMA_STYLESHEET_ROUTE}?v=${CHROMA_STYLESHEET_VERSION}`;

export const CHROMA_STYLESHEET_LINK_ID = "appearance-chroma";

export type AppearanceColorCoordinates = {
  readonly surfaceHue: number;
  readonly surfaceLevel: number;
  readonly accentHue: number;
  readonly accentLevel: number;
};

export const DEFAULT_APPEARANCE_COLORS = {
  fun: {
    light: { surfaceHue: 0, surfaceLevel: 0, accentHue: 238, accentLevel: 0.41 },
    dark: { surfaceHue: 0, surfaceLevel: 0, accentHue: 352, accentLevel: 0.96 },
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

export function parseChromaLevel(raw: string | null): number | null {
  if (raw === null || raw === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 && value <= 1 ? value : null;
}

export function parseHueDegrees(raw: string | null): number | null {
  if (raw === null || !/^\d+$/.test(raw)) return null;
  const value = Number(raw);
  return value <= 359 ? value : null;
}

function ensureChromaStylesheet(): void { if (document.getElementById(CHROMA_STYLESHEET_LINK_ID)) return;
const link = document.createElement("link");
link.id = CHROMA_STYLESHEET_LINK_ID;
link.rel = "stylesheet";
link.href = CHROMA_STYLESHEET_HREF;
document.head.appendChild(link); }

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
  if (
    properties.every(([, value]) => value === null) ||
    typeof CSS === "undefined" ||
    !CSS.supports("color", CHROMA_SUPPORT_PROBE)
  ) {
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
