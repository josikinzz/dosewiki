#!/usr/bin/env bun
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { argv, cwd, exit, stderr, stdout } from "node:process";
import { Resvg } from "@resvg/resvg-js";
import { getIconData, iconToSVG } from "@iconify/utils";
import type { IconifyJSON } from "@iconify/types";
import { buildHomeQuickLinks } from "../../src/app/_components/homeQuickLinks";
import { SITE_FLAVOR_CONFIGS } from "../../src/config/siteFlavor";

export const HOME_TILE_GLYPH_METRICS_PATH =
  "src/app/_components/homeTileGlyphMetrics.generated.json";

const RASTER_WIDTH = 1024;
const INK_ALPHA = 8;
const DECIMALS = 3;

const require = createRequire(import.meta.url);

type GlyphMetrics = { scale: number; dx: number; dy: number };

function round(value: number): number {
  return Number(value.toFixed(DECIMALS));
}

function measure(name: string): GlyphMetrics {
  const separator = name.indexOf(":");
  const prefix = name.slice(0, separator);
  const iconName = name.slice(separator + 1);
  const iconSet = JSON.parse(
    readFileSync(require.resolve(`@iconify-json/${prefix}/icons.json`), "utf8"),
  ) as IconifyJSON;
  const icon = getIconData(iconSet, iconName);
  if (!icon) {
    throw new Error(`${name} is not in @iconify-json/${prefix}; the home tiles must be bundled icons.`);
  }

  const { attributes, body } = iconToSVG(icon);
  const [vbLeft, vbTop, vbWidth, vbHeight] = attributes.viewBox.split(" ").map(Number);
  const width = RASTER_WIDTH;
  const height = Math.round((RASTER_WIDTH * vbHeight) / vbWidth);
  const markup = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${attributes.viewBox}">${body.replace(/currentColor/g, "#000")}</svg>`;
  const image = new Resvg(markup, { background: "rgba(0,0,0,0)" }).render();
  const pixels = image.pixels;

  let minX = image.width;
  let minY = image.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      if (pixels[(y * image.width + x) * 4 + 3] < INK_ALPHA) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) {
    throw new Error(`${name} rendered no ink; its markup is not what this script expects.`);
  }

  const unit = vbWidth / width;
  const inkLeft = vbLeft + minX * unit;
  const inkTop = vbTop + minY * unit;
  const inkWidth = (maxX - minX + 1) * unit;
  const inkHeight = (maxY - minY + 1) * unit;
  const vbMax = Math.max(vbWidth, vbHeight);
  const fill = Math.max(inkWidth, inkHeight) / vbMax;
  const offsetX = (inkLeft + inkWidth / 2 - (vbLeft + vbWidth / 2)) / vbMax;
  const offsetY = (inkTop + inkHeight / 2 - (vbTop + vbHeight / 2)) / vbMax;

  stdout.write(
    `${name}: viewBox ${attributes.viewBox}, ink ${inkWidth.toFixed(2)}×${inkHeight.toFixed(2)} at (${inkLeft.toFixed(2)}, ${inkTop.toFixed(2)}), fill ${fill.toFixed(3)}\n`,
  );
  return { scale: round(1 / fill), dx: round(-offsetX), dy: round(-offsetY) };
}

const names = [
  ...new Set(
    Object.values(SITE_FLAVOR_CONFIGS).flatMap((config) =>
      buildHomeQuickLinks(config).map((link) => link.icon),
    ),
  ),
].sort();

const metrics: Record<string, GlyphMetrics> = {};
for (const name of names) {
  metrics[name] = measure(name);
}
const output = `${JSON.stringify(metrics, null, 2)}\n`;

const checkOnly = argv.includes("--check");
let current: string | null = null;
try {
  current = readFileSync(resolve(cwd(), HOME_TILE_GLYPH_METRICS_PATH), "utf8");
} catch {
  current = null;
}

if (current === output) {
  stdout.write(`${HOME_TILE_GLYPH_METRICS_PATH} is up to date.\n`);
  exit(0);
}
if (checkOnly) {
  stderr.write(`${HOME_TILE_GLYPH_METRICS_PATH} is stale. Run: npm run generate:home-tile-glyphs\n`);
  exit(1);
}
writeFileSync(resolve(cwd(), HOME_TILE_GLYPH_METRICS_PATH), output, "utf8");
stdout.write(`Wrote ${HOME_TILE_GLYPH_METRICS_PATH}.\n`);
exit(0);
