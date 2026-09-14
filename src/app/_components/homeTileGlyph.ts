import type { CSSProperties } from "react";
import type { IconName } from "@/components/common/Icon";
import metrics from "./homeTileGlyphMetrics.generated.json";

/**
 * Ink framing for one homepage tile glyph, measured offline by
 * `scripts/build/generateHomeTileGlyphMetrics.ts`: `scale` enlarges the SVG box so
 * the glyph's ink, not its padded box, spans the share of the tile the stylesheet
 * sets; `dx`/`dy` recentre ink that sits off-centre in its own box, as fractions of
 * the SVG box.
 */
type HomeTileGlyphMetrics = {
  readonly scale: number;
  readonly dx: number;
  readonly dy: number;
}

const GLYPH_METRICS: Readonly<Record<string, HomeTileGlyphMetrics>> = metrics;

/**
 * The custom properties `.theme-home-nav-svg` reads to frame this icon's ink.
 * Undefined for an icon the metrics were never generated for; the stylesheet then
 * falls back to sizing the nominal box, which is only wrong by that icon's padding.
 */
export function homeTileGlyphStyle(icon: IconName): CSSProperties | undefined {
  const glyph = GLYPH_METRICS[icon];
  if (!glyph) return undefined;
  return {
    "--theme-home-glyph-scale": glyph.scale,
    "--theme-home-glyph-dx": glyph.dx,
    "--theme-home-glyph-dy": glyph.dy,
  } as CSSProperties;
}
