import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  buildRouteFamilies,
  censusFromManifest,
  formatCensus,
} from "./prerender-census.lib.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const scriptPath = path.join(repoRoot, "scripts/build/prerender-census.mjs");

const LOCALES = [
  { code: "zh-Hans", pathPrefix: "/zh" },
  { code: "ru", pathPrefix: "/ru" },
];
const NAMES = { "zh-Hans": "Simplified Chinese (mainland)", ru: "Russian" };

const MANIFEST = {
  version: 4,
  routes: {
    "/lsd": { srcRoute: "/[slug]" },
    "/2c-b": { srcRoute: "/[slug]" },
    "/zh/lsd": { srcRoute: "/zh/[slug]" },
    "/ru/lsd": { srcRoute: "/ru/[slug]" },
    "/ru/2c-b": { srcRoute: "/ru/[slug]" },
    "/reports/first-time": { srcRoute: "/reports/[slug]" },
    "/category/psychedelics": { srcRoute: "/category/[categoryKey]" },
    "/about": { srcRoute: null },
    "/effects/category/visual": { srcRoute: "/effects/category/[categorySlug]" },
  },
  dynamicRoutes: {},
};

test("censusFromManifest counts every route into exactly one family", () => {
  const families = buildRouteFamilies(LOCALES, NAMES);
  const census = censusFromManifest(MANIFEST, families);
  assert.deepEqual(
    census.rows.map((row) => [row.label, row.count]),
    [
      ["English substances", 2],
      ["Simplified Chinese (mainland) substances", 1],
      ["Russian substances", 2],
      ["Trip reports", 1],
      ["Substance categories", 1],
      ["Effect categories", 1],
      ["Everything else", 1],
    ],
  );
  assert.equal(census.total, Object.keys(MANIFEST.routes).length);
});

test("buildRouteFamilies adds a row per public locale, falling back to the code for a name", () => {
  const families = buildRouteFamilies([...LOCALES, { code: "nl", pathPrefix: "/nl" }], NAMES);
  assert.deepEqual(
    families.map((family) => family.key),
    ["substances:en", "substances:zh-Hans", "substances:ru", "substances:nl", "reports", "categories", "effectCategories"],
  );
  assert.equal(families[3].label, "nl substances");
});

test("formatCensus prints the table, the total, and the timing record when present", () => {
  const census = censusFromManifest(MANIFEST, buildRouteFamilies(LOCALES, NAMES));
  const text = formatCensus({
    buildDirectory: ".next",
    census,
    timing: {
      command: "bun run build",
      surface: "public",
      flavor: "dosewiki",
      exitStatus: 0,
      startedAt: "2026-09-23T00:00:00.000Z",
      endedAt: "2026-09-23T01:02:03.000Z",
      elapsedSeconds: 3723,
    },
  });
  assert.match(text, /Prerender census for \.next/);
  assert.match(text, /English substances\s+2/);
  assert.match(text, /Total\s+9/);
  assert.match(text, /elapsed 62m 03s \(3723s\)/);
  assert.match(text, /surface public, flavor dosewiki, exit 0/);

  const untimed = formatCensus({ buildDirectory: ".next", census, timing: null });
  assert.match(untimed, /no build-timing\.json/);
});

test("the CLI reads a build directory argument and fails clearly without a manifest", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "dosewiki-census-"));
  try {
    const missing = spawnSync(process.execPath, [scriptPath, dir], { cwd: repoRoot, encoding: "utf8" });
    assert.equal(missing.status, 1);
    assert.match(missing.stderr, /No prerender manifest/);

    await writeFile(path.join(dir, "prerender-manifest.json"), JSON.stringify(MANIFEST));
    await writeFile(
      path.join(dir, "build-timing.json"),
      JSON.stringify({ startedAt: "a", endedAt: "b", elapsedSeconds: 61, command: "bun run build", exitStatus: 0 }),
    );
    const ok = spawnSync(process.execPath, [scriptPath, dir], { cwd: repoRoot, encoding: "utf8" });
    assert.equal(ok.status, 0, ok.stderr);
    assert.match(ok.stdout, /English substances\s+2/);
    assert.match(ok.stdout, /Russian substances\s+2/);
    assert.match(ok.stdout, /elapsed 1m 01s/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
