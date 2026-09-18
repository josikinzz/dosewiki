import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  LIGHT_MODE_STYLESHEET_ANCHOR_IDS,
  LIGHT_MODE_STYLESHEET_HREF,
  LIGHT_MODE_STYLESHEET_LINK_ID,
  PRO_THEME_STYLESHEET_ANCHOR_IDS,
  PRO_THEME_STYLESHEET_HREF,
  PRO_THEME_STYLESHEET_LINK_ID,
} from "./appearanceSheets";
import { CHROMA_STYLESHEET_LINK_ID } from "./appearanceChroma";
import sheetsManifest from "./appearanceSheets.generated.json";

/**
 * The same staleness comparison `npm run generate:appearance-sheets -- --check`
 * performs, run in the suite: the copies in public/ are what the browser
 * fetches, the files in src/styles/ are what humans edit, and nothing else
 * keeps them from drifting apart.
 */
const SHEETS = [
  {
    key: "proTheme" as const,
    source: "src/styles/pro-theme.css",
    copy: "public/pro-theme.css",
    href: PRO_THEME_STYLESHEET_HREF,
  },
  {
    key: "lightMode" as const,
    source: "src/styles/theme-light-mode.css",
    copy: "public/theme-light-mode.css",
    href: LIGHT_MODE_STYLESHEET_HREF,
  },
];

describe("published appearance sheets", () => {
  for (const { key, source, copy, href } of SHEETS) {
    const authored = readFileSync(resolve(process.cwd(), source), "utf8");

    it(`serves ${source} byte-for-byte from ${copy}`, () => {
      expect(readFileSync(resolve(process.cwd(), copy), "utf8")).toBe(authored);
    });

    it(`versions the ${key} href with the authored sheet's content hash`, () => {
      const version = createHash("sha256").update(authored).digest("hex").slice(0, 8);
      expect(sheetsManifest.versions[key]).toBe(version);
      expect(href.endsWith(`?v=${version}`)).toBe(true);
    });
  }

  it("keeps the light sheet gated on the light scheme and the Pro sheet on the Pro style", () => {
    // The whole premise of serving these separately is that a reader who lacks
    // the attribute pays nothing but bytes. An ungated selector would style the
    // readers who deliberately did NOT load the sheet's look — the universal
    // reduced-motion rules that once hid at the bottom of theme-light-mode.css
    // now live in theme-overrides.css for exactly this reason.
    const stripped = (css: string) =>
      css.replace(/\/\*[\s\S]*?\*\//g, "").replace(/@media[^{]*\{/g, "");
    const lightSelectors = [
      ...stripped(readFileSync(resolve(process.cwd(), "src/styles/theme-light-mode.css"), "utf8"))
        .matchAll(/(^|\})\s*([^{}]+)\{/g),
    ].map((match) => match[2]!.trim());
    for (const selector of lightSelectors) {
      expect(selector, selector).toContain('[data-theme="light"]');
    }
    // pro-theme.css's own gate is pinned selector-by-selector in proTheme.test.ts.
  });

  it("orders the late links light-mode → Pro → chroma through the anchor lists", () => {
    // pro-theme.css re-overrides equal-specificity light-mode rules by source
    // order alone (its comments name the line numbers), and the chroma sheet
    // re-tints tokens both of them seed. Whichever link attaches first, the
    // anchors must reproduce that order.
    expect(LIGHT_MODE_STYLESHEET_ANCHOR_IDS).toEqual([
      PRO_THEME_STYLESHEET_LINK_ID,
      CHROMA_STYLESHEET_LINK_ID,
    ]);
    expect(PRO_THEME_STYLESHEET_ANCHOR_IDS).toEqual([CHROMA_STYLESHEET_LINK_ID]);
    expect(LIGHT_MODE_STYLESHEET_LINK_ID).not.toBe(PRO_THEME_STYLESHEET_LINK_ID);
  });
});
