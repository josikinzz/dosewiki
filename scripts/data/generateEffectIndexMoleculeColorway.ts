#!/usr/bin/env bun
/**
 * Bake the Effect Index molecule colourway into `public/molecules-ei/`.
 *
 * Structure diagrams render through `<img>`, so CSS cannot recolour individual atoms — the
 * palette has to be in the bytes. dose.wiki keeps `public/molecules/` (fuchsia brand palette,
 * baked by `scripts/chemistry/render_molecules.py`); this script derives the Effect Index
 * colourway from it without needing RDKit or a Python env.
 *
 * Source preference per substance:
 *   1. `src/data/molecules/molecules-standard/<slug>.svg` — the same geometry rendered with
 *      `--palette standard`. Preferred because RDKit's standard palette keeps fluorine
 *      (`#33cccc`) and phosphorus (`#ff7f00`) apart, while the brand palette collapses both
 *      into one amber. Git-ignored, so it may be absent in a fresh clone.
 *   2. `public/molecules/<slug>.svg` — the tracked brand render. Always present. Phosphorus
 *      is indistinguishable from fluorine here and is reported as a warning.
 *
 * Chemical-class Markush skeletons (`public/molecules/classes/`) have no standard counterpart
 * and are always derived from the brand render.
 *
 * Usage: bun scripts/data/generateEffectIndexMoleculeColorway.ts [--check]
 *   --check  verify the committed colourway is up to date without writing anything
 */
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  BRAND_MOLECULE_HEXES,
  EFFECT_INDEX_MOLECULE_DIRNAME,
  recolorMoleculeSvgToEffectIndex,
} from "../../src/data/mappings/moleculePalette";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const BRAND_DIR = path.join(ROOT, "public/molecules");
const BRAND_CLASSES_DIR = path.join(BRAND_DIR, "classes");
const STANDARD_DIR = path.join(ROOT, "src/data/molecules/molecules-standard");
const OUT_DIR = path.join(ROOT, "public", EFFECT_INDEX_MOLECULE_DIRNAME);
const OUT_CLASSES_DIR = path.join(OUT_DIR, "classes");

const checkOnly = process.argv.includes("--check");

const listSvgs = async (dir: string): Promise<string[]> => {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".svg"))
      .map((entry) => entry.name)
      .sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
};

const readIfPresent = async (file: string): Promise<string | null> => {
  try {
    return await readFile(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
};

/** Brand hexes that must not survive into the Effect Index colourway. */
const findResidualBrandHexes = (svg: string): string[] => {
  const lowered = svg.toLowerCase();
  return BRAND_MOLECULE_HEXES.filter((hex) => lowered.includes(hex));
};

type Stats = {
  written: number;
  unchanged: number;
  stale: string[];
  fromStandard: number;
  fromBrand: number;
  residual: string[];
};

const stats: Stats = {
  written: 0,
  unchanged: 0,
  stale: [],
  fromStandard: 0,
  fromBrand: 0,
  residual: [],
};

async function emit(outFile: string, svg: string, label: string): Promise<void> {
  const residual = findResidualBrandHexes(svg);
  if (residual.length > 0) {
    stats.residual.push(`${label}: ${residual.join(", ")}`);
  }

  const existing = await readIfPresent(outFile);
  if (existing === svg) {
    stats.unchanged += 1;
    return;
  }
  stats.stale.push(label);
  if (!checkOnly) {
    await writeFile(outFile, svg, "utf8");
    stats.written += 1;
  }
}

async function main(): Promise<void> {
  const brandNames = await listSvgs(BRAND_DIR);
  const classNames = await listSvgs(BRAND_CLASSES_DIR);

  if (brandNames.length === 0) {
    console.error(`No SVGs found in ${path.relative(ROOT, BRAND_DIR)} — nothing to recolour.`);
    process.exit(1);
  }

  if (!checkOnly) {
    await mkdir(OUT_CLASSES_DIR, { recursive: true });
  }

  for (const name of brandNames) {
    const slug = name.replace(/\.svg$/i, "");
    const standard = await readIfPresent(path.join(STANDARD_DIR, `${slug}.svg`));
    const source = standard ?? (await readFile(path.join(BRAND_DIR, name), "utf8"));
    if (standard) {
      stats.fromStandard += 1;
    } else {
      stats.fromBrand += 1;
    }
    await emit(path.join(OUT_DIR, name), recolorMoleculeSvgToEffectIndex(source), name);
  }

  for (const name of classNames) {
    const source = await readFile(path.join(BRAND_CLASSES_DIR, name), "utf8");
    stats.fromBrand += 1;
    await emit(
      path.join(OUT_CLASSES_DIR, name),
      recolorMoleculeSvgToEffectIndex(source),
      `classes/${name}`,
    );
  }

  // Drop outputs whose brand source no longer exists, so a renamed slug cannot leave a
  // stale Effect Index file behind.
  const expected = new Set(brandNames);
  const expectedClasses = new Set(classNames);
  const orphans = [
    ...(await listSvgs(OUT_DIR)).filter((name) => !expected.has(name)).map((name) => [OUT_DIR, name] as const),
    ...(await listSvgs(OUT_CLASSES_DIR))
      .filter((name) => !expectedClasses.has(name))
      .map((name) => [OUT_CLASSES_DIR, name] as const),
  ];
  for (const [dir, name] of orphans) {
    const label = `${path.relative(OUT_DIR, path.join(dir, name))} (orphan)`;
    stats.stale.push(label);
    if (!checkOnly) {
      await rm(path.join(dir, name));
    }
  }

  const outRel = path.relative(ROOT, OUT_DIR);
  console.log(
    `${checkOnly ? "Checked" : "Wrote"} ${brandNames.length} substance + ${classNames.length} class structures in ${outRel}/`,
  );
  console.log(
    `  sources: ${stats.fromStandard} standard-palette, ${stats.fromBrand} brand-palette`,
  );
  if (!checkOnly) {
    console.log(`  ${stats.written} written, ${stats.unchanged} already current`);
  }

  if (stats.fromBrand > classNames.length) {
    console.warn(
      `  warning: ${stats.fromBrand - classNames.length} substance(s) fell back to the brand palette ` +
        `(run \`npm run molecules:generate\` to rebuild ${path.relative(ROOT, STANDARD_DIR)}); ` +
        `phosphorus renders as fluorine in those files.`,
    );
  }

  if (stats.residual.length > 0) {
    console.error(`\nBrand hexes survived the recolour in ${stats.residual.length} file(s):`);
    for (const line of stats.residual.slice(0, 20)) console.error(`  ${line}`);
    process.exit(1);
  }

  if (checkOnly && stats.stale.length > 0) {
    console.error(
      `\n${stats.stale.length} file(s) out of date. Run \`npm run molecules:generate-ei\`:`,
    );
    for (const line of stats.stale.slice(0, 20)) console.error(`  ${line}`);
    process.exit(1);
  }
}

await main();
