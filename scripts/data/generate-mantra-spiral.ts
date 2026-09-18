#!/usr/bin/env bun
// Regenerates the static decorative mantra spiral sheet served on /mantras.
// Run: npm run generate:mantra-spiral
// Output: public/mantras/spiral-sheet.svg (referenced by MantraGlyphs.tsx).
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildSpiralSheetSvg } from "../../src/features/mantras/spiralSheet";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const out = join(root, "public", "mantras", "spiral-sheet.svg");
mkdirSync(dirname(out), { recursive: true });
const svg = buildSpiralSheetSvg();
writeFileSync(out, svg, "utf8");
console.log(`Wrote ${out} (${(svg.length / 1024).toFixed(1)} KB)`);
