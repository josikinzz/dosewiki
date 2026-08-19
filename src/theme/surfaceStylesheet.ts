import { BASE_SURFACE_ID, SURFACES, type Surface } from "./surfaces";
import funTokens from "./surfaceFunTokens.generated.json";

export const SURFACE_ATTRIBUTE = "data-surface";
export const SURFACE_STYLESHEET_PATH = "src/styles/surface-tokens.generated.css";
const NOT_PRO = ':where(:not([data-visual-style="pro"]))';

function block(selector: string, declarations: Readonly<Record<string, string>>) {
  const entries = Object.entries(declarations);
  if (!entries.length) return "";
  return `${selector} {\n${entries.map(([key, value]) => `  ${key}: ${value};`).join("\n")}\n}\n`;
}

/**
 * One surface's Fun block. `html:not([data-surface])[data-theme="…"]` for the base surface,
 * `html[data-surface="…"][data-theme="…"]` for a named one — both (0,2,1), because a bare
 * `:not()` carries the specificity of its argument and `:where()` carries none.
 *
 * (0,2,1) ties `pro-theme.css`'s own per-scheme palette blocks, and this sheet is imported
 * after it, so the tie would go to the surface. `:where(:not([data-visual-style="pro"]))` is
 * how a Fun surface stays off a Pro page without buying specificity it does not need
 * elsewhere: it makes the block unmatchable under Pro rather than out-ranked.
 *
 * Nothing else has to suppress this block. The surface axis IS the colourway a reader picks,
 * so there is no second colourway layer for it to yield to; the only rung above it is the
 * Theme Lab's injected user layer, which reaches (0,4,1) by naming `data-theme` four times
 * and therefore wins on specificity from wherever it is injected.
 */
function funSelector(id: string, theme: string, isBase: boolean) {
  const surface = isBase ? `:not([${SURFACE_ATTRIBUTE}])` : `[${SURFACE_ATTRIBUTE}="${id}"]`;
  return `html${surface}[data-theme="${theme}"]${NOT_PRO}`;
}
/**
 * One surface's Pro block, at (0,3,1): a step above the Pro palette it re-tints, so it wins
 * from anywhere in the bundle. Only named surfaces emit one — the base surface under Pro is
 * `pro-theme.css` as authored.
 */
function proSelector(id: string, theme: string, isBase: boolean) {
  const surface = isBase ? `:not([${SURFACE_ATTRIBUTE}])` : `[${SURFACE_ATTRIBUTE}="${id}"]`;
  return `html[data-visual-style="pro"]${surface}[data-theme="${theme}"]`;
}

function blendHex(base: string, tint: string, amount = 0.04) {
  const expand = (value: string) =>
    value.length === 4
      ? `#${value
          .slice(1)
          .split("")
          .map((part) => part + part)
          .join("")}`
      : value;
  const from = expand(base);
  const to = expand(tint);
  const channel = (offset: number) =>
    Math.round(
      Number.parseInt(from.slice(offset, offset + 2), 16) * (1 - amount) +
        Number.parseInt(to.slice(offset, offset + 2), 16) * amount,
    )
      .toString(16)
      .padStart(2, "0");
  return `#${channel(1)}${channel(3)}${channel(5)}`;
}

function proSurface(surface: Surface, theme: "dark" | "light") {
  const tint = surface.tint[theme];
  const dark = theme === "dark";
  const bases = dark
    ? { "--ei-surface": "#191919", "--ei-surface-sunk": "#0c0c0c", "--ei-surface-deep": "#070707", "--ei-border": "#3f3f3f", "--ei-border-strong": "#808080" }
    : { "--ei-surface": "#fbfaf8", "--ei-surface-sunk": "#efeee9", "--ei-surface-deep": "#e4e2db", "--ei-border": "#dcdad3", "--ei-border-strong": "#8b8880" };
  return Object.fromEntries(
    Object.entries(bases).map(([key, value]) => [key, blendHex(value, tint)]),
  );
}

function surfaceCss(surface: Surface) {
  const parts: string[] = [];
  const isBase = surface.id === BASE_SURFACE_ID;
  for (const theme of ["dark", "light"] as const) {
    const fun = funTokens[surface.id][theme] as Record<string, string>;
    parts.push(block(funSelector(surface.id, theme, isBase), fun));
    if (!isBase) {
      parts.push(block(proSelector(surface.id, theme, false), proSurface(surface, theme)));
    }
  }
  return `/* ${surface.label} */\n${parts.filter(Boolean).join("\n")}`;
}

export function buildSurfaceStylesheetCss() {
  return `/* GENERATED FILE — Source: src/theme/surfaces.ts. Regenerate: npm run generate:surface-css */\n\n${SURFACES.map(surfaceCss).join("\n")}`;
}
