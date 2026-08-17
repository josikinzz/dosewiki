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

  it("selects the module through the @site-font alias rather than in JavaScript", () => {
    const entry = stripComments(read("src/app/fonts.ts"));

    expect(entry).toContain('export { proFont, siteFont } from "@site-font"');
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
