/**
 * Ticket 21 child: runs the app's own read compositions and route handlers
 * in-process under whatever `DATA_BACKEND` the parent set, with Next's
 * `next/cache` replaced by an in-memory `unstable_cache` that honours keys,
 * tags, and `revalidate` seconds (the same shape `publicData.cache.test.ts`
 * mocks). Spawned by `parity-public-reads.ts`; one JSON result per phase.
 *
 *   bun scripts/postgres/parityInProcess.ts routes    <samples.json> <out.json>
 *   bun scripts/postgres/parityInProcess.ts freshness <out.json>
 *   bun scripts/postgres/parityInProcess.ts flavor    <samples.json> <out.json>
 */

import fs from "node:fs";
import { gunzipSync } from "node:zlib";
import { guardTarget } from "./targetGuard";

// `bun` types are not in tsconfig.scripts.json; the global is present at runtime (same pattern as preload-server-only.ts).
type BunPlugin = { plugin(spec: { name: string; setup(build: { module(name: string, load: () => { contents: string; loader: "js" }): void }): void }): void };
const bun = (globalThis as { Bun?: BunPlugin }).Bun;
if (!bun) throw new Error("parityInProcess.ts runs under Bun only");

type CacheEntry = { value: unknown; tags: string[]; storedAt: number; revalidate: number | false | undefined };
type CacheStub = { store: Map<string, CacheEntry>; keys: string[][]; now: () => number; skewMs: number; revalidatedTags: string[] };

declare global {
  var __parityCache: CacheStub | undefined;
}

// Must be registered before any app module loads: `publicDataCache` binds
// `unstable_cache` at import time, and the real one throws without a Next
// incremental cache. This is why the app imports below are dynamic.
bun.plugin({
  name: "t21-next-cache",
  setup(build) {
    build.module("next/cache", () => ({
      loader: "js",
      contents: `
const stub = { store: new Map(), keys: [], skewMs: 0, revalidatedTags: [] };
stub.now = () => Date.now() + stub.skewMs;
globalThis.__parityCache = stub;
export function unstable_cache(callback, keys, options = {}) {
  return async (...args) => {
    const key = JSON.stringify([keys, args]);
    stub.keys.push(keys);
    const hit = stub.store.get(key);
    const fresh = hit && (typeof options.revalidate !== "number" || stub.now() - hit.storedAt < options.revalidate * 1000);
    if (fresh) return hit.value;
    const value = await callback(...args);
    stub.store.set(key, { value, tags: options.tags ?? [], storedAt: stub.now(), revalidate: options.revalidate });
    return value;
  };
}
export function revalidateTag(tag) {
  stub.revalidatedTags.push(tag);
  for (const [key, entry] of stub.store) if (entry.tags.includes(tag)) stub.store.delete(key);
}
export function revalidatePath() {}
export function updateTag(tag) { revalidateTag(tag); }
`,
    }));
  },
});

type Samples = {
  substanceSlugs: string[];
  effectSlugs: string[];
  replicationSlugs: string[];
  moleculeSlugs: string[];
};

export type RouteResult = {
  key: string;
  path: string;
  status: number;
  contentType: string | null;
  body: unknown;
  ms: number;
  error?: string;
};

type RouteModule = {
  GET: (request: Request, context: { params: Promise<Record<string, string>> }) => Promise<Response>;
};

async function callRoute(key: string, module: RouteModule, path: string, params: Record<string, string> = {}): Promise<RouteResult> {
  const started = performance.now();
  try {
    const response = await module.GET(new Request(`https://dose.wiki${path}`), { params: Promise.resolve(params) });
    const contentType = response.headers.get("content-type");
    let body: unknown;
    if (response.headers.get("content-encoding") === "gzip") {
      body = JSON.parse(gunzipSync(Buffer.from(await response.arrayBuffer())).toString("utf8"));
    } else if (contentType?.includes("json")) {
      body = await response.json();
    } else {
      body = await response.text();
    }
    return { key, path, status: response.status, contentType, body, ms: performance.now() - started };
  } catch (error) {
    return { key, path, status: 0, contentType: null, body: null, ms: performance.now() - started, error: error instanceof Error ? error.stack ?? error.message : String(error) };
  }
}

async function runRoutes(samples: Samples): Promise<RouteResult[]> {
  const [meta, openapi, substances, substance, substanceReplications, reagentTests, replications, replication, effectReplications, molecule, openSubstances, openEffects, openReports] = await Promise.all([
    import("../../src/app/api/v1/meta/route"),
    import("../../src/app/api/v1/openapi.json/route"),
    import("../../src/app/api/v1/substances/route"),
    import("../../src/app/api/v1/substances/[slug]/route"),
    import("../../src/app/api/v1/substances/[slug]/replications/route"),
    import("../../src/app/api/v1/substances/[slug]/reagent-tests/route"),
    import("../../src/app/api/v1/replications/route"),
    import("../../src/app/api/v1/replications/[slug]/route"),
    import("../../src/app/api/v1/effects/[slug]/replications/route"),
    import("../../src/app/api/v1/molecules/[slug]/route"),
    import("../../src/app/open-data/SubstanceIndex.json/route"),
    import("../../src/app/open-data/EffectIndex.json/route"),
    import("../../src/app/open-data/TripReports.json/route"),
  ]);
  const results: RouteResult[] = [];
  results.push(await callRoute("v1/meta", meta as RouteModule, "/api/v1/meta"));
  results.push(await callRoute("v1/openapi", openapi as RouteModule, "/api/v1/openapi.json"));
  results.push(await callRoute("v1/substances", substances as RouteModule, "/api/v1/substances?limit=100"));
  for (const slug of samples.substanceSlugs) {
    results.push(await callRoute("v1/substances/[slug]", substance as RouteModule, `/api/v1/substances/${slug}`, { slug }));
  }
  for (const slug of samples.substanceSlugs.slice(0, 10)) {
    results.push(await callRoute("v1/substances/[slug]/replications", substanceReplications as RouteModule, `/api/v1/substances/${slug}/replications?limit=100`, { slug }));
    results.push(await callRoute("v1/substances/[slug]/reagent-tests", reagentTests as RouteModule, `/api/v1/substances/${slug}/reagent-tests`, { slug }));
  }
  results.push(await callRoute("v1/replications", replications as RouteModule, "/api/v1/replications?limit=100"));
  for (const slug of samples.replicationSlugs) {
    results.push(await callRoute("v1/replications/[slug]", replication as RouteModule, `/api/v1/replications/${slug}`, { slug }));
  }
  for (const slug of samples.effectSlugs) {
    results.push(await callRoute("v1/effects/[slug]/replications", effectReplications as RouteModule, `/api/v1/effects/${slug}/replications`, { slug }));
  }
  for (const slug of samples.moleculeSlugs) {
    results.push(await callRoute("v1/molecules/[slug]", molecule as RouteModule, `/api/v1/molecules/${slug}`, { slug }));
  }
  // Open-data routes take no request; wrap them so the same collector applies.
  const openData = (module: { GET: () => Promise<Response> }): RouteModule => ({ GET: () => module.GET() });
  results.push(await callRoute("open-data/SubstanceIndex", openData(openSubstances), "/open-data/SubstanceIndex.json"));
  results.push(await callRoute("open-data/EffectIndex", openData(openEffects), "/open-data/EffectIndex.json"));
  results.push(await callRoute("open-data/TripReports", openData(openReports), "/open-data/TripReports.json"));
  return results;
}

type Check = { check: string; pass: boolean; detail?: unknown };

async function runFreshness(): Promise<{ checks: Check[]; slug: string }> {
  const checks: Check[] = [];
  const expect = (check: string, pass: boolean, detail?: unknown) => { checks.push({ check, pass, detail }); };
  const [{ PostgresConvexClient }, { api }, { getPublicSubstanceBySlug }, { revalidateSavedPaths }, cacheModule, { minimalArticle }, { Pool }, { deleteDocument, selectDocuments, withTransaction }, { articlePublicationKey }] = await Promise.all([
    import("../../lib/postgres/runtime/client"),
    import("../../convex/_generated/api"),
    import("../../lib/convex/publicData.substances"),
    import("../../src/app/api/save-to-convex/revalidateSavedPaths"),
    import("../../lib/convex/publicData.cache"),
    import("../../src/test/fixtures/articles"),
    import("pg"),
    import("../../lib/postgres/documentStore"),
    import("../../lib/postgres/articlePublication"),
  ]);
  const url = process.env.POSTGRES_POOLED_URL!;
  // The freshness phase is the only writer in ticket 21: refuse anything but a local target,
  // whatever the environment says. `--allow-remote` is deliberately not accepted here.
  guardTarget(url, false);
  const client = PostgresConvexClient.fromUrl(url);
  const pool = new Pool({ connectionString: url, max: 2 });
  const slug = `t21-${Math.random().toString(36).slice(2, 10)}`;
  const stub = globalThis.__parityCache!;
  try {
    const { rows: [admin] } = await pool.query<{ email: string }>(`select email from memberships where role='admin' and "bannedAt" is null limit 1`);
    if (!admin) throw new Error("no admin membership in the local fixture");
    const apiKey = process.env.CONVEX_ADMIN_TOKEN_EDITOR_ARTICLE_WRITE ?? process.env.CONVEX_ADMIN_KEY;
    const scratch = () => {
      // `section_gaps` is editorial bookkeeping outside the write validator's key set.
      const { section_gaps: _gaps, ...article } = structuredClone(minimalArticle) as Record<string, unknown>;
      return article;
    };
    const save = (summary: string) => client.mutation(api.substanceIndex.saveSubstances, {
      apiKey,
      actorEmail: admin.email,
      articles: [{ ...scratch(), id: null, slug, title: `Ticket 21 ${slug}`, summary }] as never,
    });
    const read = async () => (await getPublicSubstanceBySlug(slug))?.summary ?? null;

    const created = await save("revision 1");
    expect("mutation creates the scratch article through the runtime", created.outcomes?.[0]?.action === "created", created.outcomes?.[0]);
    expect("adapter read sees revision 1", (await read()) === "revision 1");
    const keyAfterFirstRead = stub.keys.find((keys) => keys[0] === "convex-public-substance-by-slug");
    expect("cache leaf key carries the postgres backend and URL", keyAfterFirstRead?.[1] === `postgres:${url}`, keyAfterFirstRead);

    const updated = await save("revision 2");
    expect("mutation updates the scratch article", updated.outcomes?.[0]?.action === "updated", updated.outcomes?.[0]);
    expect("without revalidation the persistent leaf still serves revision 1 (cache policy in effect)", (await read()) === "revision 1");
    const [outbox] = await selectDocuments(pool, "publicCachePublications", { where: '"key" = $1', params: [articlePublicationKey(slug)] });
    expect("mutation queued the article publication outbox row", outbox?.pending === true, outbox && { generation: outbox.generation, pending: outbox.pending });

    const receipts = await revalidateSavedPaths([`/${slug}`], "manual");
    expect("write path revalidation applied locally", receipts.some((receipt) => receipt.target === "local" && receipt.status === "accepted"), receipts);
    expect("revalidation expired the article tag", stub.revalidatedTags.includes(cacheModule.publicSubstanceTag(slug)), stub.revalidatedTags);
    expect("adapter read sees revision 2 immediately after revalidation", (await read()) === "revision 2");

    await save("revision 3");
    expect("revision 3 stays hidden inside the revalidate window", (await read()) === "revision 2");
    stub.skewMs = (cacheModule.PUBLIC_CONVEX_CACHE_REVALIDATE_SECONDS + 1) * 1000;
    expect(`time-based policy serves revision 3 after ${cacheModule.PUBLIC_CONVEX_CACHE_REVALIDATE_SECONDS}s without any tag`, (await read()) === "revision 3");
    stub.skewMs = 0;

    // Backend identity: the same leaf under DATA_BACKEND=convex must not reuse the Postgres entry.
    const postgresKeys = stub.keys.filter((keys) => keys[0] === "convex-public-substance-by-slug").length;
    process.env.DATA_BACKEND = "convex";
    process.env.CONVEX_PUBLIC_READ_URL = "https://t21-unreachable.invalid";
    let convexError: string | null = null;
    let convexValue: unknown = "not read";
    try {
      convexValue = await read();
    } catch (error) {
      convexError = error instanceof Error ? error.message : String(error);
    }
    process.env.DATA_BACKEND = "postgres";
    const convexKeys = stub.keys.filter((keys) => keys[0] === "convex-public-substance-by-slug").slice(postgresKeys);
    expect("convex backend did not receive the postgres cache entry", convexValue === "not read" && convexError !== null, { convexError, convexValue });
    expect("convex backend keyed its leaf by the convex read URL", convexKeys.length > 0 && convexKeys.every((keys) => keys[1] === "https://t21-unreachable.invalid"), convexKeys);
    expect("postgres backend still serves revision 3 after the convex attempt", (await read()) === "revision 3");
  } finally {
    await withTransaction(pool, async (tx) => {
      const [article] = await selectDocuments(tx, "substanceIndex", { where: '"slug" = $1', params: [slug] });
      if (article) {
        for (const row of await selectDocuments(tx, "reviewedArticles", { where: '"article_id" = $1', params: [article._id] })) await deleteDocument(tx, "reviewedArticles", row._id as string);
        await deleteDocument(tx, "substanceIndex", article._id as string);
      }
      for (const table of ["articleRevisions", "generatedPublicationOperations"] as const) {
        for (const row of await selectDocuments(tx, table, { where: '"slug" = $1', params: [slug] })) await deleteDocument(tx, table, row._id as string);
      }
      for (const row of await selectDocuments(tx, "publicCachePublications", { where: '"key" = $1', params: [articlePublicationKey(slug)] })) {
        await deleteDocument(tx, "publicCachePublications", row._id as string);
      }
    });
    const { rows: leftovers } = await pool.query<{ n: number }>(`select count(*)::int as n from "substanceIndex" where slug = $1`, [slug]);
    checks.push({ check: "scratch article removed", pass: leftovers[0].n === 0 });
    await client.end();
    await pool.end();
  }
  return { checks, slug };
}

/**
 * Effect Index public reads on Postgres with no usable Convex credential: the
 * parent strips every `CONVEX_ADMIN|DEPLOY|AGENT` variable, and this phase
 * substitutes deliberately invalid placeholders for the deployment variables
 * `lib/postgres/runtime/deploymentEnv.ts` requires to be present. A read that
 * needed a real credential, or an admin intent token, cannot pass here.
 */
async function runFlavor(samples: Samples): Promise<{ checks: Check[]; credentialEnv: string[]; intentTokenEnv: string[]; placeholders: string[] }> {
  const credentialEnv = Object.keys(process.env).filter((key) => /^CONVEX_(ADMIN|DEPLOY|AGENT)/.test(key));
  const checks: Check[] = [];
  const [flavor, deploymentEnv, effects, replications, articles, blog, reports, about, copy, banners, contributors] = await Promise.all([
    import("../../src/config/siteFlavor"),
    import("../../lib/postgres/runtime/deploymentEnv"),
    import("../../lib/convex/publicData.effects"),
    import("../../lib/convex/publicData.replications"),
    import("../../lib/convex/publicData.articles"),
    import("../../lib/convex/publicData.blog"),
    import("../../lib/convex/publicData.reports"),
    import("../../lib/convex/publicData.about"),
    import("../../lib/next/copyBlocks"),
    import("../../lib/next/warningBanners"),
    import("../../lib/convex/publicData.contributors"),
  ]);
  const intentTokenEnv = deploymentEnv.adminIntentEnvVars().filter((name) => (process.env[name] ?? "").trim().length > 0);
  checks.push({ check: "process resolved the effectindex flavor", pass: flavor.SITE_FLAVOR === "effectindex" && flavor.SITE_FLAVOR_CONFIG === flavor.SITE_FLAVOR_CONFIGS.effectindex, detail: flavor.SITE_FLAVOR });
  checks.push({ check: "no Convex credential env vars present", pass: credentialEnv.length === 0, detail: credentialEnv });
  checks.push({ check: "no admin intent tokens present", pass: intentTokenEnv.length === 0, detail: intentTokenEnv });

  // The runtime refuses to open a client while a required deployment variable is
  // absent, and the public compositions degrade to their checked-in fallbacks
  // instead of throwing. Prove that, then fill the requirement with values no
  // authorization check can accept.
  const beforePlaceholders = deploymentEnv.inspectDeploymentEnv().missingRequired;
  let degraded: unknown = "not read";
  let degradedError: string | null = null;
  try {
    degraded = await copy.getCopyBlocks();
  } catch (error) {
    degradedError = error instanceof Error ? error.message : String(error);
  }
  checks.push({ check: "public read degrades to the checked-in fallback rather than throwing while required deployment vars are absent", pass: degradedError === null && degraded !== "not read", detail: { missingRequired: beforePlaceholders, degradedError } });

  const placeholders: string[] = [];
  for (const name of deploymentEnv.REQUIRED_DEPLOYMENT_ENV) {
    if ((process.env[name] ?? "").trim().length > 0) continue;
    process.env[name] = `t21-invalid-${name.toLowerCase()}`;
    placeholders.push(name);
  }
  globalThis.__parityCache!.store.clear();
  checks.push({ check: "required deployment variables are satisfied by non-authorizing placeholders", pass: deploymentEnv.inspectDeploymentEnv().missingRequired.length === 0, detail: placeholders });

  const reads: Array<[string, () => Promise<unknown>, boolean]> = [
    ["getPublicEffects", () => effects.getPublicEffects(), true],
    ["getPublicEffectBySlug", () => effects.getPublicEffectBySlug(samples.effectSlugs[0]), false],
    ["getPublicEffectArticles", () => effects.getPublicEffectArticles(), false],
    ["getPublicReplicationsByEffect", () => effects.getPublicReplicationsByEffect(samples.effectSlugs[0]), false],
    ["getPublicReplications", () => effects.getPublicReplications(), true],
    ["getPublicFeaturedReplicationSlugs", () => replications.getPublicFeaturedReplicationSlugs(), false],
    ["getPublishedEffectIndexArticles", () => articles.getPublishedEffectIndexArticles(), false],
    ["getPublicEffectIndexPosts", () => blog.getPublicEffectIndexPosts(), false],
    ["getPublicReports", () => reports.getPublicReports(), true],
    ["getPublicReportDetails", () => reports.getPublicReportDetails(), true],
    ["getPublicAboutData", () => about.getPublicAboutData(), false],
    ["getCopyBlocks", () => copy.getCopyBlocks(), false],
    ["getWarningBannerPresets", () => banners.getWarningBannerPresets(), false],
    ["getPublicContributorProfiles", () => contributors.getPublicContributorProfiles(), true],
  ];
  for (const [name, run, mustCarryRows] of reads) {
    const started = performance.now();
    try {
      const value = await run();
      const rows = Array.isArray(value) ? value.length : null;
      // A corpus-backed list that comes back empty is the fallback, not the database.
      const pass = !mustCarryRows || (rows !== null && rows > 0);
      checks.push({ check: `${name} serves Postgres data without a usable credential`, pass, detail: { rows: rows ?? (value === null ? "null" : typeof value), ms: Math.round(performance.now() - started) } });
    } catch (error) {
      checks.push({ check: `${name} serves Postgres data without a usable credential`, pass: false, detail: error instanceof Error ? error.message : String(error) });
    }
  }
  return { checks, credentialEnv, intentTokenEnv, placeholders };
}

async function main() {
  const [phase, ...rest] = process.argv.slice(2);
  let result: unknown;
  let outFile: string;
  if (phase === "routes") {
    const [samplesFile, out] = rest;
    outFile = out;
    result = { backend: process.env.DATA_BACKEND ?? "convex", routes: await runRoutes(JSON.parse(fs.readFileSync(samplesFile, "utf8")) as Samples) };
  } else if (phase === "freshness") {
    [outFile] = rest;
    result = await runFreshness();
  } else if (phase === "flavor") {
    const [samplesFile, out] = rest;
    outFile = out;
    result = await runFlavor(JSON.parse(fs.readFileSync(samplesFile, "utf8")) as Samples);
  } else {
    throw new Error(`unknown phase ${phase}`);
  }
  fs.writeFileSync(outFile, JSON.stringify(result));
  process.exit(0);
}

main().catch((error) => {
  console.error(error instanceof Error ? `${error.name}: ${error.message}\n${error.stack ?? ""}` : error);
  // The parent reads the exit code; a phase that threw must never look like an empty success.
  process.exit(1);
});
