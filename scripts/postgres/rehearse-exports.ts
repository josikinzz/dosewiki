/**
 * The public exports are backend-independent.
 *
 *   bun scripts/postgres/rehearse-exports.ts --target postgres://localhost:5432/dosewiki [--allow-remote]
 *
 * Drives the two export paths against Postgres and proves what the routes
 * cannot prove for themselves outside `next start`:
 *
 *   1. static: every open-data and /api/v1 route, and lib/open-data/datasets.ts,
 *      reads through the public read layer (`@server/data/publicData*`), never
 *      through a browser database client or a backend env var;
 *   2. script export (scripts/data-ops/export-data-to-json.mjs): draining
 *      `substanceIndex:getFullDocumentPage` through scripts/lib/data-pagination.mjs
 *      terminates on opaque runtime cursors, strips `_id` / `_creationTime`,
 *      and sorts by numeric id; two runs order the shared rows identically;
 *   3. open-data documents (SubstanceIndex, EffectIndex, TripReports): built
 *      by the real `buildOpenDataDocument` from an uncached adapter
 *      (`createDataPublicDataReadAdapter(queryData)`; the cached adapter
 *      needs Next's `unstable_cache`), the items carry the license envelope,
 *      no document bookkeeping, none of the private table fields, and two
 *      builds order the shared rows identically.
 *
 * Reads only; nothing is written to the database. Sibling rehearsals may add
 * or delete scratch rows between the two runs, so determinism is judged on
 * the rows present in both runs. Report:
 * runs/postgres-import/<timestamp>-exports/report.json.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { api } from "../../lib/postgres/runtime/api";
import { queryData } from "../../lib/data/serverClient";
import { createDataPublicDataReadAdapter } from "../../lib/data/publicData.reads";
import { projectPublicReportDetails } from "../../lib/data/publicData.reportProfileProjection";
import {
  OPEN_DATA_DATASETS,
  OPEN_DATA_LICENSE_URL,
  OPEN_DATA_SOURCE,
  buildOpenDataDocument,
  type OpenDataDataset,
} from "../../lib/open-data/datasets";
import { createDataClient, type DataClient } from "../lib/data-client.ts";
import { drainDataPageQuery } from "../lib/data-pagination.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

type Check = { scenario: string; check: string; pass: boolean; detail?: unknown };
const checks: Check[] = [];
function expect(scenario: string, check: string, pass: boolean, detail?: unknown): void {
  checks.push({ scenario, check, pass, ...(detail === undefined ? {} : { detail }) });
  console.log(`${pass ? "ok  " : "FAIL"} ${scenario}: ${check}${detail === undefined || pass ? "" : ` ${JSON.stringify(detail)}`}`);
}

/**
 * Field names from the privacy classes in inventory/tables.md: private-personal
 * (contact_email, ip_hash, user_agent, subscriber email, owner_email,
 * ownerEmail), credential (passwordHash, resetTokenHash, codeHash), and the
 * staff stamps the datasets strip on purpose (editorial_review, section_gaps,
 * attribution_review, membershipEmail, staffNote, reviewer_email, actorEmail).
 */
const PRIVATE_FIELD_PATTERN = /^(?:contact_email|ip_hash|user_agent|owner_email|ownerEmail|email|passwordHash|resetTokenHash|codeHash|editorial_review|section_gaps|attribution_review|membershipEmail|staffNote|reviewer_email|actorEmail|_id|_creationTime)$/;

function findPrivateFields(value: unknown, pathPrefix = "", found: string[] = []): string[] {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => findPrivateFields(entry, `${pathPrefix}[${index}]`, found));
  } else if (value && typeof value === "object") {
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (PRIVATE_FIELD_PATTERN.test(key)) found.push(`${pathPrefix}.${key}`);
      findPrivateFields(nested, `${pathPrefix}.${key}`, found);
    }
  }
  return found;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/route\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

const PUBLIC_READ_LAYER = /@server\/data\/publicData|@server\/open-data\/datasets|@server\/reagentData/;
const DIRECT_BACKEND_ACCESS = /process\.env\.[A-Z_]*POSTGRES[A-Z_]*|DATA_BACKEND/;
/** Routes that serve static API metadata and read no data at all. */
const METADATA_ROUTES = ["src/app/api/v1/meta/route.ts", "src/app/api/v1/openapi.json/route.ts"];

function resolveServerImport(specifier: string): string | null {
  if (!specifier.startsWith("@server/")) return null;
  const base = path.join(ROOT, "lib", specifier.slice("@server/".length));
  return [`${base}.ts`, path.join(base, "index.ts")].find((candidate) => fs.existsSync(candidate)) ?? null;
}

function staticBoundary(): void {
  const routes = [...walk(path.join(ROOT, "src/app/open-data")), ...walk(path.join(ROOT, "src/app/api/v1"))];
  const sources = [...routes, path.join(ROOT, "lib/open-data/datasets.ts"), path.join(ROOT, "src/app/open-data/shared.ts")];
  const offenders = sources
    .map((file) => ({ file: path.relative(ROOT, file), source: fs.readFileSync(file, "utf8") }))
    .filter(({ source }) => DIRECT_BACKEND_ACCESS.test(source))
    .map(({ file }) => file);
  expect("static", `${routes.length} export routes and the dataset module never touch a backend client or env var`, routes.length > 0 && offenders.length === 0, offenders);
  // A route reads through the public read layer directly, or through one
  // `@server/*` helper (lib/public-api/*) that does. Anything else is unclassified.
  const unclassified = routes
    .map((file) => path.relative(ROOT, file))
    .filter((file) => !METADATA_ROUTES.includes(file))
    .filter((file) => {
      const source = fs.readFileSync(path.join(ROOT, file), "utf8");
      if (PUBLIC_READ_LAYER.test(source)) return false;
      const helpers = [...source.matchAll(/from "(@server\/[^"]+)"/g)].map((match) => resolveServerImport(match[1]));
      return !helpers.some((helper) => helper && PUBLIC_READ_LAYER.test(fs.readFileSync(helper, "utf8")));
    });
  expect("static", "every data route reads through @server/data/publicData* (directly or via one lib/public-api helper)", unclassified.length === 0, unclassified);
}

type Page = { page: unknown[]; isDone: boolean; continueCursor: string | null };

async function scriptExport(client: DataClient): Promise<Record<string, unknown>[]> {
  const pages: Page[] = [];
  const recording = {
    query: async (reference: unknown, args: unknown) => {
      const result = await (client.query as (ref: unknown, args: unknown) => Promise<Page>)(reference, args);
      pages.push(result);
      return result;
    },
  };
  const articles = await drainDataPageQuery({ client: recording, query: api.substanceIndex.getFullDocumentPage }) as Record<string, unknown>[];
  expect("script-export", "drain terminated on isDone after several opaque cursors", pages.length >= 2 && pages[pages.length - 1].isDone && pages.slice(0, -1).every((page) => typeof page.continueCursor === "string" && page.continueCursor.length > 0), { pages: pages.length });
  expect("script-export", "every cursor is distinct (no stall)", new Set(pages.slice(0, -1).map((page) => page.continueCursor)).size === pages.length - 1);
  expect("script-export", "page sizes respect the 32 clamp", pages.every((page) => page.page.length <= 32));
  // Exactly what scripts/data-ops/export-data-to-json.mjs does before writing.
  const cleaned = articles.map(({ _id, _creationTime, ...article }) => article);
  cleaned.sort((a, b) => {
    const idA = typeof a.id === "number" ? a.id : null;
    const idB = typeof b.id === "number" ? b.id : null;
    if (idA === null && idB === null) return 0;
    if (idA === null) return 1;
    if (idB === null) return -1;
    return idA - idB;
  });
  return cleaned;
}

function keyOf(record: Record<string, unknown>, sortBy: "id" | "slug"): string {
  return sortBy === "id" ? String(record.id ?? `slug:${record.slug}`) : String(record.slug);
}

function sharedOrderingIdentical(scenario: string, first: Record<string, unknown>[], second: Record<string, unknown>[], sortBy: "id" | "slug"): void {
  const secondKeys = new Set(second.map((record) => keyOf(record, sortBy)));
  const firstKeys = new Set(first.map((record) => keyOf(record, sortBy)));
  const sharedFirst = first.filter((record) => secondKeys.has(keyOf(record, sortBy)));
  const sharedSecond = second.filter((record) => firstKeys.has(keyOf(record, sortBy)));
  const sameOrder = sharedFirst.map((record) => keyOf(record, sortBy)).join("\n") === sharedSecond.map((record) => keyOf(record, sortBy)).join("\n");
  const sameContent = JSON.stringify(sharedFirst) === JSON.stringify(sharedSecond);
  expect(scenario, "two runs order the shared rows identically", sameOrder, { first: first.length, second: second.length, shared: sharedFirst.length });
  expect(scenario, "two runs serialise the shared rows byte-identically", sameContent, { shared: sharedFirst.length });
  const sorted = [...sharedFirst].sort((a, b) => {
    if (sortBy === "id") {
      const idA = typeof a.id === "number" ? a.id : null;
      const idB = typeof b.id === "number" ? b.id : null;
      if (idA === null && idB === null) return 0;
      if (idA === null) return 1;
      if (idB === null) return -1;
      return idA - idB;
    }
    return String(a.slug ?? "").localeCompare(String(b.slug ?? ""));
  });
  expect(scenario, `rows are ordered by ${sortBy}`, sorted.map((record) => keyOf(record, sortBy)).join("\n") === sharedFirst.map((record) => keyOf(record, sortBy)).join("\n"));
}

async function main() {
  const argv = process.argv.slice(2);
  const started = performance.now();
  const runDirectory = path.join(ROOT, "runs", "postgres-import", `${new Date().toISOString().replace(/[:.]/g, "-")}-exports`);
  const created = createDataClient({ env: { ...process.env, DATA_BACKEND: "postgres" }, argv });
  // The public read layer resolves its backend from the process env, so pin
  // the same target the factory chose: the app reads POSTGRES_POOLED_URL.
  process.env.DATA_BACKEND = "postgres";
  process.env.POSTGRES_POOLED_URL = created.target;
  expect("setup", "factory selected the Postgres backend", created.backend === "postgres", created.fingerprint);

  try {
    staticBoundary();

    const exportA = await scriptExport(created.client);
    const exportB = await scriptExport(created.client);
    expect("script-export", "no document bookkeeping fields survive", exportA.every((record) => !("_id" in record) && !("_creationTime" in record)));
    const scriptPrivate = findPrivateFields(exportA.map(({ editorial_review: _editorialReview, section_gaps: _sectionGaps, ...rest }) => rest)).filter((field) => !/\.references\[\d+\]\.authors/.test(field));
    expect("script-export", "no private-personal or credential fields in the corpus rows", scriptPrivate.length === 0, scriptPrivate.slice(0, 10));
    sharedOrderingIdentical("script-export", exportA, exportB, "id");

    const adapter = createDataPublicDataReadAdapter(queryData);
    const loaders: Record<OpenDataDataset["name"], () => Promise<readonly unknown[]>> = {
      // The synthetic fixture mints +/-Infinity ids, which JSON renders as null;
      // production ids are finite, so drop that fixture noise before the ordering check.
      SubstanceIndex: async () =>
        (await adapter.getPublicFullSubstanceDocuments()).filter((document) =>
          document.priority !== "low" && document.priority !== "hide_for_now" && (document.id == null || Number.isFinite(document.id))),
      EffectIndex: () => adapter.getPublicEffectArticles(),
      TripReports: async () => {
        const [reports, profiles] = await Promise.all([adapter.getPublicTripReportRecords(), adapter.getPublicContributorProfiles()]);
        return projectPublicReportDetails(reports, profiles);
      },
    };
    for (const dataset of Object.values(OPEN_DATA_DATASETS)) {
      const scenario = `open-data:${dataset.name}`;
      const build = async () => {
        const { json, count } = await buildOpenDataDocument({ ...dataset, loadItems: loaders[dataset.name] });
        return { count, document: JSON.parse(json) as Record<string, unknown> & { items: Record<string, unknown>[] } };
      };
      const [first, second] = [await build(), await build()];
      expect(scenario, "license envelope is the dataset's own constants", first.document.dataset === dataset.name && first.document.license === dataset.license && first.document.licenseUrl === OPEN_DATA_LICENSE_URL && first.document.source === OPEN_DATA_SOURCE && first.document.count === first.count && typeof first.document.generatedAt === "string");
      expect(scenario, `${first.count} items served from Postgres`, first.count > 0);
      const privateFields = findPrivateFields(first.document.items);
      expect(scenario, "no private, credential, staff-stamp, or bookkeeping fields", privateFields.length === 0, privateFields.slice(0, 10));
      sharedOrderingIdentical(scenario, first.document.items, second.document.items, dataset.sortBy);
    }
  } finally {
    const passed = checks.filter((check) => check.pass).length;
    const summary = {
      target: created.target.replace(/\/\/[^@]*@/, "//<redacted>@"),
      elapsedMs: Math.round(performance.now() - started),
      passed,
      failed: checks.length - passed,
      checks,
    };
    fs.mkdirSync(runDirectory, { recursive: true });
    fs.writeFileSync(path.join(runDirectory, "report.json"), JSON.stringify(summary, null, 2));
    console.log(`\nReport: ${path.relative(ROOT, runDirectory)}/report.json`);
    console.log(JSON.stringify({ passed, failed: summary.failed, elapsedMs: summary.elapsedMs }));
    process.exitCode = summary.failed === 0 ? 0 : 1;
    await created.client.end?.();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
