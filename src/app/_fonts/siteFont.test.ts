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
  it("gives every flavor its own module with the same two exports", () => {
    for (const modulePath of Object.values(FLAVOR_MODULES)) {
      const source = stripComments(read(modulePath));

      expect(source).toContain("export const siteFont = ");
      expect(source).toContain('variable: "--font-display"');
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

  it("registers Titillium once on the publication that already ships it", () => {
    const source = stripComments(read(FLAVOR_MODULES.effectindex));

    expect([...source.matchAll(/localFont\(/g)]).toHaveLength(1);
    expect(source).toContain("export const proFont = siteFont;");
    // Which means that build defines no --font-pro, and pro-theme.css has to ask
    // for the face with a fallback. These two travel together.
    expect(source).not.toContain('"--font-pro"');
    expect(read("src/styles/pro-theme.css")).toContain("var(--font-pro, var(--font-display))");
  });

  it("registers the dyslexic face lazily, and only where the toggle exists", () => {
    const source = stripComments(read(FLAVOR_MODULES.dosewiki));
    const dyslexicRegistration = source.slice(source.indexOf("export const dyslexicFont"));

    // The whole deal: zero Lexend bytes for an untoggled reader. No preload link, swap
    // display, and the one committed variable-font subset covering 400/600/700.
    expect(dyslexicRegistration).toContain('variable: "--font-dyslexic"');
    expect(dyslexicRegistration).toContain("preload: false");
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

  it("registers the label-preview subset on the same terms as the full face", () => {
    const source = stripComments(read(FLAVOR_MODULES.dosewiki));
    const previewRegistration = source.slice(source.indexOf("export const dyslexicPreviewFont"));

    // Same deal as the full face: zero preview bytes for a reader who never opens the
    // panel — no preload link, swap display, the committed 14-glyph subset.
    expect(previewRegistration).toContain('variable: "--font-dyslexic-preview"');
    expect(previewRegistration).toContain("preload: false");
    expect(previewRegistration).toContain('display: "swap"');
    const preview = "public/fonts/lexend/lexend-dyslexic-label-preview.woff2";
    expect(previewRegistration).toContain(preview.replace("public/", "../../../public/"));
    expect(fs.existsSync(path.join(REPO_ROOT, preview))).toBe(true);

    // The subset was generated with --text pinned to this label; if the picker's copy
    // changes, the subset (public/fonts/lexend/README.md has the command) must change
    // with it or the label falls back to the body face.
    const pickerSource = stripComments(read("src/app/_components/FontPicker.tsx"));
    expect(pickerSource).toContain('label: "Dyslexic-friendly"');
    expect(pickerSource).toContain('previewClassName: "theme-font-preview-dyslexic"');

    // Effect Index has no picker, so no preview registration either.
    const effectindex = stripComments(read(FLAVOR_MODULES.effectindex));
    expect(effectindex).toContain("export const dyslexicPreviewFont = null;");
  });

  it("selects the module through the @site-font alias rather than in JavaScript", () => {
    const entry = stripComments(read("src/app/fonts.ts"));

    expect(entry).toContain(
      'export { dyslexicFont, dyslexicPreviewFont, proFont, siteFont } from "@site-font"',
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
