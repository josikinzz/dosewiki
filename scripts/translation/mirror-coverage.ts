/** Read-only semantic storage and hydrated DOM coverage. Neither proves translation fidelity. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { resolveLocaleIdentity } from "../../src/i18n/localeRegistry.mjs";
import type { TranslationRecordKind } from "../../lib/translation/liveTranslation";
import type { WorkUnit } from "./engine.mjs";
import { guardTarget } from "../postgres/targetGuard";

const { values, positionals } = parseArgs({
  args: process.argv.slice(2), allowPositionals: true,
  options: {
    locale: { type: "string", default: "zh-Hans" }, kind: { type: "string" }, slug: { type: "string" },
    host: { type: "string" }, base: { type: "string" }, paths: { type: "string" },
    limit: { type: "string", default: "100" }, concurrency: { type: "string", default: "4" },
    out: { type: "string" }, verbose: { type: "boolean", default: false },
    target: { type: "string" }, "allow-remote": { type: "boolean", default: false },
    evidence: { type: "string" },
  },
});
const locale = resolveLocaleIdentity(values.locale);
const limit = Number(values.limit);
const concurrency = Number(values.concurrency);
if (!Number.isInteger(limit) || limit < 1 || !Number.isInteger(concurrency) || concurrency < 1 || concurrency > 16) {
  throw new Error("limit must be positive and concurrency must be between 1 and 16");
}
const slugs = values.slug ? new Set(values.slug.split(",")) : null;

async function storeLens() {
  const target = values.target ?? process.env.TARGET_POSTGRES_URL;
  if (!target) throw new Error("store requires --target or TARGET_POSTGRES_URL");
  guardTarget(target, values["allow-remote"]);
  process.env.DATA_BACKEND = "postgres";
  process.env.POSTGRES_POOLED_URL = target;
  delete process.env.POSTGRES_DIRECT_URL;
  const [live, store, { getPublicDataReadAdapter }, { getPostgresClient }] = await Promise.all([
    import("../../lib/translation/liveTranslation"), import("../../lib/translation/segmentStore"),
    import("../../lib/data/publicData.reads"), import("../../lib/postgres/runtime/backend"),
  ]);
  const kinds = values.kind ? [values.kind as TranslationRecordKind] : live.TRANSLATION_RECORD_KINDS;
  if (kinds.some((kind) => !live.TRANSLATION_RECORD_KINDS.includes(kind))) throw new Error("Unknown record kind");
  const records: Array<{
    kind: TranslationRecordKind;
    slug: string;
    units: WorkUnit[];
  }> = [];
  let occurrences = 0;
  try {
    const context = await live.loadTranslationContext(locale.code);
    const reads = getPublicDataReadAdapter();
    for (const kind of kinds) {
      const sources = (await live.publicRecords(reads, kind))
        .filter((record) => !slugs || slugs.has(record.slug))
        .slice(0, Math.max(0, limit - records.length));
      for (const source of sources) {
        const units = live.workUnitsOf(live.segmentsOf(source, kind), kind);
        records.push({ kind, slug: source.slug, units });
        occurrences += units.length;
      }
    }

    const hashes = [...new Set(records.flatMap((record) => record.units.map((unit) => unit.hash)))];
    const [translations, staleHashes, rejections] = await Promise.all([
      store.readTranslations(locale.code, hashes),
      store.readStaleTranslationHashes(locale.code, context.promptVersion),
      store.readTranslationRejections(locale.code, hashes),
    ]);
    const stale = new Set(staleHashes);
    const totals = {
      records: records.length,
      occurrences,
      hashes: hashes.length,
      current: 0,
      missing: 0,
      stale: 0,
      rejected: 0,
    };
    for (const hash of hashes) {
      if (!translations.has(hash)) totals.missing += 1;
      else if (stale.has(hash)) totals.stale += 1;
      else totals.current += 1;
      if (rejections.has(hash)) totals.rejected += 1;
    }
    const coveredRecords = records.map(({ kind, slug, units }) => ({
      kind,
      slug,
      results: units.map((unit) => {
        const status = !translations.has(unit.hash)
          ? "missing"
          : stale.has(unit.hash)
            ? "stale"
            : "current";
        const rejection = rejections.get(unit.hash);
        return {
          id: unit.hash,
          source: unit.source,
          status,
          target: translations.get(unit.hash),
          defects: rejection?.defects ?? [],
        };
      }),
    }));
    return {
      lens: "store",
      locale: locale.code,
      promptVersion: context.promptVersion,
      totals,
      records: coveredRecords,
      fidelityReviewed: false,
      ready: totals.missing + totals.stale + totals.rejected === 0,
    };
  } finally { await getPostgresClient().end(); }
}

type SurfaceExpectation = { path: string; selector: string; text: string; kind: "localized" | "canonical"; surface: string };
async function renderLens() {
  const host = values.host ?? locale.publicHost;
  if (!values.base && !host) throw new Error("Unlaunched locale needs an explicit local --base and --paths");
  const base = values.base ?? `https://${host}`;
  const origin = new URL(base);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname);
  if (!locale.publicHost && !local) throw new Error("Canary coverage must use a local origin");
  let routes = values.paths?.split(",").filter(Boolean);
  if (!routes) {
    const response = await fetch(`${base}/sitemap.xml`);
    if (!response.ok) throw new Error(`Sitemap request failed: ${response.status}`);
    routes = [...(await response.text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => new URL(match[1]).pathname);
  }
  const expectations: SurfaceExpectation[] = values.evidence ? JSON.parse(await readFile(values.evidence, "utf8")) : [];
  const { chromium } = await import("playwright-core");
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const queue = [...new Set(routes)].slice(0, limit);
  const pages: Array<Record<string, unknown>> = [];
  let cursor = 0;
  try {
    await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      try {
        while (cursor < queue.length) {
          const route = queue[cursor++];
          try {
            const response = await page.goto(new URL(route, base).href, { waitUntil: "networkidle", timeout: 60_000 });
            const snapshot = await page.evaluate(() => {
              const candidates: Array<{ text: string; source: string; lang: string; canonical: boolean }> = [];
              const root = document.body;
              const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
              for (let node = walker.nextNode(); node; node = walker.nextNode()) {
                const element = node.parentElement;
                const text = node.textContent?.trim();
                if (!element || !text || element.closest("script,style,template,noscript,[hidden],[aria-hidden=true]")) continue;
                const style = getComputedStyle(element);
                if (style.display === "none" || style.visibility === "hidden" || element.getClientRects().length === 0) continue;
                const lang = element.closest("[lang]")?.getAttribute("lang") ?? "";
                candidates.push({ text, source: "text", lang, canonical: !!element.closest("code,pre,[data-canonical-source]") || lang === "en" });
              }
              for (const element of document.querySelectorAll("[aria-label],[title],[placeholder]")) {
                if (element.closest("[hidden],[aria-hidden=true]")) continue;
                for (const attr of ["aria-label", "title", "placeholder"]) {
                  const text = element.getAttribute(attr);
                  if (text) candidates.push({ text, source: attr, lang: element.closest("[lang]")?.getAttribute("lang") ?? "", canonical: false });
                }
              }
              return { title: document.title, description: document.querySelector('meta[name="description"]')?.getAttribute("content") ?? "", languages: [...document.querySelectorAll("[lang]")].map((element) => element.getAttribute("lang")), candidates, overflow: document.documentElement.scrollWidth > innerWidth };
            });
            const checks = [];
            for (const expectation of expectations.filter((entry) => entry.path === route)) {
              const actual = await page.locator(expectation.selector).allTextContents();
              checks.push({ ...expectation, passed: actual.some((text) => text.trim() === expectation.text) });
            }
            const untranslated = snapshot.candidates.filter((entry) => !entry.canonical && /[A-Za-z]{3}/.test(entry.text) && (locale.coveragePolicy.script !== "simplified-han" || !/\p{Script=Han}/u.test(entry.text)));
            const status = response?.status() ?? 0;
            // Script ratio is diagnostic only. No page is approved without exact surface evidence.
            const verdict = status !== 200 ? "error" : !snapshot.languages.includes(locale.htmlLanguage) || checks.some((check) => !check.passed) || snapshot.overflow ? "failed" : checks.length === 0 || untranslated.length > 0 ? "review-required" : "verified-surfaces";
            pages.push({ path: route, url: page.url(), status, verdict, ...snapshot, untranslated, checks });
          } catch (error) { pages.push({ path: route, verdict: "error", error: String(error) }); }
        }
      } finally { await page.close(); }
    }));
  } finally { await browser.close(); }
  pages.sort((a, b) => String(a.path).localeCompare(String(b.path)));
  return { lens: "render", locale: locale.code, fidelityReviewed: false, pages, ready: pages.length > 0 && pages.every((page) => page.verdict === "verified-surfaces") };
}

const lens = positionals[0];
if (lens !== "store" && lens !== "render") throw new Error("Usage: mirror-coverage.ts <store|render> --locale <code> [options]");
const report = await (lens === "store" ? storeLens() : renderLens());
const out = values.out ?? path.join("runs", "translation", `coverage-${lens}-${Date.now()}.json`);
await mkdir(path.dirname(out), { recursive: true });
await writeFile(out, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ out, locale: locale.code, ready: report.ready, ...(values.verbose ? { report } : {}) }, null, 2));
process.exitCode = report.ready ? 0 : 1;
