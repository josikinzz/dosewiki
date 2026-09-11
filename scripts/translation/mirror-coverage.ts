/**
 * Coverage audit for a live locale mirror: which English still shows, and why.
 *
 * Two lenses, because English reaches a mirror page by two routes:
 *
 *   store    Walks every public record of every mirrored kind, segments it
 *            exactly as the page does, and reports the segments the store
 *            lacks. Each miss is classified: `rejected` (the model failed a
 *            blocking gate; the defect codes come from translationRejections)
 *            or `pending` (never attempted, or attempted before the rejection
 *            table existed). Reads only, through POSTGRES_POOLED_URL; no
 *            write ceremony applies because nothing here writes.
 *
 *   render   Fetches mirror pages over HTTPS and flags every visible text line
 *            with no Han character. This catches what the store cannot see:
 *            chrome that bypasses t(), pages with no mirror route, record
 *            fields the corpus excludes, and stale ISR pages. Paths come from
 *            the English sitemap unless --paths is given.
 *
 * Usage:
 *   DATA_BACKEND=postgres bun --preload ./scripts/postgres/preload-server-only.ts scripts/translation/mirror-coverage.ts store
 *   DATA_BACKEND=postgres bun --preload ./scripts/postgres/preload-server-only.ts scripts/translation/mirror-coverage.ts store --kind=report --verbose
 *   bun scripts/translation/mirror-coverage.ts render
 *   bun scripts/translation/mirror-coverage.ts render --paths=/replications,/reports/ego-rebirth --verbose
 *
 * Options:
 *   --kind=<k>        Restrict `store` to one record kind.
 *   --slug=<a,b>      Restrict to these bare slugs.
 *   --host=<h>        Mirror host for `render` (default zh.dose.wiki).
 *   --base=<url>      Origin to fetch from with `Host: <host>` (default https://<host>); point it at a local `next start`.
 *   --paths=<a,b>     Paths for `render` instead of the sitemap.
 *   --limit=<n>       Cap the number of records or pages.
 *   --concurrency=<n> In-flight page fetches for `render` (default 8).
 *   --out=<file>      Write the full JSON report here (default runs/translation/coverage-<lens>-<ts>.json).
 *   --verbose         Print every English line or missing source, not just samples.
 *
 * Exit status is 1 when any miss is found, so the command doubles as a gate.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";

import { getPublicDataReadAdapter } from "../../lib/convex/publicData.reads";
import { getPostgresConvexClient } from "../../lib/postgres/runtime/backend";
import * as live from "../../lib/translation/liveTranslation";
import * as store from "../../lib/translation/segmentStore";
import { buildWorkUnits } from "./segment-manifest.mjs";

const LOCALE = "zh-Hans";

const { values, positionals } = parseArgs({
  args: process.argv.slice(2),
  allowPositionals: true,
  options: {
    kind: { type: "string" },
    slug: { type: "string" },
    host: { type: "string", default: "zh.dose.wiki" },
    base: { type: "string" },
    paths: { type: "string" },
    limit: { type: "string" },
    concurrency: { type: "string", default: "8" },
    out: { type: "string" },
    verbose: { type: "boolean", default: false },
  },
});

const lens = positionals[0];
if (lens !== "store" && lens !== "render") {
  throw new Error("Usage: mirror-coverage.ts <store|render> [options]");
}
const limit = values.limit ? Number(values.limit) : Infinity;
const slugFilter = values.slug ? new Set(values.slug.split(",").map((slug) => slug.trim()).filter(Boolean)) : null;

type StoreMiss = { hash: string; source: string; status: "rejected" | "pending"; defects: string[]; attempts: number };
type StoreRecord = { kind: live.TranslationRecordKind; slug: string; segments: number; missing: StoreMiss[] };

async function storeLens(): Promise<{ records: StoreRecord[]; totals: Record<string, number> }> {
  if (process.env.DATA_BACKEND !== "postgres" || !process.env.POSTGRES_POOLED_URL) {
    throw new Error("store needs DATA_BACKEND=postgres and POSTGRES_POOLED_URL (reads only)");
  }
  delete process.env.POSTGRES_DIRECT_URL;

  const reads = getPublicDataReadAdapter();
  const kinds = values.kind
    ? [requireKind(values.kind)]
    : live.TRANSLATION_RECORD_KINDS;
  const rejections = await store.readTranslationRejections(LOCALE);
  const records: StoreRecord[] = [];
  let seen = 0;
  try {
    for (const kind of kinds) {
      const publicRecords = (await live.publicRecords(reads, kind))
        .filter((record) => !slugFilter || slugFilter.has(record.slug))
        .slice(0, Math.max(0, Number.isFinite(limit) ? limit - seen : Infinity));
      seen += publicRecords.length;
      // One segmentation per record, one store round trip per kind.
      const perRecord = publicRecords.map((record) => {
        const segments = live.segmentsOf(record, kind);
        return { slug: record.slug, segments, units: buildWorkUnits(segments) };
      });
      const missing = new Set(await store.missingTranslationHashes(
        LOCALE,
        [...new Set(perRecord.flatMap((entry) => entry.units.map((unit) => unit.hash)))],
      ));
      for (const entry of perRecord) {
        records.push({
          kind,
          slug: entry.slug,
          segments: entry.segments.length,
          missing: entry.units.filter((unit) => missing.has(unit.hash)).map((unit) => {
            const rejection = rejections.get(unit.hash);
            return {
              hash: unit.hash,
              source: unit.source,
              status: rejection ? "rejected" : "pending",
              defects: rejection?.defects ?? [],
              attempts: rejection?.attempts ?? 0,
            };
          }),
        });
      }
    }
  } finally {
    await getPostgresConvexClient().end();
  }

  const totals = { records: records.length, incomplete: 0, missing: 0, rejected: 0, pending: 0 };
  for (const record of records) {
    if (record.missing.length > 0) totals.incomplete += 1;
    totals.missing += record.missing.length;
    totals.rejected += record.missing.filter((miss) => miss.status === "rejected").length;
    totals.pending += record.missing.filter((miss) => miss.status === "pending").length;
  }
  return { records, totals };
}

function requireKind(value: string): live.TranslationRecordKind {
  if (!live.TRANSLATION_RECORD_KINDS.includes(value as live.TranslationRecordKind)) {
    throw new Error(`Unknown --kind: ${value} (expected one of ${live.TRANSLATION_RECORD_KINDS.join(", ")})`);
  }
  return value as live.TranslationRecordKind;
}

function printStore({ records, totals }: Awaited<ReturnType<typeof storeLens>>) {
  const defectCounts = new Map<string, number>();
  for (const record of records) {
    if (record.missing.length === 0) continue;
    const rejected = record.missing.filter((miss) => miss.status === "rejected").length;
    console.log(`${record.kind}/${record.slug}: ${record.missing.length}/${record.segments} missing (${rejected} rejected, ${record.missing.length - rejected} pending)`);
    for (const miss of values.verbose ? record.missing : record.missing.slice(0, 3)) {
      const tag = miss.status === "rejected" ? `rejected ${miss.defects.join(",")} x${miss.attempts}` : "pending";
      console.log(`    [${tag}] ${miss.source.replace(/\s+/g, " ").slice(0, 110)}`);
      for (const defect of miss.defects) defectCounts.set(defect, (defectCounts.get(defect) ?? 0) + 1);
    }
  }
  console.log("");
  console.log(`Records       ${totals.records} checked, ${totals.incomplete} incomplete`);
  console.log(`Segments      ${totals.missing} missing: ${totals.rejected} rejected, ${totals.pending} pending`);
  if (defectCounts.size > 0) {
    console.log(`Defects       ${[...defectCounts].map(([code, n]) => `${code}=${n}`).join(", ")}`);
  }
}

const HAN = /[\u4e00-\u9fff]/;
/** Lines the English mirror legitimately leaves alone: bare URLs, citation lines, numbers, code. */
const LEGITIMATE = [/^https?:\/\//, /^\S+@\S+$/, /^[\d\s.,:/%+-]+$/, /^\[cite:/];

type RenderPage = { path: string; status: number; lines: number; cjk: number; english: string[]; names: string[]; verdict: "ok" | "partial" | "english" | "error" };

/**
 * Substance, artist, sponsor, and effect names stay in Latin script by rule 2
 * of the prompt, and they are the bulk of short Latin lines on a mirror page.
 * A line of one to three words with no sentence punctuation is reported as a
 * name, apart from the English lines, so chrome and prose stand out.
 */
function looksLikeName(line: string): boolean {
  return line.split(/\s+/).length <= 3 && !/[.,;:!?]/.test(line);
}

function visibleLines(html: string): string[] {
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/g, "")
    .replace(/<style[\s\S]*?<\/style>/g, "")
    .replace(/<template[\s\S]*?<\/template>/g, "")
    .replace(/<[^>]+>/g, "\n")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");
  return stripped.split("\n").map((line) => line.trim()).filter((line) => line.length >= 12);
}

async function sitemapPaths(): Promise<string[]> {
  const response = await fetch("https://dose.wiki/sitemap.xml");
  if (!response.ok) throw new Error(`sitemap fetch failed: ${response.status}`);
  const xml = await response.text();
  return [...xml.matchAll(/<loc>https?:\/\/[^/]+(\/[^<]*)<\/loc>/g)].map((match) => match[1]);
}

async function renderLens(): Promise<{ pages: RenderPage[]; totals: Record<string, number> }> {
  const host = values.host;
  const base = values.base ?? `https://${host}`;
  const paths = values.paths
    ? values.paths.split(",").map((entry) => entry.trim()).filter(Boolean)
    : await sitemapPaths();
  const queue = paths.slice(0, Number.isFinite(limit) ? limit : paths.length);
  const pages: RenderPage[] = [];
  let cursor = 0;
  await Promise.all(Array.from({ length: Number(values.concurrency) }, async () => {
    while (cursor < queue.length) {
      const pagePath = queue[cursor];
      cursor += 1;
      try {
        const response = await fetch(`${base}${pagePath}`, { headers: { host, "user-agent": "dosewiki-mirror-coverage" } });
        const html = await response.text();
        const lines = visibleLines(html);
        const latin = [...new Set(lines.filter((line) => !HAN.test(line) && !LEGITIMATE.some((pattern) => pattern.test(line))))];
        const english = latin.filter((line) => !looksLikeName(line));
        const names = latin.filter(looksLikeName);
        const cjk = (html.match(/[\u4e00-\u9fff]/g) ?? []).length;
        const verdict = response.status !== 200 ? "error" : cjk < 20 ? "english" : english.length > 0 ? "partial" : "ok";
        pages.push({ path: pagePath, status: response.status, lines: lines.length, cjk, english, names, verdict });
      } catch (error) {
        pages.push({ path: pagePath, status: 0, lines: 0, cjk: 0, english: [String(error)], names: [], verdict: "error" });
      }
    }
  }));
  pages.sort((a, b) => a.path.localeCompare(b.path));
  const totals = { pages: pages.length, ok: 0, partial: 0, english: 0, error: 0, englishLines: 0 };
  for (const page of pages) {
    totals[page.verdict] += 1;
    totals.englishLines += page.english.length;
  }
  return { pages, totals };
}

function printRender({ pages, totals }: Awaited<ReturnType<typeof renderLens>>) {
  const repeated = new Map<string, number>();
  for (const page of pages) for (const line of page.english) repeated.set(line, (repeated.get(line) ?? 0) + 1);
  for (const page of pages) {
    if (page.verdict === "ok") continue;
    console.log(`${page.path}: ${page.verdict} (${page.status}, ${page.english.length} English lines, ${page.names.length} name-like, ${page.cjk} Han chars)`);
    for (const line of values.verbose ? page.english : page.english.slice(0, 3)) {
      console.log(`    ${line.slice(0, 110)}`);
    }
  }
  const chrome = [...repeated].filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1]);
  if (chrome.length > 0) {
    console.log("");
    console.log("Repeated across pages (chrome or shared copy):");
    for (const [line, n] of chrome.slice(0, values.verbose ? chrome.length : 20)) console.log(`    ${n}x ${line.slice(0, 100)}`);
  }
  console.log("");
  console.log(`Pages         ${totals.pages} fetched: ${totals.ok} ok, ${totals.partial} partial, ${totals.english} English, ${totals.error} error`);
  console.log(`Lines         ${totals.englishLines} English lines`);
}

async function writeReport(name: string, report: unknown): Promise<string> {
  const file = values.out ?? path.join("runs", "translation", `coverage-${name}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(report, null, 1));
  return file;
}

if (lens === "store") {
  const report = await storeLens();
  printStore(report);
  console.log(`Report        ${await writeReport("store", report)}`);
  process.exitCode = report.totals.missing > 0 ? 1 : 0;
} else {
  const report = await renderLens();
  printRender(report);
  console.log(`Report        ${await writeReport("render", report)}`);
  process.exitCode = report.totals.partial + report.totals.english + report.totals.error > 0 ? 1 : 0;
}
