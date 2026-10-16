import { CHROMA_SUPPORT_PROBE } from "./appearanceChroma";
import funTokenFallbacks from "./surfaceFunTokenFallbacks.generated.json";
import funTokens from "./surfaceFunTokens.generated.json";

export const SURFACE_ATTRIBUTE = "data-surface";

export const SURFACE_STYLESHEET_PATH = "src/styles/surface-tokens.generated.css";

export function surfaceBaseBlockSelector(theme: string): string {
  return `html:not([${SURFACE_ATTRIBUTE}])[data-theme="${theme}"]:where(:not([data-visual-style="pro"]))`;
}

type SchemeTokens = Readonly<Record<string, string>>;

function block(selector: string, declarations: SchemeTokens, indent = ""): string {
  const entries = Object.entries(declarations);
  if (!entries.length) return "";
  const body = entries.map(([key, value]) => `${indent}  ${key}: ${value};`).join("\n");
  return `${indent}${selector} {\n${body}\n${indent}}\n`;
}

function schemeBlocks(selector: string, tokens: SchemeTokens, fallbacks: SchemeTokens): string {
  const recipes = Object.fromEntries(
    Object.keys(fallbacks).filter((key) => key in tokens).map((key) => [key, tokens[key]]),
  );
  const base = block(selector, { ...tokens, ...fallbacks });
  const guarded = block(selector, recipes, "  ");
  return guarded
    ? `${base}\n@supports (color: ${CHROMA_SUPPORT_PROBE}) {\n${guarded}}\n`
    : base;
}

export function buildSurfaceStylesheetCss(): string {
  const base = funTokens.orchid as Record<"dark" | "light", SchemeTokens>;
  const fallbacks = funTokenFallbacks.orchid as Record<"dark" | "light", SchemeTokens>;
  const body = (["dark", "light"] as const)
    .map((theme) => schemeBlocks(surfaceBaseBlockSelector(theme), base[theme], fallbacks[theme]))
    .filter(Boolean)
    .join("\n");
  return `/* GENERATED FILE. Source: src/theme/surfaces.ts. Regenerate: npm run generate:surface-css */\n\n/* Orchid */\n${body}`;
}
