import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guards for the per-flavor font wiring. These are source-text assertions on purpose:
 * `next/font` is an SWC compile-time transform, so the failure modes here are invisible
 * to `tsc`, to `eslint` and to any test that imports the modules — they only surface as
 * a failed `next build` or as bytes silently added to the wrong publication.
 *
 * Four regressions are pinned:
 *  - a non-literal `next/font` option (e.g. `preload: !isEffectIndex`), which fails the
 *    build on BOTH flavors with "Font loader values must be explicitly written literals";
 *  - `next/font/google` reaching either build, which would add a build-time
 *    fonts.googleapis.com fetch (the loader throws on fetch failure, with no fallback)
 *    for a face that is already committed as woff2 in this repo;
 *  - a preloaded Pro face on dose.wiki, where Pro is a reader preference: a preload link
 *    downloads the face for every Fun reader who will never see it;
 *  - a second registration of Titillium on Effect Index, where it is already the build's
 *    own face. `next/font` folds the preload flag into the emitted filename, so the two
 *    registrations would not even dedupe — the build would ship the bytes twice and
 *    preload the copy that nothing paints.
 */
const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");

const FLAVOR_MODULES = {
  dosewiki: "src/app/_fonts/dosewiki.ts",
  effectindex: "src/app/_fonts/effectindex.ts",
} as const;

/**
 * The Pro face. `base.css` sets `font-synthesis: none`, so every weight and slope the
 * sheet asks for needs a real file: a missing 600 renders at 400 rather than faking it.
 */
const PRO_FACES = [
  "public/fonts/titillium-web/titillium-web-400-normal-latin.woff2",
  "public/fonts/titillium-web/titillium-web-400-italic-latin.woff2",
  "public/fonts/titillium-web/titillium-web-600-normal-latin.woff2",
  "public/fonts/titillium-web/titillium-web-700-normal-latin.woff2",
] as const;

function read(relativePath: string): string {
  return fs.readFileSync(path.join(REPO_ROOT, relativePath), "utf8");
}

/** Strip line and block comments so prose is never mistaken for code. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

describe("site font selection", () => {
  it("gives every flavor its own module with the same exports", () => {
    for (const modulePath of Object.values(FLAVOR_MODULES)) {
      const source = stripComments(read(modulePath));

      expect(source).toContain("export const siteFont = ");
      expect(source).toContain('variable: "--font-display"');
      expect(source).toMatch(/export const bodyFont = /);
      expect(source).toMatch(/export const proFont = /);
    }
  });

  it("passes only written literals to the font loaders", () => {
    for (const modulePath of Object.values(FLAVOR_MODULES)) {
      const source = stripComments(read(modulePath));
      const optionValues = [...source.matchAll(/^\s{2}([A-Za-z]+):\s*(.+?),?\s*$/gm)];

      expect(optionValues.length).toBeGreaterThan(0);

      for (const [, option, value] of optionValues) {
        // A bare identifier or any operator on the right-hand side means the SWC
        // transform cannot fold the value and the build fails.
        expect(`${option}: ${value}`).toMatch(/^[A-Za-z]+: ("|\[|\{|true$|false$|\d)/);
      }
    }
  });

  it("keeps the Google loader out of both builds", () => {
    for (const modulePath of Object.values(FLAVOR_MODULES)) {
      expect(stripComments(read(modulePath))).not.toContain("next/font/google");
    }
  });

  it("registers the Pro face from the committed subsets, at every weight the sheet uses", () => {
    const source = stripComments(read(FLAVOR_MODULES.dosewiki));

    for (const face of PRO_FACES) {
      expect(source).toContain(face.replace("public/", "../../../public/"));
      expect(fs.existsSync(path.join(REPO_ROOT, face))).toBe(true);
    }
  });

  it("never preloads the Pro face where Pro is optional", () => {
    const source = stripComments(read(FLAVOR_MODULES.dosewiki));
    const proRegistration = source.slice(source.indexOf("export const proFont"));

    expect(proRegistration).toContain("preload: false");
    expect(proRegistration).toContain('display: "swap"');
    expect(proRegistration).toContain('variable: "--font-pro"');
    // The Fun face is the one this build always paints, so it keeps its preload.
    expect(source.slice(0, source.indexOf("export const proFont"))).not.toContain("preload");
  });

  it("registers the Inter body face from the committed variable subsets, preloaded, on dose.wiki only", () => {
    const source = stripComments(read(FLAVOR_MODULES.dosewiki));
    const start = source.indexOf("export const bodyFont");
    expect(start).toBeGreaterThan(-1);
    const bodyRegistration = source.slice(start, source.indexOf("export const proFont"));

    // The reading face of every page: `base.css` leads --font-family-standard-body with
    // --font-body, so it keeps the display face's preload rather than the Pro face's
    // lazy terms. Both slopes are real variable files: with font-synthesis: none, a
    // missing italic would render upright.
    expect(bodyRegistration).toContain('variable: "--font-body"');
    expect(bodyRegistration).toContain('display: "swap"');
    expect(bodyRegistration).not.toContain("preload");
    expect(bodyRegistration.match(/weight: "100 900"/g)).toHaveLength(2);
    for (const face of [
      "public/fonts/inter/inter-variable-normal-latin.woff2",
      "public/fonts/inter/inter-variable-italic-latin.woff2",
    ]) {
      expect(bodyRegistration).toContain(face.replace("public/", "../../../public/"));
      expect(fs.existsSync(path.join(REPO_ROOT, face))).toBe(true);
    }
    expect(fs.existsSync(path.join(REPO_ROOT, "public/fonts/inter/OFL.txt"))).toBe(true);
    // Collapsed whitespace: the contract is the declaration's fallback order, not the
    // line the formatter happens to wrap it onto.
    expect(read("src/styles/base.css").replace(/\s+/g, " ")).toContain(
      "--font-family-standard-body: var(--font-body, Inter), Inter,",
    );

    // Effect Index sets its body in Titillium and must not ship Inter bytes or preloads.
    const effectindex = stripComments(read(FLAVOR_MODULES.effectindex));
    expect(effectindex).toContain("export const bodyFont = null;");
    expect(effectindex.toLowerCase()).not.toContain("inter");
  });

  it("registers Titillium once on the publication that already ships it", () => {
    const source = stripComments(read(FLAVOR_MODULES.effectindex));

    expect([...source.matchAll(/localFont\(/g)]).toHaveLength(1);
    expect(source).toContain("export const proFont = siteFont;");
    // Which means that build defines no --font-pro, and pro-theme.css has to ask
    // for the face with a fallback. These two travel together.
    expect(source).not.toContain('"--font-pro"');
    expect(read("src/styles/pro-theme.css")).toContain("var(--font-pro, var(--font-display))");
  });

  it("registers the default face preloaded, and only where the font axis exists", () => {
    const source = stripComments(read(FLAVOR_MODULES.dosewiki));
    const dyslexicRegistration = source.slice(source.indexOf("export const dyslexicFont"));

    // Lexend is the site's default reading face: it paints on every page, so it carries
    // the body face's preload rather than the Pro face's lazy terms. Swap display, and
    // the one committed variable-font subset covering 400/600/700.
    expect(dyslexicRegistration).toContain('variable: "--font-dyslexic"');
    expect(dyslexicRegistration).toContain("preload: true");
    expect(dyslexicRegistration).toContain('display: "swap"');
    expect(dyslexicRegistration).toContain('weight: "100 900"');
    const face = "public/fonts/lexend/lexend-variable-normal-latin.woff2";
    expect(dyslexicRegistration).toContain(face.replace("public/", "../../../public/"));
    expect(fs.existsSync(path.join(REPO_ROOT, face))).toBe(true);

    // Effect Index locks the axis (showFontToggle: false), so that build must not even
    // emit the @font-face block — the export is a null, not a registration.
    const effectindex = stripComments(read(FLAVOR_MODULES.effectindex));
    expect(effectindex).toContain("export const dyslexicFont = null;");
    expect(effectindex.toLowerCase()).not.toContain("lexend");
  });

  it("offers the five bundled faces from the picker, each label set in its face", () => {
    // The picker is the font axis's whole surface: the default first (re-selecting it is
    // "removing" the choice, on the never-write-a-default rule), then the other faces
    // this build already ships, then the reader's own system sans. No option may name a
    // face the repo does not commit.
    const pickerSource = stripComments(read("src/app/_components/FontPicker.tsx"));

    const options = [...pickerSource.matchAll(/value: "([a-z]+)",\s*\n\s*label: "([^"]+)",\s*\n\s*labelClassName: "([^"]+)"/g)];
    expect(options.map(([, value]) => value)).toEqual([
      "lexend",
      "inter",
      "blinker",
      "titillium",
      "system",
    ]);
    expect(options.map(([, , label]) => label)).toEqual([
      "Lexend",
      "Inter",
      "Blinker",
      "Titillium Web",
      "System UI",
    ]);
    for (const [, , , className] of options) {
      expect(read("src/styles/font-type.css")).toContain(`.${className} {`);
    }

    // The re-seats behind those previews must name the committed faces: the picker can
    // only offer what `font-type.css` can actually paint.
    const fontSheet = stripComments(read("src/styles/font-type.css"));
    for (const face of [
      "public/fonts/lexend/lexend-variable-normal-latin.woff2",
      "public/fonts/inter/inter-variable-normal-latin.woff2",
      "public/fonts/titillium-web/titillium-web-400-normal-latin.woff2",
    ]) {
      expect(read("src/app/_fonts/dosewiki.ts")).toContain(face.replace("public/", "../../../public/"));
    }
    expect(fontSheet).toContain("html[data-site=\"dosewiki\"][data-site][data-site]:not([data-font])");
    for (const face of ["inter", "blinker", "titillium", "system"]) {
      expect(fontSheet).toContain(`html[data-font="${face}"][data-font][data-font]`);
    }
  });

  it("selects the module through the @site-font alias rather than in JavaScript", () => {
    const entry = stripComments(read("src/app/fonts.ts"));

    expect(entry).toContain(
      'export { bodyFont, dyslexicFont, proFont, siteFont } from "@site-font"',
    );
    expect(entry).not.toContain("next/font");
    expect(entry).not.toContain("siteFlavor");
  });

  it("resolves @site-font for both bundlers and for TypeScript", () => {
    const config = stripComments(read("next.config.ts"));

    for (const modulePath of Object.values(FLAVOR_MODULES)) {
      expect(config).toContain(`"./${modulePath}"`);
    }

    // Turbopack (the default for `next build`/`next dev`) and webpack each need
    // their own alias; a missing one only shows up on whichever bundler is used.
    expect(config).toMatch(/resolveAlias:\s*\{\s*"@site-font":/);
    expect(config).toContain('"@site-font": path.resolve(');

    expect(read("tsconfig.json")).toContain('"@site-font"');
  });
});
