#!/usr/bin/env node
/**
 * Screenshot a `/dev` tool from a local screenshot-viewer dev server.
 *
 *   npm run dev:screenshot-viewer            # terminal 1, serves 127.0.0.1:3100
 *   npm run dev:screenshot -- /dev/replications
 *
 * The server side is `lib/auth/devScreenshotViewer.ts`: `/dev` documents render
 * without an account, while every `/api/*` route keeps its own session check.
 * This browser is read-only on top of that: it aborts every request that is not
 * GET or HEAD. By default it also answers the Replication Studio's reads with a
 * fixture built from the public `/api/v1/replications` projection, so the tab
 * renders real public rows instead of a 401 error panel. `--no-fixtures` skips
 * that and lets the private reads fail as they would for any signed-out visitor.
 */
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import { chromium } from "playwright-core";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    base: { type: "string", default: "http://127.0.0.1:3100" },
    out: { type: "string" },
    width: { type: "string", default: "1440" },
    height: { type: "string", default: "900" },
    "full-page": { type: "boolean", default: false },
    "no-fixtures": { type: "boolean", default: false },
    "wait-ms": { type: "string", default: "2500" },
    "fixture-rows": { type: "string", default: "300" },
    help: { type: "boolean", short: "h", default: false },
  },
});

if (values.help) {
  console.log(`Usage: npm run dev:screenshot -- [/dev/<tab>] [--base URL] [--out FILE]
  [--width N] [--height N] [--full-page] [--no-fixtures] [--wait-ms N] [--fixture-rows N]

Defaults: /dev/replications, http://127.0.0.1:3100, tmp/dev-screenshots/<tab>-<time>.png`);
  process.exit(0);
}

const devPath = positionals[0] ?? "/dev/replications";
if (devPath !== "/dev" && !devPath.startsWith("/dev/") && !devPath.startsWith("/dev?")) {
  throw new Error(`Only /dev paths are supported; received ${devPath}.`);
}

const base = new URL(values.base);
if (!["localhost", "127.0.0.1", "[::1]"].includes(base.hostname)) {
  throw new Error(`The screenshot viewer only runs against a loopback origin; received ${base.origin}.`);
}

const tabName = devPath.replace(/^\/dev\/?/, "").split(/[/?]/)[0] || "dev";
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const outPath = resolve(values.out ?? `tmp/dev-screenshots/${tabName}-${stamp}.png`);
mkdirSync(dirname(outPath), { recursive: true });

/** Public v1 rows reshaped to the studio's `StudioRow`; no private field is invented. */
async function buildStudioCorpusFixture(limitRows) {
  const rows = [];
  let cursor = null;
  do {
    const url = new URL("/api/v1/replications", base);
    url.searchParams.set("limit", "100");
    if (cursor) url.searchParams.set("cursor", cursor);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Public replication read failed (${response.status}) at ${url}.`);
    const page = await response.json();
    rows.push(...page.data);
    cursor = page.pagination?.next_cursor ?? null;
  } while (cursor && rows.length < limitRows);

  const titleCase = (slug) => slug.split("-").map((word) => word[0].toUpperCase() + word.slice(1)).join(" ");
  const studioRows = rows.slice(0, limitRows).map((row, index) => ({
    id: `public-${index}`,
    slug: row.slug,
    title: row.title,
    artist: row.artist,
    artist_url: row.artist_url ?? null,
    role: "replication",
    type: row.type,
    effect_slug: row.effect_slug ?? null,
    effect_name: row.effect_slug ? titleCase(row.effect_slug) : null,
    effect_tags: row.effect_tags ?? [],
    credit_line: row.rights?.credit_line ?? null,
    rights_status: row.rights?.status ?? null,
    url: row.url ?? null,
    thumbnail_url: row.thumbnail_url ?? null,
    preview_url: row.preview_url ?? null,
    format: row.format,
    duration: row.duration ?? null,
    file_size: row.file_size ?? null,
    created_at: row.created_at,
  }));
  const effectSlugs = new Set(studioRows.flatMap((row) => [row.effect_slug, ...row.effect_tags].filter(Boolean)));
  const effects = [...effectSlugs].sort().map((slug) => ({ slug, name: titleCase(slug) }));
  return { rows: studioRows, effects };
}

const fixtures = values["no-fixtures"] ? null : {
  corpus: await buildStudioCorpusFixture(Number(values["fixture-rows"])),
};

const browser = await chromium.launch({ headless: true });
let blockedWrites = 0;
try {
  const context = await browser.newContext({
    viewport: { width: Number(values.width), height: Number(values.height) },
  });

  await context.route("**/*", async (route) => {
    const request = route.request();
    const method = request.method().toUpperCase();
    if (method !== "GET" && method !== "HEAD") {
      blockedWrites += 1;
      console.warn(`blocked ${method} ${request.url()}`);
      return route.abort("blockedbyclient");
    }
    const url = new URL(request.url());
    if (fixtures && url.origin === base.origin) {
      if (url.pathname === "/api/dev/replications") {
        return route.fulfill({ json: { ok: true, ...fixtures.corpus } });
      }
      if (url.pathname === "/api/dev/replications/featured") {
        return route.fulfill({ json: { slugs: fixtures.corpus.rows.slice(0, 12).map((row) => row.slug), curated: false } });
      }
      if (url.pathname === "/api/dev/replications/playlists") {
        return route.fulfill({ json: { playlists: [] } });
      }
      // An empty directory keeps corpus tools from throwing into the error boundary.
      if (url.pathname === "/api/editor/contributor-profiles") {
        return route.fulfill({ json: [] });
      }
    }
    return route.continue();
  });

  const page = await context.newPage();
  const target = new URL(devPath, base);
  const response = await page.goto(target.toString(), { waitUntil: "domcontentloaded", timeout: 180_000 });
  const landed = new URL(page.url());
  if (landed.pathname === "/sign-in" || landed.pathname === "/unauthorized") {
    throw new Error(
      `Redirected to ${landed.pathname}: the screenshot viewer is not active. Start the server with npm run dev:screenshot-viewer.`,
    );
  }
  if (!response || response.status() >= 400) {
    throw new Error(`Loading ${target} answered ${response?.status() ?? "no response"}.`);
  }
  await page.waitForLoadState("networkidle", { timeout: 60_000 }).catch(() => undefined);
  await page.waitForTimeout(Number(values["wait-ms"]));
  await page.screenshot({ path: outPath, fullPage: values["full-page"] });
  console.log(outPath);
  if (blockedWrites) console.warn(`${blockedWrites} non-GET request(s) were blocked.`);
} finally {
  await browser.close();
}
