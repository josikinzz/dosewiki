import { facesForValues, type FontChoice, type FontFaceSpec } from "./paletteTokensFonts";

/**
 * Lazy `@font-face` registration for the faces this build did not ship.
 *
 * `next/font` is a compile-time transform: a dose.wiki build emits the dose.wiki
 * face and nothing else, which is exactly the property that keeps the site
 * light. So the Theme Lab does not ask that pipeline for the sibling flavor's
 * face — it declares it here instead, the first time a visitor's rendered theme
 * actually names it.
 *
 * The registration is idempotent and additive: one `<style>` element, appended
 * to, never rewritten. Declaring a face is not fetching it — the browser only
 * downloads a woff2 once some rendered text resolves to that face — so the
 * costs stack up as: never selected → no declaration and no bytes; selected →
 * a declaration and only the subsets the page's glyphs actually need.
 *
 * Deliberately framework-free. The runtime calls it on every apply (first load,
 * live edit, cross-tab adoption), which is the one place that knows what is
 * really rendering.
 */

/** Element holding the lazily-registered faces. Distinct from the token override
 *  element, which is rewritten wholesale on every change — faces are only ever
 *  added, and re-writing them would restart in-flight downloads. */
export const THEME_LAB_FONT_STYLE_ID = "theme-lab-fonts";

/** Choice ids already declared in this document. */
const registered = new Set<string>();

function declaration(property: string, value: string | undefined): string {
  return value === undefined ? "" : `${property}:${value};`;
}

/** One `@font-face` rule. Pure, so the emitted CSS is assertable without a DOM. */
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
    // `swap` and not `optional`: a visitor who deliberately picked this face
    // should end up wearing it even on a slow connection. The metric-matched
    // fallback in the same table is what makes that swap cheap.
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

/** Every rule one choice needs, in declaration order. */
export function buildFontFaceCss(choice: FontChoice): string {
  return (choice.faces ?? []).map(buildFontFaceRule).join("");
}

/**
 * Declare whatever faces these token values need, once.
 *
 * Takes rendered *values* rather than choice ids so the caller never has to
 * know how a value maps to a face — a preset that ships a stack, an imported
 * theme, and a click in the picker all arrive here the same way.
 */
export function ensureFontFaces(values: Iterable<string | undefined | null>): void {
  if (typeof document === "undefined") return;

  const pending = facesForValues(values).filter((choice) => !registered.has(choice.id));
  if (pending.length === 0) return;

  let style = document.getElementById(THEME_LAB_FONT_STYLE_ID);
  if (!style) {
    style = document.createElement("style");
    style.id = THEME_LAB_FONT_STYLE_ID;
    // Appended to <head> after the stylesheet, like the token override element.
    // Order does not matter for @font-face — a face is looked up by name, not
    // by cascade — but keeping both of the lab's injected elements in the same
    // place keeps "what did the lab add to this document" a single question.
    document.head.appendChild(style);
  }

  for (const choice of pending) {
    registered.add(choice.id);
    style.textContent = `${style.textContent ?? ""}${buildFontFaceCss(choice)}`;
  }
}

/** Which choices this document has declared. Test-facing. */
export function registeredFontChoiceIds(): string[] {
  return [...registered];
}

/** Forget the registration (and drop the element), so a test can assert the
 *  never-selected case from a clean document. */
export function resetFontFaceRegistry(): void {
  registered.clear();
  if (typeof document === "undefined") return;
  document.getElementById(THEME_LAB_FONT_STYLE_ID)?.remove();
}
