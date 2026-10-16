import type { CSSProperties } from "react";
import type { IconName } from "@/components/common/Icon";
import metrics from "./homeTileGlyphMetrics.generated.json";

type HomeTileGlyphMetrics = {
  readonly scale: number;
  readonly dx: number;
  readonly dy: number;
}

const GLYPH_METRICS: Readonly<Record<string, HomeTileGlyphMetrics>> = metrics;

export function homeTileGlyphStyle(icon: IconName): CSSProperties | undefined {
  const glyph = GLYPH_METRICS[icon];
  if (!glyph) return undefined;
  return {
    "--theme-home-glyph-scale": glyph.scale,
    "--theme-home-glyph-dx": glyph.dx,
    "--theme-home-glyph-dy": glyph.dy,
  } as CSSProperties;
}
