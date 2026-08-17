#!/usr/bin/env bun
/**
 * Bake Pro light and dark class-structure colourways from canonical Fun SVGs.
 *
 * Structure diagrams render through `<img>`, so CSS cannot recolour individual
 * atoms. Convex substance depictions are recoloured at serve time by
 * `src/app/api/molecules/**`; static chemical-class skeletons are generated here
 * without RDKit or a Python environment.
 *
 * Usage: bun scripts/data/generateEffectIndexMoleculeColorway.ts [--check]
 *   --check  verify both committed colourways without writing
 */
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  BRAND_MOLECULE_HEXES,
  EFFECT_INDEX_DARK_MOLECULE_DIRNAME,
  EFFECT_INDEX_MOLECULE_DIRNAME,
  recolorMoleculeSvgToEffectIndex,
} from "../../src/data/mappings/moleculePalette";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const BRAND_CLASSES_DIR = path.join(ROOT, "public/molecules/classes");
const OUTPUTS = [
  { colorScheme: "light", dirname: EFFECT_INDEX_MOLECULE_DIRNAME },
  { colorScheme: "dark", dirname: EFFECT_INDEX_DARK_MOLECULE_DIRNAME },
] as const;
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

  for (const output of OUTPUTS) {
    const outClassesDir = path.join(ROOT, "public", output.dirname, "classes");
    if (!checkOnly) {
      await mkdir(outClassesDir, { recursive: true });
    }

    for (const name of classNames) {
      const source = await readFile(path.join(BRAND_CLASSES_DIR, name), "utf8");
      await emit(
        path.join(outClassesDir, name),
        recolorMoleculeSvgToEffectIndex(source, output.colorScheme),
        `${output.colorScheme}/classes/${name}`,
      );
    }

    // A renamed source must not leave an obsolete file in either colourway.
    const expected = new Set(classNames);
    const orphans = (await listSvgs(outClassesDir)).filter((name) => !expected.has(name));
    for (const name of orphans) {
      const label = `${output.colorScheme}/classes/${name} (orphan)`;
      stats.stale.push(label);
      if (!checkOnly) {
        await rm(path.join(outClassesDir, name));
      }
    }

    console.log(
      `${checkOnly ? "Checked" : "Processed"} ${classNames.length} class structures in ` +
        `${path.relative(ROOT, outClassesDir)}/`,
    );
  }

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
