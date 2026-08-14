#!/usr/bin/env bun

/**
 * Build the public molecule download pack from the canonical Convex depiction
 * set (`moleculeOverrides`):
 *   public/dosewiki-molecules.json — manifest: slug, title, filename, smiles, represents, source
 *   public/dosewiki-molecules.zip  — molecules/ (stored brand SVGs, incl. classes/) +
 *                                    molecules-standard/ (standard textbook colourway,
 *                                    re-rendered at pack time) + the manifest
 *
 * Read-only: pulls rows over the public Convex queries and writes only local
 * files. Convex URL: --convex-url= > SOURCE_CONVEX_URL > CONVEX_PUBLIC_READ_URL
 * > VITE_CONVEX_URL/NEXT_PUBLIC_CONVEX_URL > production default.
 *
 * `--check` builds the manifest and exits 1 when it drifts from the committed
 * public/dosewiki-molecules.json, without writing anything.
 */

import { spawnSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as OCL from "openchemlib";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api";
import {
  OCL_COLOR_TO_STANDARD,
  renderMoleculeSvg,
} from "../../src/features/dev/tools/molecule-editor/renderMoleculeSvg";
import { drainConvexPageQuery } from "../lib/convex-pagination.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const STAGE_DIR = join(ROOT, "tmp/molecule-pack");
const MANIFEST_NAME = "dosewiki-molecules.json";
const MANIFEST_PATH = join(ROOT, "public", MANIFEST_NAME);
const ZIP_PATH = join(ROOT, "public/dosewiki-molecules.zip");
const STATIC_CLASS_DIR = join(ROOT, "public/molecules/classes");
const GENERATED_SMILES_PATH = join(ROOT, "src/data/mappings/generatedSmiles.json");
const CONCURRENCY = 8;
/** Fixed mtime for staged files so the zip is byte-deterministic per content. */
const ZIP_EPOCH = new Date("2001-01-01T00:00:00Z");

const DEFAULT_CONVEX_URL = "https://glad-minnow-656.convex.cloud";

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

function convexUrlFromEnvironment(argv: string[]): string {
  const flag = argv.find((arg) => arg.startsWith("--convex-url="));
  if (flag) return flag.slice("--convex-url=".length);
  return (
    process.env.SOURCE_CONVEX_URL ??
    process.env.CONVEX_PUBLIC_READ_URL ??
    process.env.VITE_CONVEX_URL ??
    process.env.NEXT_PUBLIC_CONVEX_URL ??
    DEFAULT_CONVEX_URL
  );
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
  const convexUrl = convexUrlFromEnvironment(argv);
  console.log(`Reading moleculeOverrides from ${convexUrl}`);

  const client = new ConvexHttpClient(convexUrl);
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
  const lookup = await drainConvexPageQuery({
    client,
    query: api.substanceIndex.getLookupPage,
  });
  for (const item of lookup) {
    if (typeof item === "object" && item !== null && "slug" in item && "name" in item) {
      const { slug, name } = item;
      if (typeof slug === "string" && typeof name === "string") titleBySlug.set(slug, name);
    }
  }

  const substanceRows: MoleculeRow[] = [];
  const classRows: MoleculeRow[] = [];
  for (const row of rows) {
    if (!row) continue;
    (row.slug.startsWith("class:") ? classRows : substanceRows).push(row);
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
      "canonical Convex depiction set (one editable MOL block per substance). The pack ZIP " +
      "contains each structure in two colourways: molecules/ (dose.wiki brand colours, the " +
      "stored depiction) and molecules-standard/ (standard textbook element colours — black " +
      "skeleton, blue N, red O — derived from the same MOL block at pack time). `represents` " +
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
      console.error(`DRIFT: public/${MANIFEST_NAME} does not match the Convex depiction set.`);
      console.error("Run `npm run molecules:pack` to refresh it.");
      process.exit(1);
    }
    console.log(`public/${MANIFEST_NAME} matches Convex (${manifestMolecules.length} molecules).`);
    return;
  }

  rmSync(STAGE_DIR, { recursive: true, force: true });
  mkdirSync(STAGE_DIR, { recursive: true });

  const staged: string[] = [];
  let standardCount = 0;
  for (const row of substanceRows) {
    staged.push(stageFile(`molecules/${row.slug}.svg`, row.svg));
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

  const overriddenClassKeys = new Set<string>();
  for (const row of classRows) {
    const key = row.slug.slice("class:".length);
    overriddenClassKeys.add(key);
    staged.push(stageFile(`molecules/classes/${key}.svg`, row.svg));
  }
  let staticClassCount = 0;
  for (const filename of readdirSync(STATIC_CLASS_DIR)) {
    if (!filename.endsWith(".svg")) continue;
    const key = filename.slice(0, -".svg".length);
    if (overriddenClassKeys.has(key)) continue;
    staged.push(
      stageFile(`molecules/classes/${filename}`, readFileSync(join(STATIC_CLASS_DIR, filename), "utf8")),
    );
    staticClassCount += 1;
  }

  staged.push(stageFile(MANIFEST_NAME, manifestJson));
  staged.sort((a, b) => a.localeCompare(b));

  rmSync(ZIP_PATH, { force: true });
  const zip = spawnSync("zip", ["-q", "-r", "-X", ZIP_PATH, ...staged], {
    cwd: STAGE_DIR,
    stdio: "inherit",
  });
  if (zip.status !== 0) {
    console.error(`zip exited with status ${zip.status ?? "unknown"}`);
    process.exit(1);
  }
  writeFileSync(MANIFEST_PATH, manifestJson);

  console.log(
    `Packed ${substanceRows.length} substances (brand), ${standardCount} standard renders, ` +
      `${classRows.length} Convex class skeletons + ${staticClassCount} static class skeletons.`,
  );
  console.log(`Wrote public/${MANIFEST_NAME} (${manifestMolecules.length} molecules) and public/dosewiki-molecules.zip`);

  if (failures.length > 0) {
    console.error(`\n${failures.length} failure(s) — the pack is incomplete:`);
    for (const failure of failures) console.error(`  ${failure.slug}: ${failure.reason}`);
    process.exit(1);
  }
}

await main();
