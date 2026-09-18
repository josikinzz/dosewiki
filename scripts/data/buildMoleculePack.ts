#!/usr/bin/env bun

/**
 * Build the public molecule download pack from the current data backend's
 * canonical depiction set (`moleculeOverrides`):
 *   public/dosewiki-molecules.json - manifest: slug, title, filename, smiles, represents, source
 *   public/dosewiki-molecules.zip  - molecules-light/ and molecules-dark/ (the site's
 *                                    neutral light-mode and dark-mode colourways, incl.
 *                                    classes/) + molecules-standard/ (textbook element
 *                                    colours, re-rendered at pack time) + the manifest
 *
 * Read-only: queries through `createDataClient`, using the backend and target
 * selected by DATA_BACKEND and that shared client's explicit target policy.
 * `--check` builds the manifest and exits 1 when it drifts from the committed
 * public/dosewiki-molecules.json, without writing anything.
 */

import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as OCL from "openchemlib";
import { createDataClient } from "../lib/data-client.ts";
import { api } from "../../lib/postgres/runtime/api.ts";
import {
  OCL_COLOR_TO_STANDARD,
  renderMoleculeSvg,
} from "../../src/features/dev/tools/molecule-editor/renderMoleculeSvg";
import { applyMoleculeColorway } from "../../src/data/mappings/moleculePalette";
import { drainDataPageQuery } from "../lib/data-pagination.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const STAGE_DIR = join(ROOT, "tmp/molecule-pack");
const MANIFEST_NAME = "dosewiki-molecules.json";
const MANIFEST_PATH = join(ROOT, "public", MANIFEST_NAME);
const ZIP_PATH = join(ROOT, "public/dosewiki-molecules.zip");
const GENERATED_SMILES_PATH = join(ROOT, "data/chemistry/generatedSmiles.json");
const CONCURRENCY = 8;
/** Fixed mtime for staged files so the zip is byte-deterministic per content. */
const ZIP_EPOCH = new Date("2001-01-01T00:00:00Z");


interface MoleculeRow {
  slug: string;
  svg: string;
  molblock: string;
  smiles?: string;
  boldBonds?: number[];
  source?: string;
}

interface ManifestMolecule {
  slug: string;
  title: string;
  filename: string;
  smiles: string | null;
  represents: string;
  source: string;
}


/** Run `worker` over `items` with at most `limit` in flight, preserving order. */
async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const lanes = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await worker(items[index]);
    }
  });
  await Promise.all(lanes);
  return results;
}

function stageFile(relativePath: string, content: string): string {
  const absolute = join(STAGE_DIR, relativePath);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, content);
  utimesSync(absolute, ZIP_EPOCH, ZIP_EPOCH);
  return relativePath;
}

async function main() {
  const argv = process.argv.slice(2);
  const checkOnly = argv.includes("--check");
  const created = createDataClient({ argv });
  const { client } = created;
  console.log(
    `Reading moleculeOverrides from ${created.backend} backend` +
      (created.fingerprint ? ` (${created.fingerprint})` : ""),
  );

  try {
    const slugRows: Array<{ slug: string }> = await client.query(api.moleculeOverrides.listSlugs, {});
    const slugs = slugRows.map((row) => row.slug).sort((a, b) => a.localeCompare(b));

    const failures: Array<{ slug: string; reason: string }> = [];
    const rows = await mapWithConcurrency(slugs, CONCURRENCY, async (slug) => {
      const row: MoleculeRow | null = await client.query(api.moleculeOverrides.getBySlug, { slug });
      if (!row) failures.push({ slug, reason: "Row disappeared between list and read." });
      return row;
    });
    const generatedEntries = JSON.parse(readFileSync(GENERATED_SMILES_PATH, "utf8")).entries ?? {};
    const titleBySlug = new Map<string, string>();
    // Substances still being written or deliberately unlisted (`priority` `low`
    // or `hide_for_now`) must not ship their molecules in the public pack.
    const excludedSubstanceSlugs = new Set<string>();
    const lookup = await drainDataPageQuery({
      client,
      query: api.substanceIndex.getLookupPage,
    });
    for (const item of lookup) {
      if (typeof item !== "object" || item === null || !("slug" in item)) continue;
      const { slug, name, priority } = item;
      if (typeof slug !== "string") continue;
      if (typeof name === "string") titleBySlug.set(slug, name);
      if (priority === "low" || priority === "hide_for_now") {
        excludedSubstanceSlugs.add(slug);
      }
    }

    const substanceRows: MoleculeRow[] = [];
    const classRows: MoleculeRow[] = [];
    for (const row of rows) {
      if (!row) continue;
      if (row.slug.startsWith("class:")) {
        // Class skeletons are generic Markush structures, not substance-specific.
        classRows.push(row);
      } else if (!excludedSubstanceSlugs.has(row.slug)) {
        substanceRows.push(row);
      }
    }

    const manifestMolecules: ManifestMolecule[] = substanceRows.map((row) => {
      const generated = generatedEntries[row.slug];
      const represents =
        typeof generated === "object" &&
        generated !== null &&
        typeof generated.represents === "string"
          ? generated.represents
          : "";
      return {
        slug: row.slug,
        title: titleBySlug.get(row.slug) ?? row.slug,
        filename: `${row.slug}.svg`,
        smiles: row.smiles ?? null,
        represents,
        source: row.source ?? "",
      };
    });

    const manifest = {
      __comment:
        "dose.wiki molecule pack manifest. Every molecule SVG is rendered by OpenChemLib from the " +
        "canonical current-backend depiction set (one editable MOL block per substance). The pack ZIP " +
        "contains each structure in three colourways: molecules-light/ (neutral, for a light " +
        "background), molecules-dark/ (neutral, for a dark background) and molecules-standard/ " +
        "(textbook element colours — black skeleton, blue N, red O — derived from the same MOL " +
        "block at pack time). Class skeletons ship under classes/ in the light and dark sets. `represents` " +
        "names the active molecule when the substance is a plant, preparation, or brand name. " +
        "Pack ZIP: /dosewiki-molecules.zip",
      count: manifestMolecules.length,
      license:
        "CC0 1.0 (public domain) — dose.wiki-generated artwork; credit appreciated, not required",
      molecules: manifestMolecules,
    };
    const manifestJson = `${JSON.stringify(manifest, null, 2)}\n`;

    if (checkOnly) {
      const committed = readFileSync(MANIFEST_PATH, "utf8");
      if (committed !== manifestJson) {
        console.error(`DRIFT: public/${MANIFEST_NAME} does not match the current-backend depiction set.`);
        console.error("Run `npm run molecules:pack` to refresh it.");
        process.exitCode = 1;
        return;
      }
      console.log(`public/${MANIFEST_NAME} matches ${created.backend} (${manifestMolecules.length} molecules).`);
      return;
    }

    rmSync(STAGE_DIR, { recursive: true, force: true });
    mkdirSync(STAGE_DIR, { recursive: true });

    const staged: string[] = [];
    let standardCount = 0;
    for (const row of substanceRows) {
      staged.push(stageFile(`molecules-light/${row.slug}.svg`, applyMoleculeColorway(row.svg, "pro-light")));
      staged.push(stageFile(`molecules-dark/${row.slug}.svg`, applyMoleculeColorway(row.svg, "pro-dark")));
      const standard = renderMoleculeSvg(
        OCL,
        row.molblock,
        undefined,
        row.boldBonds ?? undefined,
        OCL_COLOR_TO_STANDARD,
      );
      if (standard === null) {
        failures.push({ slug: row.slug, reason: "Standard-colourway render failed." });
        continue;
      }
      staged.push(stageFile(`molecules-standard/${row.slug}.svg`, standard));
      standardCount += 1;
    }

    for (const row of classRows) {
      const key = row.slug.slice("class:".length);
      staged.push(stageFile(`molecules-light/classes/${key}.svg`, applyMoleculeColorway(row.svg, "pro-light")));
      staged.push(stageFile(`molecules-dark/classes/${key}.svg`, applyMoleculeColorway(row.svg, "pro-dark")));
    }

    staged.push(stageFile(MANIFEST_NAME, manifestJson));
    staged.sort((a, b) => a.localeCompare(b));

    rmSync(ZIP_PATH, { force: true });
    const zip = spawnSync("zip", ["-q", "-r", "-X", ZIP_PATH, ...staged], {
      cwd: STAGE_DIR,
      stdio: "inherit",
    });
    if (zip.status !== 0) {
      throw new Error(`zip exited with status ${zip.status ?? "unknown"}`);
    }
    writeFileSync(MANIFEST_PATH, manifestJson);

    console.log(
      `Packed ${substanceRows.length} substances (light + dark), ${standardCount} standard renders, ` +
        `${classRows.length} class skeletons.`,
    );
    console.log(`Wrote public/${MANIFEST_NAME} (${manifestMolecules.length} molecules) and public/dosewiki-molecules.zip`);

    if (failures.length > 0) {
      console.error(`\n${failures.length} failure(s) - the pack is incomplete:`);
      for (const failure of failures) console.error(`  ${failure.slug}: ${failure.reason}`);
      process.exitCode = 1;
    }
  } finally {
    await client.end?.();
  }
}

await main();
