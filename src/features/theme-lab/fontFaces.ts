import { facesForValues, type FontChoice, type FontFaceSpec } from "./paletteTokensFonts";

export const THEME_LAB_FONT_STYLE_ID = "theme-lab-fonts";

const registered = new Set<string>();

function declaration(property: string, value: string | undefined): string {
  return value === undefined ? "" : `${property}:${value};`;
}

function buildFontFaceRule(face: FontFaceSpec): string {
  const source = face.src
    ? `url("${face.src}") format("woff2")`
    : face.local
      ? `local("${face.local}")`
      : "";
  return [
    "@font-face{",
    `font-family:"${face.family}";`,
    declaration("font-style", face.style),
    declaration("font-weight", face.weight),
    "font-display:swap;",
    source ? `src:${source};` : "",
    declaration("unicode-range", face.unicodeRange),
    declaration("ascent-override", face.ascentOverride),
    declaration("descent-override", face.descentOverride),
    declaration("line-gap-override", face.lineGapOverride),
    declaration("size-adjust", face.sizeAdjust),
    "}",
  ].join("");
}

export function buildFontFaceCss(choice: FontChoice): string {
  return (choice.faces ?? []).map(buildFontFaceRule).join("");
}

export function ensureFontFaces(values: Iterable<string | undefined | null>): void {
  if (typeof document === "undefined") return;

  const pending = facesForValues(values).filter((choice) => !registered.has(choice.id));
  if (pending.length === 0) return;

  let style = document.getElementById(THEME_LAB_FONT_STYLE_ID);
  if (!style) {
    style = document.createElement("style");
    style.id = THEME_LAB_FONT_STYLE_ID;
    document.head.appendChild(style);
  }

  for (const choice of pending) {
    registered.add(choice.id);
    style.textContent = `${style.textContent ?? ""}${buildFontFaceCss(choice)}`;
  }
}

export function registeredFontChoiceIds(): string[] {
  return [...registered];
}

export function resetFontFaceRegistry(): void {
  registered.clear();
  if (typeof document === "undefined") return;
  document.getElementById(THEME_LAB_FONT_STYLE_ID)?.remove();
}
