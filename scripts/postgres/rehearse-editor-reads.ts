/**
 * Rehearsal: the editor surfaces read through `/api/editor/*` route
 * handlers backed by the server read client, on Postgres, with no browser
 * database client. Every route handler is imported and invoked in-process with
 * `DATA_BACKEND=postgres`.
 *
 *   bun scripts/postgres/rehearse-editor-reads.ts [--target <url>] [--allow-remote]
 *
 * Read-only: nothing is written to the target. The report lands in
 * runs/postgres-import/<timestamp>-editor-reads/report.json.
 *
 * The session is forged the way the route tests forge it: the module behind
 * `requireRoleSession` is replaced (a Bun loader plugin, registered before the
 * routes load) with one that answers from a per-call role, so each route is
 * exercised signed out (401), from a foreign origin (403), and as an admin.
 *
 * Per route:
 *   1. auth: no session -> 401; foreign Origin / cross-site Sec-Fetch-Site -> 403.
 *   2. parity: the JSON body equals the registered query's own answer, so the
 *      hook receives exactly the native callable result shape.
 *   3. hygiene: the body never carries a Postgres URL, the admin key, or an
 *      admin intent token.
 * Plus: the paginated substance reads drain the fixture by continueCursor
 * without gaps or duplicates, and malformed query strings are 400s.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { FunctionReference } from "../../lib/postgres/runtime/api";
import { Pool } from "pg";
import { guardTarget, resolveTarget } from "./targetGuard";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ORIGIN = "https://editor.rehearsal.invalid";
const ADMIN = "actor@rehearsal.invalid";

type ForgedRole = "admin" | "editor" | "contributor" | null;
type ForgedSessionState = { role: ForgedRole };
const forgedSession: ForgedSessionState = { role: "admin" };
(globalThis as { __t20Session?: ForgedSessionState }).__t20Session = forgedSession;

// `bun` types are not in tsconfig.scripts.json; the global is present at runtime
// (same shape as scripts/postgres/preload-server-only.ts).
type BunLoaderPlugin = {
  plugin(spec: {
    name: string;
    setup(build: { onLoad(filter: { filter: RegExp }, load: () => { contents: string; loader: "ts" }): void }): void;
  }): void;
};
const bun = (globalThis as { Bun?: BunLoaderPlugin }).Bun;
if (!bun) throw new Error("rehearse-editor-reads.ts runs under Bun only");

// Registered before any route module resolves `@/lib/auth/requireEditorSession`,
// so `getServerSession` (which needs Next's request scope) is never reached.
bun.plugin({
  name: "rehearsal-forged-session",
  setup(build) {
    build.onLoad({ filter: /src\/lib\/auth\/requireEditorSession\.ts$/ }, () => ({
      loader: "ts",
      contents: `
        import { NextResponse } from "next/server";
        import { roleMeetsFloor } from "./roles";
        export async function requireRoleSession(floor) {
          const role = globalThis.__t20Session.role;
          if (!role) return { ok: false, response: NextResponse.json({ error: "Authentication required." }, { status: 401 }) };
          if (!roleMeetsFloor(role, floor)) {
            const label = floor.charAt(0).toUpperCase() + floor.slice(1);
            return { ok: false, response: NextResponse.json({ error: label + " access required." }, { status: 403 }) };
          }
          return { ok: true, role, session: { user: { email: ${JSON.stringify(ADMIN)}, role } } };
        }
      `,
    }));
  },
});

type Check = { scenario: string; check: string; pass: boolean; detail?: unknown };
const checks: Check[] = [];
function expect(scenario: string, check: string, pass: boolean, detail?: unknown): void {
  checks.push({ scenario, check, pass, ...(detail === undefined ? {} : { detail }) });
  console.log(`${pass ? "ok  " : "FAIL"} ${scenario}: ${check}${detail === undefined || pass ? "" : ` ${JSON.stringify(detail)}`}`);
}

type RouteHandler = (request: Request) => Promise<Response>;

function request(pathname: string, headers: Record<string, string> = {}): Request {
  return new Request(`${ORIGIN}${pathname}`, { method: "GET", headers: { "sec-fetch-site": "same-origin", ...headers } });
}

async function call(handler: RouteHandler, pathname: string, role: ForgedRole, headers?: Record<string, string>) {
  forgedSession.role = role;
  const response = await handler(request(pathname, headers));
  const text = await response.text();
  let body: unknown = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = null;
  }
  return { status: response.status, text, body, cacheControl: response.headers.get("cache-control") };
}

function canonical(value: unknown): string {
  return JSON.stringify(JSON.parse(JSON.stringify(value ?? null)));
}

function secrets(): string[] {
  return Object.entries(process.env)
    .filter(([name, value]) => (name === "DATA_ADMIN_KEY" || name.startsWith("DATA_ADMIN_TOKEN_") || name.startsWith("POSTGRES_")) && value && value.length >= 8)
    .map(([, value]) => value as string);
}

async function main() {
  const argv = process.argv.slice(2);
  const target = resolveTarget(argv);
  guardTarget(target, argv.includes("--allow-remote"));
  process.env.DATA_BACKEND = "postgres";
  process.env.POSTGRES_POOLED_URL = target;
  const pool = new Pool({ connectionString: target, max: 2 });
  const runDirectory = path.join(ROOT, "runs", "postgres-import", `${new Date().toISOString().replace(/[:.]/g, "-")}-editor-reads`);
  const started = performance.now();
  const leakNeedles = ["postgres://", "postgresql://", ...secrets()];

  try {
    // Dynamic on purpose: these modules must resolve after the forged-session
    // plugin above is registered, or the real `getServerSession` gate loads.
    const { api } = await import("../../lib/postgres/runtime/api");
    const { getServerDataReadClient } = await import("../../lib/data/serverClient");
    const client = getServerDataReadClient();

    const routes = {
      "index-layouts": (await import("../../src/app/api/editor/index-layouts/route")).GET,
      "category-layout": (await import("../../src/app/api/editor/category-layout/route")).GET,
      "contributor-profiles": (await import("../../src/app/api/editor/contributor-profiles/route")).GET,
      changelog: (await import("../../src/app/api/editor/changelog/route")).GET,
      "copy-blocks": (await import("../../src/app/api/editor/copy-blocks/route")).GET,
      "molecule-overrides": (await import("../../src/app/api/editor/molecule-overrides/route")).GET,
      substances: (await import("../../src/app/api/editor/substances/route")).GET,
      "banner-display": (await import("../../src/app/api/editor/banner-display/route")).GET,
    } satisfies Record<string, RouteHandler>;

    // Fixture handles for the by-slug reads.
    const [{ slug: substanceSlug }] = (await pool.query<{ slug: string }>('select slug from "substanceIndex" order by _id limit 1')).rows;
    const [{ slug: overrideSlug }] = (await pool.query<{ slug: string }>('select slug from "moleculeOverrides" order by _id limit 1')).rows;
    const [{ count: substanceCount }] = (await pool.query<{ count: string }>('select count(*)::text as count from "substanceIndex"')).rows;

    type Case = { route: keyof typeof routes; path: string; reference: FunctionReference<"query">; args: Record<string, unknown>; shape: (body: unknown) => boolean };
    const cases: Case[] = [
      { route: "index-layouts", path: "/api/editor/index-layouts", reference: api.indexLayouts.getAll, args: {}, shape: (body) => Array.isArray(body) && body.every((row) => typeof row.type === "string" && Array.isArray(row.categories)) },
      { route: "category-layout", path: "/api/editor/category-layout", reference: api.categoryLayout.get, args: {}, shape: (body) => body === null || (typeof body === "object" && Array.isArray((body as { categories?: unknown }).categories)) },
      { route: "contributor-profiles", path: "/api/editor/contributor-profiles", reference: api.contributorProfiles.getAll, args: {}, shape: (body) => Array.isArray(body) && body.every((row) => typeof row.key === "string") },
      { route: "changelog", path: "/api/editor/changelog?limit=100", reference: api.changelog.getRecent, args: { limit: 100 }, shape: (body) => Array.isArray(body) && body.every((row) => typeof row.entryId === "string" && typeof row.markdown === "string" && Array.isArray(row.articles)) },
      { route: "copy-blocks", path: "/api/editor/copy-blocks", reference: api.copyBlocks.getAll, args: {}, shape: (body) => Array.isArray(body) && body.every((row) => typeof row.key === "string") },
      { route: "molecule-overrides", path: "/api/editor/molecule-overrides", reference: api.moleculeOverrides.listSlugs, args: {}, shape: (body) => Array.isArray(body) && body.every((row) => typeof row.slug === "string") },
      { route: "molecule-overrides", path: `/api/editor/molecule-overrides?slug=${encodeURIComponent(overrideSlug)}`, reference: api.moleculeOverrides.getBySlug, args: { slug: overrideSlug }, shape: (body) => typeof body === "object" && body !== null && typeof (body as { molblock?: unknown }).molblock === "string" },
      { route: "molecule-overrides", path: `/api/editor/molecule-overrides?slug=${encodeURIComponent(overrideSlug)}&scope=metadata`, reference: api.moleculeOverrides.getMetadataBySlug, args: { slug: overrideSlug }, shape: (body) => typeof body === "object" && body !== null && "updatedAt" in body },
      { route: "substances", path: `/api/editor/substances?slug=${encodeURIComponent(substanceSlug)}`, reference: api.substanceIndex.getBySlug, args: { slug: substanceSlug }, shape: (body) => typeof body === "object" && body !== null && (body as { slug?: unknown }).slug === substanceSlug },
      { route: "banner-display", path: "/api/editor/banner-display", reference: api.siteConfig.getBannerDisplay, args: {}, shape: (body) => typeof body === "object" && body !== null && typeof (body as { iconSize?: unknown }).iconSize === "number" },
    ];

    for (const testCase of cases) {
      const scenario = testCase.path.replace("/api/editor/", "");
      const handler = routes[testCase.route];
      const signedOut = await call(handler, testCase.path, null);
      expect(scenario, "unauthenticated -> 401", signedOut.status === 401, { status: signedOut.status, body: signedOut.body });
      const foreignOrigin = await call(handler, testCase.path, "admin", { origin: "https://evil.example" });
      expect(scenario, "foreign Origin -> 403", foreignOrigin.status === 403, { status: foreignOrigin.status, body: foreignOrigin.body });
      const crossSite = await call(handler, testCase.path, "admin", { "sec-fetch-site": "cross-site" });
      expect(scenario, "cross-site Sec-Fetch-Site -> 403", crossSite.status === 403, { status: crossSite.status });
      const valid = await call(handler, testCase.path, "admin");
      expect(scenario, "admin session -> 200", valid.status === 200, { status: valid.status, body: valid.body });
      expect(scenario, "response is private, no-store", valid.cacheControl === "private, no-store", valid.cacheControl);
      expect(scenario, "body has the hook's shape", testCase.shape(valid.body), valid.body);
      const direct = await client.query(testCase.reference, testCase.args as never);
      expect(scenario, "body equals the registered query's answer", canonical(valid.body) === canonical(direct));
      const leaked = leakNeedles.filter((needle) => valid.text.includes(needle));
      expect(scenario, "no Postgres URL or credential in the body", leaked.length === 0, leaked.map((needle) => needle.slice(0, 12)));
    }

    // Role floors: the shell-wide reads admit a contributor; tool reads do not.
    const contributorLayouts = await call(routes["index-layouts"], "/api/editor/index-layouts", "contributor");
    expect("floors", "index-layouts admits a contributor", contributorLayouts.status === 200, contributorLayouts.status);
    const contributorCopy = await call(routes["copy-blocks"], "/api/editor/copy-blocks", "contributor");
    expect("floors", "copy-blocks refuses a contributor", contributorCopy.status === 403, contributorCopy.status);
    const editorBanner = await call(routes["banner-display"], "/api/editor/banner-display", "editor");
    expect("floors", "banner-display refuses an editor", editorBanner.status === 403, editorBanner.status);

    // Pagination: drain both projections by continueCursor.
    for (const page of ["lookup", "search-input"] as const) {
      const scenario = `substances?page=${page}`;
      const seen = new Set<string>();
      let cursor: string | null = null;
      let requests = 0;
      let done = false;
      let ordered = true;
      while (!done && requests < 50) {
        const result = await call(routes.substances, `/api/editor/substances?page=${page}&numItems=64${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`, "admin");
        requests += 1;
        if (result.status !== 200) {
          expect(scenario, "page request -> 200", false, { status: result.status, body: result.body });
          break;
        }
        const envelope = result.body as { page: Array<{ slug: string }>; continueCursor: string; isDone: boolean };
        for (const row of envelope.page) {
          if (seen.has(row.slug)) ordered = false;
          seen.add(row.slug);
        }
        done = envelope.isDone;
        cursor = envelope.continueCursor;
      }
      expect(scenario, "drain reaches isDone", done, { requests });
      expect(scenario, "no row repeats across pages", ordered);
      expect(scenario, "drain covers every fixture row", seen.size === Number(substanceCount), { drained: seen.size, expected: Number(substanceCount) });
      expect(scenario, "drain took more than one page", requests > 1, { requests });
    }

    // Malformed query strings are refused before the query runs.
    const noArgs = await call(routes.substances, "/api/editor/substances", "admin");
    expect("validation", "substances without slug or page -> 400", noArgs.status === 400, noArgs.status);
    const badPage = await call(routes.substances, "/api/editor/substances?page=lookup&numItems=abc", "admin");
    expect("validation", "substances with a malformed numItems -> 400", badPage.status === 400, badPage.status);
    const noLimit = await call(routes.changelog, "/api/editor/changelog", "admin");
    expect("validation", "changelog without limit -> 400", noLimit.status === 400, noLimit.status);
    const badScope = await call(routes["molecule-overrides"], `/api/editor/molecule-overrides?slug=${encodeURIComponent(overrideSlug)}&scope=svg`, "admin");
    expect("validation", "molecule-overrides with an unknown scope -> 400", badScope.status === 400, badScope.status);
    const missingSubstance = await call(routes.substances, "/api/editor/substances?slug=t20-no-such-substance", "admin");
    expect("validation", "unknown substance slug -> 200 null (the hook's not-found value)", missingSubstance.status === 200 && missingSubstance.body === null, missingSubstance.body);
  } finally {
    const passed = checks.filter((check) => check.pass).length;
    const summary = {
      ticket: "20",
      target: target.replace(/\/\/.*@/, "//<redacted>@"),
      backend: process.env.DATA_BACKEND,
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
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
