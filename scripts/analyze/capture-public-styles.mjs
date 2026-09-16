#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";

// Run only after an independently built public artifact is ready. The authored
// plan names every route, saved storage state, viewport and interaction covered.
// Unused ranges are inspection evidence, never permission to remove a rule.
const [planPath] = process.argv.slice(2);
if (!planPath) throw new Error("Usage: node scripts/analyze/capture-public-styles.mjs <plan.json>");
const plan = JSON.parse(await readFile(planPath, "utf8"));
const origin = new URL(plan.baseUrl);
const localHost = plan.localHost ?? null;
if (localHost && (!["http:", "https:"].includes(origin.protocol) || !origin.port
  || origin.hostname !== localHost || !/^[a-z0-9.-]+$/.test(localHost))) {
  throw new Error("localHost must match an explicit HTTP(S) host and port mapped to loopback");
}
if (!localHost && !["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname)) {
  throw new Error("Stylesheet inspection requires a local production-shaped artifact");
}
if (!plan.artifactIdentity || !plan.dataIdentity || !plan.cases?.length) {
  throw new Error("Plan requires artifactIdentity, dataIdentity and explicit cases");
}
await mkdir(plan.outputDirectory, { recursive: true });
const browser = await chromium.launch({
  executablePath: plan.executablePath,
  headless: true,
  args: localHost ? [`--host-resolver-rules=MAP ${localHost} 127.0.0.1`, "--no-proxy-server"] : [],
});
const browserVersion = browser.version();
const results = [];
try {
  for (const [index, scenario] of plan.cases.entries()) {
    const url = new URL(scenario.path, origin);
    if (url.origin !== origin.origin) throw new Error("Case must remain on the local artifact");
    const context = await browser.newContext({
      viewport: scenario.viewport,
      reducedMotion: scenario.reducedMotion ?? "no-preference",
      colorScheme: scenario.colorScheme ?? "dark",
    });
    try {
      await context.addInitScript((storage) => {
        for (const [key, value] of Object.entries(storage)) localStorage.setItem(key, value);
      }, scenario.storage ?? {});
      // Inspection cannot submit feedback, analytics, or editorial writes.
      await context.route("**/*", (route) => {
        return ["GET", "HEAD"].includes(route.request().method()) ? route.continue() : route.abort();
      });
      const page = await context.newPage();
      await page.coverage.startCSSCoverage({ resetOnNavigation: false });
      if (scenario.media) await page.emulateMedia({ media: scenario.media });
      const response = await page.goto(url.href, { waitUntil: "networkidle" });
      if (!response?.ok()) throw new Error(`Coverage route unavailable: ${url.href} (${response?.status()})`);
      for (const action of scenario.actions ?? []) {
        if (action.type === "scroll") {
          await page.evaluate((y) => window.scrollTo(0, y), action.y);
        } else if (["click", "focus", "hover"].includes(action.type)) {
          await page.locator(action.selector)[action.type]();
        } else if (action.type === "press") {
          await page.locator(action.selector).press(action.key);
        } else {
          throw new Error(`Unsupported inspection action: ${action.type}`);
        }
      }
      await page.waitForLoadState("networkidle");
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: path.join(plan.outputDirectory, `${index}.png`), fullPage: true });
      const coverage = await page.coverage.stopCSSCoverage();
      const resources = await page.evaluate(() => performance.getEntriesByType("resource").map((entry) => ({
        url: entry.name, initiatorType: entry.initiatorType, transferSize: entry.transferSize,
        encodedBodySize: entry.encodedBodySize, decodedBodySize: entry.decodedBodySize,
        startTime: entry.startTime, duration: entry.duration,
      })));
      const sheets = coverage.map((sheet) => ({
        ...sheet,
        sha256: createHash("sha256").update(sheet.text).digest("hex"),
        decodedBytes: Buffer.byteLength(sheet.text),
        usedCodeUnits: sheet.ranges.reduce((sum, range) => sum + range.end - range.start, 0),
      }));
      results.push({ scenario, finalUrl: page.url(), resources, sheets, screenshot: `${index}.png` });
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
  await writeFile(path.join(plan.outputDirectory, "coverage.json"), JSON.stringify({
    capturedAt: new Date().toISOString(), browserVersion, plan,
    complete: results.length === plan.cases.length, results,
  }, null, 2));
}
