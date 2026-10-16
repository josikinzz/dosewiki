import { BASE_ACCENT_PRO_SEEDS } from "./accents";

export const ACCENT_ATTRIBUTE = "data-accent";

export const ACCENT_STYLESHEET_PATH = "src/styles/accent-tokens.generated.css";

export function accentDefaultProBlockSelector(theme: string): string {
  return `html[data-visual-style="pro"]:not([${ACCENT_ATTRIBUTE}])[data-theme="${theme}"]`;
}

function block(selector: string, declarations: Readonly<Record<string, string>>): string {
  const body = Object.entries(declarations)
    .map(([token, value]) => `  ${token}: ${value};`)
    .join("\n");
  return `${selector} {\n${body}\n}\n`;
}

const HEADER = `/* GENERATED FILE: do not edit by hand.
   Source: src/theme/accents.ts
   Regenerate: npm run generate:accent-css

   The base accent's Pro seeds, per colour scheme, so dose.wiki's Pro wears the publication's
   own plum instead of pro-theme.css's authored teal; that sheet is Effect Index's
   presentation, shared with dose.wiki's Pro style. The block is keyed on the absence of
   ${ACCENT_ATTRIBUTE} (the retired accent axis's attribute, which nothing writes any more):
   bare :not(), so it keeps the (0,3,1) that out-ranks the Pro palette it re-tints. The Fun
   half emits nothing because Fun's authored palette IS the base accent. Effect Index never
   imports this file, so it keeps the authored teal byte for byte. */
`;

export function buildAccentStylesheetCss(): string {
  const body = (["dark", "light"] as const)
    .map((theme) => block(accentDefaultProBlockSelector(theme), BASE_ACCENT_PRO_SEEDS[theme]))
    .join("\n");
  return `${HEADER}\n/* Default. Fun: authored; Pro: --ei-* seeds */\n${body}`;
}
