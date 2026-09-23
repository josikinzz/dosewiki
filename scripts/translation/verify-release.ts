/** Read-only browser evidence for the catalog and the reported appearance/gallery labels. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { chromium } from "playwright-core";
import { evaluateReleaseEvidence } from "./release-evidence.mjs";
import { resolveLocaleIdentity } from "../../src/i18n/localeRegistry.mjs";

const { values } = parseArgs({ options: {
  locale: { type: "string", default: "zh-Hans" },
  base: { type: "string" },
  paths: { type: "string", default: "/,/replications" },
  out: { type: "string" },
} });
const locale = resolveLocaleIdentity(values.locale);
if (!values.base && !locale.publicHost) throw new Error("An unlaunched locale requires an explicit local --base.");
const base = new URL(values.base ?? `https://${locale.publicHost}`);
if (!["http:", "https:"].includes(base.protocol) || base.username || base.password) throw new Error("Use an HTTP(S) base without credentials.");
if (!locale.publicHost && !["localhost", "127.0.0.1", "[::1]"].includes(base.hostname)) throw new Error("Unlaunched locale verification must use a local origin.");
const routes = [...new Set(values.paths.split(",").filter(Boolean))];
if (!routes.length || routes.some((route) => !route.startsWith("/") || new URL(route, base).origin !== base.origin)) throw new Error("Pass at least one same-origin App Path.");
type Publication = { catalogDigest: string; exactLabels: Record<string, { source: string; target: string }> };
const publications = JSON.parse(await readFile(new URL("../../src/i18n/catalogPublication.json", import.meta.url), "utf8")) as Record<string, Publication>;
const publication = publications[locale.code];
if (!publication) throw new Error("Build this locale's catalog before verifying publication.");
const catalog = JSON.parse(await readFile(new URL(`../../content/i18n/messages/${locale.code}.json`, import.meta.url), "utf8")) as Record<string, string>;
const appearanceName = catalog["Appearance settings"] ?? "Appearance settings";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const pages = [];
try {
  for (const route of routes) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    try {
      const response = await page.goto(new URL(route, base).href, { waitUntil: "networkidle", timeout: 60_000 });
      const observedDigest = await page.locator('meta[name="dosewiki-translation-catalog"]').first().getAttribute("content", { timeout: 5_000 }).catch(() => null);
      const checks: { id: string; expected: string; passed: boolean }[] = [];
      const gallery = publication.exactLabels["gallery.replications"];
      if (gallery) {
        const candidates = page.getByText(gallery.target, { exact: true });
        let visible = false;
        for (let index = 0; index < await candidates.count(); index++) visible ||= await candidates.nth(index).isVisible();
        checks.push({ id: "gallery.replications", expected: gallery.target, passed: visible });
      }
      const cogs = page.getByRole("button", { name: appearanceName, exact: true });
      let opened = false;
      for (let index = 0; index < await cogs.count(); index++) {
        if (await cogs.nth(index).isVisible()) { await cogs.nth(index).click(); opened = true; break; }
      }
      for (const id of ["appearance.light", "appearance.dark"]) {
        const expected = publication.exactLabels[id]?.target;
        if (!expected) throw new Error(`Compiled catalog lacks required exact label ${id}.`);
        const label = page.locator('[data-appearance-axis="color-scheme"]').getByRole("radio", { name: expected, exact: true });
        const passed = opened && await label.first().waitFor({ state: "visible", timeout: 5_000 }).then(() => true).catch(() => false);
        checks.push({ id, expected, passed });
      }
      pages.push({ path: route, url: page.url(), status: response?.status() ?? 0, observedDigest, checks,
        ...evaluateReleaseEvidence({ expectedDigest: publication.catalogDigest, observedDigest, checks, status: response?.status() ?? 0 }) });
    } catch (error) {
      pages.push({ path: route, verified: false, failures: [error instanceof Error ? error.message : String(error)] });
    } finally { await page.close(); }
  }
} finally { await browser.close(); }
const report = { locale: locale.code, checkedAt: new Date().toISOString(), expectedDigest: publication.catalogDigest,
  scope: "Catalog artifact and specified rendered appearance/gallery surfaces only. Article fidelity and unvisited routes are not verified.",
  verified: pages.length > 0 && pages.every((page) => page.verified), pages };
const out = values.out ?? path.join("runs", "translation", `release-${Date.now()}.json`);
await mkdir(path.dirname(out), { recursive: true });
await writeFile(out, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ out, verified: report.verified, pages: pages.length }));
process.exitCode = report.verified ? 0 : 1;
