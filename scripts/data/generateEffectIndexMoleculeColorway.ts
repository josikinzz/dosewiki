#!/usr/bin/env bun
/**
 * Bake the Effect Index class-structure colourway into `public/molecules-ei/classes/`.
 *
 * Structure diagrams render through `<img>`, so CSS cannot recolour individual atoms — the
 * palette has to be in the bytes. Substance depictions are Convex `moleculeOverrides` rows
 * (recoloured at serve time by `src/app/api/molecules/**`), but the chemical-class Markush
 * skeletons are still static files: dose.wiki tracks the brand renders in
 * `public/molecules/classes/` and this script derives the Effect Index colourway from them
 * without needing RDKit or a Python env.
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

const BRAND_CLASSES_DIR = path.join(ROOT, "public/molecules/classes");
const OUT_CLASSES_DIR = path.join(ROOT, "public", EFFECT_INDEX_MOLECULE_DIRNAME, "classes");

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
  residual: string[];
};

const stats: Stats = {
  written: 0,
  unchanged: 0,
  stale: [],
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
  const classNames = await listSvgs(BRAND_CLASSES_DIR);

  if (classNames.length === 0) {
    console.error(
      `No SVGs found in ${path.relative(ROOT, BRAND_CLASSES_DIR)} — nothing to recolour.`,
    );
    process.exit(1);
  }

  if (!checkOnly) {
    await mkdir(OUT_CLASSES_DIR, { recursive: true });
  }

  for (const name of classNames) {
    const source = await readFile(path.join(BRAND_CLASSES_DIR, name), "utf8");
    await emit(
      path.join(OUT_CLASSES_DIR, name),
      recolorMoleculeSvgToEffectIndex(source),
      `classes/${name}`,
    );
  }

  // Drop outputs whose brand source no longer exists, so a renamed class cannot leave a
  // stale Effect Index file behind.
  const expected = new Set(classNames);
  const orphans = (await listSvgs(OUT_CLASSES_DIR)).filter((name) => !expected.has(name));
  for (const name of orphans) {
    const label = `classes/${name} (orphan)`;
    stats.stale.push(label);
    if (!checkOnly) {
      await rm(path.join(OUT_CLASSES_DIR, name));
    }
  }

  const outRel = path.relative(ROOT, OUT_CLASSES_DIR);
  console.log(
    `${checkOnly ? "Checked" : "Wrote"} ${classNames.length} class structures in ${outRel}/`,
  );
  if (!checkOnly) {
    console.log(`  ${stats.written} written, ${stats.unchanged} already current`);
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
