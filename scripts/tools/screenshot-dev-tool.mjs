#!/usr/bin/env node
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import { chromium } from "playwright-core";

import { assertLoopbackBase, installFixtureRoutes, waitForDevShellReady } from "./journeys/browserFixtures.mjs";
import { JOURNEY_ROLES, TOOL_STATES, createJourneyFixture } from "./journeys/fixtures.mjs";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    base: { type: "string", default: "http://127.0.0.1:3100" },
    out: { type: "string" },
    width: { type: "string", default: "1440" },
    height: { type: "string", default: "900" },
    "full-page": { type: "boolean", default: false },
    "no-fixtures": { type: "boolean", default: false },
    role: { type: "string", default: "admin" },
    state: { type: "string", default: "loaded" },
    theme: { type: "string", default: "dark" },
    touch: { type: "boolean", default: false },
    ready: { type: "string" },
    "fixture-rows": { type: "string", default: "24" },
    help: { type: "boolean", short: "h", default: false },
  },
});

if (values.help) {
  console.log(`Usage: npm run dev:screenshot -- [/dev/<tab>] [--base URL] [--out FILE]
  [--width N] [--height N] [--full-page] [--theme light|dark] [--touch]
  [--role ${JOURNEY_ROLES.join("|")}] [--state ${TOOL_STATES.join("|")}]
  [--ready TEXT] [--fixture-rows N] [--no-fixtures]

Defaults: /dev/replications, http://127.0.0.1:3100, admin, loaded, dark,
tmp/dev-screenshots/<tab>-<time>.png`);
  process.exit(0);
}

const devPath = positionals[0] ?? "/dev/replications";
if (devPath !== "/dev" && !devPath.startsWith("/dev/") && !devPath.startsWith("/dev?")) {
  throw new Error(`Only /dev paths are supported; received ${devPath}.`);
}
if (values.theme !== "light" && values.theme !== "dark") throw new Error(`--theme is light or dark; received ${values.theme}.`);

const base = assertLoopbackBase(values.base);
const tabName = devPath.replace(/^\/dev\/?/, "").split(/[/?]/)[0] || "dev";
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const outPath = resolve(values.out ?? `tmp/dev-screenshots/${tabName}-${stamp}.png`);
mkdirSync(dirname(outPath), { recursive: true });

const fixture = values["no-fixtures"]
  ? null
  : createJourneyFixture({ role: values.role, state: values.state, replicationRows: Number(values["fixture-rows"]) });

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({
    viewport: { width: Number(values.width), height: Number(values.height) },
    colorScheme: values.theme,
    ...(values.touch ? { hasTouch: true, isMobile: true, deviceScaleFactor: 3 } : {}),
  });
  await context.addInitScript(() => window.localStorage.setItem("dosewiki-theme", "system"));
  const { blocked } = await installFixtureRoutes(context, { base, fixture, log: (line) => console.warn(line) });

  const page = await context.newPage();
  const target = new URL(devPath, base);
  const response = await page.goto(target.toString(), { waitUntil: "domcontentloaded", timeout: 180_000 });
  const landed = new URL(page.url());
  if (landed.pathname === "/sign-in" || landed.pathname === "/unauthorized") {
    throw new Error(
      `Redirected to ${landed.pathname}: the screenshot viewer is not active. Start the server with npm run dev:journeys-server.`,
    );
  }
  if (!response || response.status() >= 400) {
    throw new Error(`Loading ${target} answered ${response?.status() ?? "no response"}.`);
  }
  await waitForDevShellReady(page);
  if (fixture) {
    await page.getByText(fixture.session.user.name, { exact: true }).first().waitFor({ state: "attached", timeout: 30_000 });
    await waitForDevShellReady(page);
  }
  if (values.ready) await page.getByText(values.ready).first().waitFor({ timeout: 30_000 });
  await page.screenshot({ path: outPath, fullPage: values["full-page"] });
  console.log(outPath);
  if (blocked.length) console.warn(`${blocked.length} request(s) were blocked in the browser.`);
  if (fixture?.unhandled.length) {
    console.warn(`No fixture answered: ${[...new Set(fixture.unhandled.map((entry) => `${entry.method} ${entry.pathname}`))].join(", ")}`);
  }
} finally {
  await browser.close();
}
