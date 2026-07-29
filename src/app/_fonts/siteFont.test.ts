import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guards for the per-flavor font wiring. These are source-text assertions on purpose:
 * `next/font` is an SWC compile-time transform, so the failure modes here are invisible
 * to `tsc`, to `eslint` and to any test that imports the modules — they only surface as
 * a failed `next build` or as bytes silently added to the wrong publication.
 *
 * Two regressions are pinned:
 *  - a non-literal `next/font` option (e.g. `preload: !isEffectIndex`), which fails the
 *    build on BOTH flavors with "Font loader values must be explicitly written literals";
 *  - `next/font/google` reaching the dose.wiki build, which would add a build-time
 *    fonts.googleapis.com fetch (the loader throws on fetch failure, with no fallback)
 *    and bundle @font-face blocks that flavor never renders.
 */
const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");

const FLAVOR_MODULES = {
  dosewiki: "src/app/_fonts/dosewiki.ts",
  effectindex: "src/app/_fonts/effectindex.ts",
} as const;

function read(relativePath: string): string {
  return fs.readFileSync(path.join(REPO_ROOT, relativePath), "utf8");
}

/** Strip line and block comments so prose is never mistaken for code. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

describe("site font selection", () => {
  it("gives every flavor its own module with a single siteFont export", () => {
    for (const modulePath of Object.values(FLAVOR_MODULES)) {
      const source = stripComments(read(modulePath));

      expect(source).toContain("export const siteFont = ");
      expect(source).toContain('variable: "--font-display"');
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

  it("keeps the Google loader out of the dose.wiki build", () => {
    expect(stripComments(read(FLAVOR_MODULES.dosewiki))).not.toContain("next/font/google");
    expect(stripComments(read(FLAVOR_MODULES.effectindex))).toContain("next/font/google");
  });

  it("selects the module through the @site-font alias rather than in JavaScript", () => {
    const entry = stripComments(read("src/app/fonts.ts"));

    expect(entry).toContain('from "@site-font"');
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
