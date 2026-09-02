import { describe, expect, it } from "vitest";

import { SITE_FLAVOR_CONFIGS } from "@/config/siteFlavor";
import { homeTileGlyphStyle } from "./homeTileGlyph";
import { buildHomeQuickLinks } from "./homeQuickLinks";

describe("homeTileGlyphStyle", () => {
  it("has generated ink framing for every quick-link icon on every flavor", () => {
    // A quick link whose icon changed without `npm run generate:home-tile-glyphs`
    // would silently fall back to nominal-box sizing and sit out of scale with its
    // neighbours, so the metrics have to cover the current icon set exactly.
    for (const config of Object.values(SITE_FLAVOR_CONFIGS)) {
      for (const link of buildHomeQuickLinks(config)) {
        const style = homeTileGlyphStyle(link.icon) as Record<string, number> | undefined;

        expect(style, `${config.flavor} ${link.id} (${link.icon})`).toBeDefined();
        // The ink never exceeds its box, so the box only ever grows, and a glyph
        // is never so off-centre that the correction leaves the tile.
        expect(style!["--theme-home-glyph-scale"]).toBeGreaterThanOrEqual(1);
        expect(style!["--theme-home-glyph-scale"]).toBeLessThan(2);
        expect(Math.abs(style!["--theme-home-glyph-dx"])).toBeLessThan(0.25);
        expect(Math.abs(style!["--theme-home-glyph-dy"])).toBeLessThan(0.25);
      }
    }
  });

  it("leaves an icon without metrics to the stylesheet's nominal-box fallback", () => {
    expect(homeTileGlyphStyle("lucide:never-a-home-tile")).toBeUndefined();
  });
});
