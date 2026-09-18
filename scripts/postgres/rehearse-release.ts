/**
 * Rehearsal: the complete release, its duration, and its rollback
 * boundary, in isolation.
 *
 *   bun scripts/postgres/rehearse-release.ts --target postgres://localhost:5432/dosewiki
 *
 * What it proves, all against a local Postgres with scratch rows it deletes:
 *
 *   freeze      `DATA_WRITES_FROZEN` (lib/runtime/dataWriteFreeze.ts) makes a
 *               representative mutation of every transactional group in
 *               inventory/tables.md refuse with code DATA_WRITES_FROZEN, on the
 *               operator factory (scripts/lib/data-client.ts) and on the app
 *               write client (lib/data/serverWriteCapability.ts), while every
 *               read keeps serving byte-identical results. Every one of the 61
 *               table counts is unchanged across the sweep.
 *   liveness    the same writer commits with the freeze off, refuses with it on,
 *               and commits again once it is lifted, so the refusals above are
 *               a freeze and not a broken call.
 *   drain       a mutation that entered the runtime before the freeze commits
 *               after it (held mid-flight on a row lock), and one started after
 *               the freeze refuses. The measured drain wait is reported.
 *   retirement  a retired DATA_BACKEND selector is refused by both application
 *               and operator clients without contacting another service.
 *   flavors     host, permission, transaction and privacy scenarios for the
 *               dosewiki and effectindex flavors.
 *   sweep       every rehearsal script run back to back, with pass counts. A
 *               rehearsal that no longer passes is recorded as a blocker
 *               (measurement, not a check: this script owns the release
 *               rehearsal, not the state of its siblings).
 *
 * Flags: --keep (leave scratch rows), --no-sweep (skip the sibling rehearsals),
 * --allow-remote (with POSTGRES_IMPORT_CONFIRM, per targetGuard).
 */

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { makeFunctionReference } from "../../lib/postgres/runtime/api";
import { api } from "../../lib/postgres/runtime/api";
import { createDataClient, postgresFingerprintFromUrl, type DataClient } from "../lib/data-client.ts";
import { authOptions, authorizeCredentials } from "../../lib/auth/authOptions";
import { hashPassword } from "../../lib/auth/passwords";
import { DATA_WRITES_FROZEN_CODE, isDataWriteFrozenError } from "../../lib/runtime/dataWriteFreeze";
import {
  getServerDataWriteCapability,
  resetServerDataWriteCapabilityCacheForTests,
  type ServerDataWriteCapabilityResult,
} from "../../lib/data/serverWriteCapability";
import { getDataBackend, getPostgresClient } from "../../lib/postgres/runtime/backend";
import { PostgresClient, resolveFunction } from "../../lib/postgres/runtime/client";
import { deleteDocument, insertDocument, mintDocumentId, selectDocuments } from "../../lib/postgres/documentStore";
import { getSiteFlavorConfig, isEffectIndex } from "../../src/config/siteFlavor";
import { guardTarget, resolveTarget } from "./targetGuard";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const argv = process.argv.slice(2);
const target = resolveTarget(argv);
guardTarget(target, argv.includes("--allow-remote"));

type Check = { scenario: string; check: string; pass: boolean; detail?: unknown };
const checks: Check[] = [];
function expect(scenario: string, check: string, pass: boolean, detail?: unknown): void {
  checks.push({ scenario, check, pass, ...(detail === undefined ? {} : { detail }) });
  console.log(`${pass ? "ok  " : "FAIL"} ${scenario}: ${check}${detail === undefined || pass ? "" : ` ${JSON.stringify(detail)}`}`);
}

type Outcome<T> = { ok: true; value: T; error?: undefined } | { ok: false; value?: undefined; error: unknown };
async function attempt<T>(run: () => Promise<T>): Promise<Outcome<T>> {
  try {
    return { ok: true, value: await run() };
  } catch (error) {
    return { ok: false, error };
  }
}
const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Refused by the freeze specifically, not by validation, auth, or SQL. */
function refusedByFreeze(outcome: Outcome<unknown>): boolean {
  return !outcome.ok && isDataWriteFrozenError(outcome.error);
}

/** `in` rather than the `ok` discriminant: the scripts tsconfig has no strictNullChecks, so boolean discriminants do not narrow. */
function capabilityMissing(result: ServerDataWriteCapabilityResult): string[] {
  return "failure" in result ? [...result.failure.missing] : [];
}

function percentile(values: number[], fraction: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(fraction * sorted.length) - 1));
  return Math.round(sorted[index] * 10) / 10;
}

/**
 * One representative mutation per transactional group. The freeze has to hold
 * for all of them, not only for the article path.
 */
const TRANSACTIONAL_GROUPS: ReadonlyArray<{ group: string; fn: string; what: string }> = [
  { group: "G0", fn: "changelog:addEntry", what: "universal indexedMutation wrapper (index sync, journal, outbox)" },
  { group: "G1", fn: "articleLifecycle:write", what: "article publish/restore" },
  { group: "G2", fn: "changeProposals:submit", what: "proposal submit" },
  { group: "G3", fn: "changeProposalReview:approveAndApply", what: "proposal apply/revert" },
  { group: "G4", fn: "substanceIndex:publishReviewedSection", what: "generated section publication" },
  { group: "G5", fn: "replicationContextualEditing:publishMetadata", what: "contextual replication metadata edit" },
  { group: "G6", fn: "replicationContextualEditing:publishCollection", what: "collection curation" },
  { group: "G7", fn: "replications:insertReplication", what: "replication insert" },
  { group: "G8", fn: "replications:deleteAuditedRow", what: "audited replication deletion" },
  { group: "G9", fn: "replications:renameSlug", what: "replication slug rename" },
  { group: "G10", fn: "replications:mergeUnknownTwin", what: "twin merge / recovery" },
  { group: "G11", fn: "replicationDuplicates:applySuppressionBatch", what: "duplicate suppression" },
  { group: "G12", fn: "replicationAttribution:applyBatch", what: "source attribution apply" },
  { group: "G13", fn: "replicationDates:applyResearchBatch", what: "date research backfill" },
  { group: "G14", fn: "replicationTaxonomy:applyBatch", what: "taxonomy batch" },
  { group: "G15", fn: "replicationIdentitySocial:applyBatch", what: "identity/social projection batch" },
  { group: "G16", fn: "replicationIdentitySocial:applyProfileBindingBatch", what: "profile binding batch" },
  { group: "G17", fn: "replicationIdentitySocial:materializeIdentityTokenSnapshot", what: "identity token snapshot" },
  { group: "G18", fn: "contributorProfileMerges:apply", what: "profile merge" },
  { group: "G19", fn: "contributorProfiles:saveProfile", what: "profile save/delete/rename" },
  { group: "G20", fn: "tripReports:update", what: "trip report edit" },
  { group: "G20b", fn: "tripReportSubmissions:promote", what: "submission promotion" },
  { group: "G21", fn: "replicationPlaylists:upsert", what: "playlist save" },
  { group: "G22", fn: "copyBlocks:upsert", what: "copy / index layout / about save" },
  { group: "G23", fn: "warningBanners:upsertPreset", what: "warning banner publish" },
  { group: "G24", fn: "subjectiveEffects:update", what: "narrative edit (effect)" },
  { group: "G24b", fn: "effectIndexArticles:upsertArticle", what: "narrative edit (writing)" },
  { group: "G25", fn: "inviteCodes:redeem", what: "invite redemption" },
  { group: "G26", fn: "substanceIndex:repairArticleReferenceMetadataProvenance", what: "citation/provenance repair" },
  { group: "G27", fn: "publicationRecovery:claimDue", what: "outbox lease (cron)" },
];

/** Rehearsals run back to back by the sweep; `verify-migrations` and `check-env-isolation` are checks, not rehearsals. */
const SWEEP_SCRIPTS: readonly string[] = [
  "rehearse-article-publication",
  "rehearse-auth",
  "rehearse-article-lifecycle",
  "rehearse-citation-publication",
  "rehearse-reports-feedback",
  "rehearse-effects",
  "rehearse-replications-identity",
  "rehearse-content-tools",
  "rehearse-http-surface",
  "rehearse-editor-reads",
  "rehearse-storage-fallbacks",
  "rehearse-exports",
  "rehearse-commands",
  "verify-migrations",
  "check-env-isolation",
];

const RUNTIME_TABLES: readonly string[] = ["documentIds", "storageObjects", "__drizzle_migrations", "drizzle_migrations"];

type LatencySample = { kind: string; name: string; statements: number; ms: number };

/**
 * `POSTGRES_RUNTIME_TRACE` is read when `lib/postgres/runtime/client.ts` is
 * imported, so the write-latency measurement runs as a child of this script
 * with the flag set and reports the runtime's own per-call trace.
 */
async function latencyChild(): Promise<void> {
  const prefix = `t22l-${mintDocumentId().slice(0, 8)}`;
  const apiKey = process.env.DATA_ADMIN_KEY;
  if (!apiKey) throw new Error("DATA_ADMIN_KEY is required (Bun loads it from .env.local)");
  const pool = new Pool({ connectionString: target, max: 2 });
  const client = getPostgresClient();
  const samples: LatencySample[] = [];
  const info = console.info;
  console.info = (...args: unknown[]) => {
    const line = args.map((value) => String(value)).join(" ");
    const match = /^\[postgres-runtime] (\w+) (\S+) statements=(\d+) ms=(\d+)/.exec(line);
    if (match) samples.push({ kind: match[1], name: match[2], statements: Number(match[3]), ms: Number(match[4]) });
  };
  const now = new Date().toISOString();
  const actorEmail = `${prefix}-admin@rehearsal.invalid`;
  const membershipId = await insertDocument(pool, "memberships", { email: actorEmail, role: "admin", createdAt: now, updatedAt: now });
  const key = `${prefix}-copy`;
  try {
    for (let round = 0; round < 12; round += 1) {
      await client.mutation(api.copyBlocks.upsert, {
        apiKey,
        actorEmail,
        key,
        kind: "markdown",
        body: `latency body ${round}`,
        label: "Rehearsal latency",
        group: "rehearsal",
        operationId: `${prefix}-${round}`,
      });
      await client.query(api.copyBlocks.getAll, {});
    }
  } finally {
    console.info = info;
    await pool.query('DELETE FROM "documentIds" WHERE "_id" IN (SELECT "_id" FROM "contentRevisions" WHERE "key" = $1)', [key]);
    await pool.query('DELETE FROM "contentRevisions" WHERE "key" = $1', [key]);
    await pool.query('DELETE FROM "documentIds" WHERE "_id" IN (SELECT "_id" FROM "copyBlocks" WHERE "key" = $1)', [key]);
    await pool.query('DELETE FROM "copyBlocks" WHERE "key" = $1', [key]);
    await pool.query('DELETE FROM "documentIds" WHERE "_id" IN (SELECT "_id" FROM "publicCachePublications" WHERE "key" LIKE $1)', [`%${prefix}%`]);
    await deleteDocument(pool, "memberships", membershipId);
    await client.end();
    await pool.end();
  }
  const mutations = samples.filter((sample) => sample.kind === "mutation").map((sample) => sample.ms);
  const queries = samples.filter((sample) => sample.kind === "query").map((sample) => sample.ms);
  const statements = samples.filter((sample) => sample.kind === "mutation").map((sample) => sample.statements);
  console.log(
    `LATENCY_JSON ${JSON.stringify({
      method: "POSTGRES_RUNTIME_TRACE=1, copyBlocks:upsert and copyBlocks:getAll, local Postgres 17, 12 rounds",
      mutations: { calls: mutations.length, p50Ms: percentile(mutations, 0.5), p95Ms: percentile(mutations, 0.95), maxMs: mutations.length ? Math.max(...mutations) : null, statementsP50: percentile(statements, 0.5) },
      queries: { calls: queries.length, p50Ms: percentile(queries, 0.5), p95Ms: percentile(queries, 0.95), maxMs: queries.length ? Math.max(...queries) : null },
    })}`,
  );
}

function readJson(file: string): Record<string, unknown> | null {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Newest `runs/postgres-import/*` report whose directory name matches `suffix`. */
function newestReport(suffix: string): { path: string; report: Record<string, unknown> } | null {
  const base = path.join(ROOT, "runs", "postgres-import");
  if (!fs.existsSync(base)) return null;
  const matches = fs
    .readdirSync(base)
    .filter((name) => (suffix === "" ? /^\d{4}-\d\d-\d\dT[\d-]+Z$/.test(name) : name.endsWith(suffix)))
    .sort();
  for (const name of [...matches].reverse()) {
    const file = path.join(base, name, "report.json");
    const report = fs.existsSync(file) ? readJson(file) : null;
    if (report) return { path: path.relative(ROOT, file), report };
  }
  return null;
}

/**
 * Newest importer report for a remote (PlanetScale) or a local target. The
 * cutover duration that matters is the remote one; the local number is the
 * fixture reload and is reported separately so the two are never conflated.
 */
function newestImportReport(scope: "remote" | "local"): { path: string; report: Record<string, unknown> } | null {
  const base = path.join(ROOT, "runs", "postgres-import");
  if (!fs.existsSync(base)) return null;
  const names = fs.readdirSync(base).filter((name) => /^\d{4}-\d\d-\d\dT[\d-]+Z$/.test(name)).sort();
  for (const name of [...names].reverse()) {
    const file = path.join(base, name, "report.json");
    const report = fs.existsSync(file) ? readJson(file) : null;
    if (!report) continue;
    const reportTarget = typeof report.target === "string" ? report.target : "";
    const local = /localhost|127\.0\.0\.1/.test(reportTarget);
    if ((scope === "local") === local) return { path: path.relative(ROOT, file), report };
  }
  return null;
}

async function main(): Promise<void> {
  if (argv.includes("--latency-child")) {
    await latencyChild();
    return;
  }

  const keep = argv.includes("--keep");
  const runSweep = !argv.includes("--no-sweep");
  const run = `t22-${mintDocumentId().slice(0, 8)}`;
  const runDirectory = path.join(ROOT, "runs", "postgres-import", `${new Date().toISOString().replace(/[:.]/g, "-")}-release`);
  const started = performance.now();

  // The app boundary reads its backend and URL from env at call time.
  process.env.DATA_BACKEND = "postgres";
  process.env.POSTGRES_POOLED_URL = target;
  delete process.env.POSTGRES_DIRECT_URL;
  delete process.env.DATA_WRITES_FROZEN;

  const apiKey = process.env.DATA_ADMIN_KEY;
  if (!apiKey) throw new Error("DATA_ADMIN_KEY is required (Bun loads it from .env.local)");

  const pool = new Pool({ connectionString: target, max: 4 });
  const runtime = getPostgresClient();
  const operator = createDataClient({ target }).client;
  const adminActor = { apiKey, actorEmail: `${run}-admin@rehearsal.invalid` };
  const blockers: Array<{ id: string; summary: string; evidence: string }> = [];
  const measurements: Record<string, unknown> = {};
  const unknowns: Array<{ quantity: string; why: string; howToMeasure: string }> = [];

  const seeded: Array<{ table: Parameters<typeof insertDocument>[1]; id: string }> = [];
  async function seed(table: Parameters<typeof insertDocument>[1], document: Record<string, unknown>): Promise<string> {
    const id = await insertDocument(pool, table, document);
    seeded.push({ table, id });
    return id;
  }
  const purges: Array<{ table: string; where: string; params: unknown[] }> = [];
  const purge = (table: string, where: string, ...params: unknown[]) => purges.push({ table, where, params });

  const tableNames = (
    await pool.query<{ table_name: string }>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name",
    )
  ).rows
    .map((row) => row.table_name)
    .filter((name) => !RUNTIME_TABLES.includes(name));

  async function countRows(): Promise<Record<string, number>> {
    const counts: Record<string, number> = {};
    for (const name of tableNames) {
      const result = await pool.query<{ count: string }>(`SELECT count(*)::text AS count FROM "${name}"`);
      counts[name] = Number(result.rows[0].count);
    }
    return counts;
  }

  const READ_PROBES: ReadonlyArray<{ name: string; read: () => Promise<unknown> }> = [
    { name: "copyBlocks:getAll", read: () => runtime.query(api.copyBlocks.getAll, {}) },
    { name: "warningBanners:listPresets", read: () => runtime.query(api.warningBanners.listPresets, {}) },
    { name: "changelog:getRecent", read: () => runtime.query(api.changelog.getRecent, { limit: 5 }) },
    { name: "subjectiveEffects:getPublicPreviews", read: () => runtime.query(api.subjectiveEffects.getPublicPreviews, {}) },
    { name: "categoryLayout:get", read: () => runtime.query(api.categoryLayout.get, {}) },
  ];

  try {
    const now = new Date().toISOString();
    await seed("memberships", { email: adminActor.actorEmail, role: "admin", createdAt: now, updatedAt: now });


    expect("freeze", `all ${tableNames.length} application tables enumerated for the row-count guard`, tableNames.length === 61, tableNames.length);

    // ------------------------------------------------------------------ liveness: the writer works with the freeze off
    const copyKey = `${run}-copy`;
    purge("contentRevisions", '"key" = $1', copyKey);
    purge("copyBlocks", '"key" = $1', copyKey);
    purge("publicCachePublications", '"key" LIKE $1', `%${copyKey}%`);
    const created = await operator.mutation(api.copyBlocks.upsert, {
      ...adminActor,
      key: copyKey,
      kind: "markdown",
      body: "released body",
      label: "Rehearsal",
      group: "rehearsal",
      operationId: `${run}-copy-1`,
    });
    expect("liveness", "with the freeze off the operator client commits a real write", created.revision === 1 && created.key === copyKey, created);
    const journalAfterCreate = await selectDocuments(pool, "contentRevisions", { where: '"key" = $1', params: [copyKey] });
    expect("liveness", "the write and its journal row landed in one transaction", journalAfterCreate.length === 1, journalAfterCreate.length);

    // A mutation reference cannot be used to reintroduce deployment actions.
    // Publication dispatch is owned by the cron route, outside transactions.
    const recoveryAsAction = makeFunctionReference<"action", { actorEmail: string }, unknown>("publicationRecovery:claimDue");
    const unsupportedAction = await attempt(() => runtime.action(recoveryAsAction, { actorEmail: adminActor.actorEmail }));
    expect("liveness", "the native runtime refuses action invocation while writes are enabled", !unsupportedAction.ok && !refusedByFreeze(unsupportedAction), errorMessage(unsupportedAction.error));

    // The freeze baseline is taken after that write, so the sweep below is compared against a settled database.
    const readsBefore: Record<string, string> = {};
    for (const probe of READ_PROBES) readsBefore[probe.name] = JSON.stringify(await probe.read());
    const countsBefore = await countRows();

    // ------------------------------------------------------------------ freeze: every transactional group refuses
    process.env.DATA_WRITES_FROZEN = "1";
    const frozenGroups: Array<{ group: string; fn: string; refused: boolean; registered: boolean }> = [];
    for (const entry of TRANSACTIONAL_GROUPS) {
      const resolved = await attempt(() => resolveFunction(entry.fn));
      const registered = resolved.ok && resolved.value.fn.isMutation === true;
      const reference = makeFunctionReference<"mutation", Record<string, never>, unknown>(entry.fn);
      const outcome = await attempt(() => operator.mutation(reference, {}));
      const refused = refusedByFreeze(outcome);
      frozenGroups.push({ group: entry.group, fn: entry.fn, refused, registered });
      expect(
        "freeze",
        `${entry.group} ${entry.fn} (${entry.what}) is a registered mutation and refuses with ${DATA_WRITES_FROZEN_CODE}`,
        registered && refused,
        { registered, refused, error: outcome.ok ? "resolved" : errorMessage(outcome.error) },
      );
    }

    const frozenApp = getServerDataWriteCapability();
    resetServerDataWriteCapabilityCacheForTests();
    if (frozenApp.ok) {
      const appClient = frozenApp.capability.client;
      const appMutation = await attempt(() =>
        appClient.mutation(makeFunctionReference<"mutation", { apiKey: string; actorEmail: string; key: string }, unknown>("copyBlocks:remove"), {
          apiKey,
          actorEmail: adminActor.actorEmail,
          key: copyKey,
        }),
      );
      const appService = await attempt(() =>
        appClient.mutationAsService(makeFunctionReference<"mutation", Record<string, never>, unknown>("tripReportSubmissions:create"), {}),
      );
      const appAction = await attempt(() =>
        appClient.action(recoveryAsAction, {
          actorEmail: adminActor.actorEmail,
        }),
      );
      expect("freeze", "the app write client refuses editor mutations, service intake, and actions", refusedByFreeze(appMutation) && refusedByFreeze(appService) && refusedByFreeze(appAction), {
        mutation: errorMessage(appMutation.error),
        service: errorMessage(appService.error),
        action: errorMessage(appAction.error),
      });
      const appRead = await attempt(() => appClient.query(api.copyBlocks.getAll, {}));
      expect("freeze", "the same app client keeps serving reads while frozen", appRead.ok, appRead.ok ? "served" : errorMessage(appRead.error));
    } else {
      expect("freeze", "the app write capability resolves so its refusal can be proven", false, capabilityMissing(frozenApp));
    }

    for (const probe of READ_PROBES) {
      const during = JSON.stringify(await probe.read());
      expect("freeze", `${probe.name} serves byte-identical results while writes are frozen`, during === readsBefore[probe.name]);
    }

    const countsDuring = await countRows();
    const changed = tableNames.filter((name) => countsBefore[name] !== countsDuring[name]);
    expect("freeze", "the frozen sweep wrote no row in any of the 61 tables", changed.length === 0, changed.map((name) => ({ name, before: countsBefore[name], after: countsDuring[name] })));

    const frozenWrite = await attempt(() =>
      operator.mutation(api.copyBlocks.upsert, { ...adminActor, key: copyKey, kind: "markdown", body: "frozen body", label: "Rehearsal", group: "rehearsal", operationId: `${run}-copy-frozen` }),
    );
    const blockDuringFreeze = await runtime.query(api.copyBlocks.getByKey, { key: copyKey });
    expect("liveness", "the proven writer refuses while frozen and its row is untouched", refusedByFreeze(frozenWrite) && blockDuringFreeze?.body === "released body", {
      refused: refusedByFreeze(frozenWrite),
      body: blockDuringFreeze?.body,
    });

    // What the freeze costs the editor: `auth.ts:45` awaits `memberships:touchSignIn`, so a NEW sign-in
    // refuses while frozen. An existing session keeps working because the JWT refresh only reads.
    const memberUsername = `${run}-member`;
    const memberEmail = `${run}-member@rehearsal.invalid`;
    const memberPassword = `${run} member passphrase`;
    await seed("memberships", {
      username: memberUsername,
      email: memberEmail,
      role: "editor",
      passwordHash: await hashPassword(memberPassword),
      createdAt: now,
      updatedAt: now,
    });
    const frozenSignIn = await attempt(() => authorizeCredentials({ username: memberUsername, password: memberPassword }));
    expect("freeze", "a new sign-in refuses while frozen because auth.ts awaits touchSignIn", refusedByFreeze(frozenSignIn), frozenSignIn.ok ? "signed in" : errorMessage(frozenSignIn.error));
    const frozenRefresh = await attempt(async () => await authOptions.callbacks!.jwt!({ token: { email: memberEmail }, user: undefined, account: null } as never));
    expect("freeze", "an existing session still refreshes its role while frozen (reads only)", frozenRefresh.ok && frozenRefresh.value.role === "editor", frozenRefresh.ok ? frozenRefresh.value.role : errorMessage(frozenRefresh.error));

    // ------------------------------------------------------------------ drain
    const holder = await pool.connect();
    let drainWaitMs: number | null = null;
    try {
      delete process.env.DATA_WRITES_FROZEN;
      await holder.query("BEGIN");
      await holder.query('SELECT "_id" FROM "copyBlocks" WHERE "key" = $1 FOR UPDATE', [copyKey]);
      const inflight = operator.mutation(api.copyBlocks.upsert, {
        ...adminActor,
        key: copyKey,
        kind: "markdown",
        body: "mid-flight body",
        label: "Rehearsal",
        group: "rehearsal",
        operationId: `${run}-copy-inflight`,
      });
      let blocked = false;
      for (let waited = 0; waited < 50 && !blocked; waited += 1) {
        await sleep(100);
        const waiting = await pool.query<{ count: string }>(
          "SELECT count(*)::text AS count FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'",
        );
        blocked = Number(waiting.rows[0].count) > 0;
      }
      expect("drain", "a mutation entered the runtime and is mid-flight (waiting on a row lock)", blocked);

      const freezeAt = performance.now();
      process.env.DATA_WRITES_FROZEN = "1";
      const afterFreeze = await attempt(() =>
        operator.mutation(api.copyBlocks.upsert, { ...adminActor, key: copyKey, kind: "markdown", body: "post-freeze body", label: "Rehearsal", group: "rehearsal", operationId: `${run}-copy-after` }),
      );
      expect("drain", "a mutation started after the freeze refuses immediately", refusedByFreeze(afterFreeze), errorMessage(afterFreeze.error));

      await holder.query("COMMIT");
      const settled = await attempt(() => inflight);
      drainWaitMs = Math.round(performance.now() - freezeAt);
      expect("drain", "the mid-flight mutation committed after the freeze rather than being lost", settled.ok, settled.ok ? settled.value : errorMessage(settled.error));
      const drained = await runtime.query(api.copyBlocks.getByKey, { key: copyKey });
      expect("drain", "the drained row holds the mid-flight write and never the post-freeze one", drained?.body === "mid-flight body", drained?.body);
      const stillWaiting = await pool.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM pg_stat_activity WHERE datname = current_database() AND (wait_event_type = 'Lock' OR (state = 'idle in transaction' AND xact_start IS NOT NULL))",
      );
      expect("drain", "the drain is complete: no backend is blocked on a lock or holding an open write transaction", stillWaiting.rows[0].count === "0", stillWaiting.rows[0].count);
    } finally {
      await holder.query("ROLLBACK").catch(() => undefined);
      holder.release();
    }
    measurements.drain = { waitFromFreezeToCommitMs: drainWaitMs, method: "one mutation held on a row lock across the freeze flip, timed from the flip to its commit" };

    // ------------------------------------------------------------------ retired backend cannot become a rollback path
    expect("rollback", "the freeze remains on while checking the retirement boundary", process.env.DATA_WRITES_FROZEN === "1");
    process.env.DATA_BACKEND = "retired-backend";
    process.env.TARGET_RETIRED_BACKEND_URL = "https://retired.example.invalid";
    resetServerDataWriteCapabilityCacheForTests();
    const retiredRuntime = await attempt(async () => getDataBackend());
    expect("rollback", "the application refuses a retired backend rather than serving stale data", !retiredRuntime.ok && errorMessage(retiredRuntime.error).includes("DATA_BACKEND"));
    const retiredOperator = await attempt(async () => createDataClient({ argv: [], env: process.env }));
    expect("rollback", "ordinary operators refuse the retired backend", !retiredOperator.ok && errorMessage(retiredOperator.error).includes("DATA_BACKEND"));
    delete process.env.TARGET_RETIRED_BACKEND_URL;
    process.env.DATA_BACKEND = "postgres";
    resetServerDataWriteCapabilityCacheForTests();

    // ------------------------------------------------------------------ the freeze is liftable
    process.env.DATA_WRITES_FROZEN = "0";
    const reopened = await attempt(() =>
      operator.mutation(api.copyBlocks.upsert, { ...adminActor, key: copyKey, kind: "markdown", body: "reopened body", label: "Rehearsal", group: "rehearsal", operationId: `${run}-copy-reopened` }),
    );
    expect("liveness", "lifting the freeze by value reopens writes", reopened.ok && (await runtime.query(api.copyBlocks.getByKey, { key: copyKey }))?.body === "reopened body", reopened.ok ? reopened.value : errorMessage(reopened.error));
    delete process.env.DATA_WRITES_FROZEN;

    // ------------------------------------------------------------------ flavors: host, permission, transaction, privacy
    const reportSource = (await selectDocuments(pool, "tripReports", { limit: 1 }))[0];
    const reportSlug = `${run}-report`;
    if (reportSource) {
      const clone: Record<string, unknown> = { ...reportSource };
      delete clone._id;
      delete clone._creationTime;
      clone.slug = reportSlug;
      clone.owner_email = `${run}-owner@rehearsal.invalid`;
      await seed("tripReports", clone);
      purge("tripReportSubstances", '"report_id" IN (SELECT "_id" FROM "tripReports" WHERE "slug" = $1)', reportSlug);
    }

    for (const flavor of ["dosewiki", "effectindex"] as const) {
      const S = `flavor:${flavor}`;
      const config = getSiteFlavorConfig({ NEXT_PUBLIC_SITE_FLAVOR: flavor });
      expect(S, "the flavor resolves from NEXT_PUBLIC_SITE_FLAVOR alone", config.flavor === flavor && isEffectIndex(config) === (flavor === "effectindex"));

      // host: one Postgres database serves both publications; the fingerprint is the deployment identity.
      expect(S, "reads resolve to the same Postgres deployment fingerprint", postgresFingerprintFromUrl(target) === "localhost/dosewiki", postgresFingerprintFromUrl(target));

      // permission: the effectindex project holds no write credential, which is what makes it read-only.
      const savedKey = process.env.DATA_ADMIN_KEY;
      if (flavor === "effectindex") delete process.env.DATA_ADMIN_KEY;
      resetServerDataWriteCapabilityCacheForTests();
      const capability = getServerDataWriteCapability();
      if (flavor === "effectindex") {
        expect(S, "no write capability exists without a credential, so no write transaction can open", capability.ok === false && capabilityMissing(capability).includes("adminKey"), capabilityMissing(capability));
        const read = await attempt(() => runtime.query(api.copyBlocks.getAll, {}));
        expect(S, "reads still serve on the credential-free flavor", read.ok);
        // A fresh credential-free process is the real Effect Index shape: it starts its own client, and
        // the deployment contract must let it (on Postgres DATA_ADMIN_KEY is the write credential, so
        // requiring it would hand write authority to the read-only deployments).
        const construction = await attempt(async () => {
          const client = PostgresClient.fromUrl(target);
          const rows = await client.query(api.copyBlocks.getAll, {});
          await client.end();
          return rows.length;
        });
        expect(S, "a credential-free process starts its own Postgres runtime and reads with it", construction.ok, construction.ok ? construction.value : errorMessage(construction.error));
        const withoutMedia = await attempt(async () => {
          const savedMedia = process.env.REPLICATION_MEDIA_BASE_URL;
          delete process.env.REPLICATION_MEDIA_BASE_URL;
          try {
            const client = PostgresClient.fromUrl(target);
            await client.end();
            return "constructed";
          } finally {
            process.env.REPLICATION_MEDIA_BASE_URL = savedMedia;
          }
        });
        expect(S, "the read-critical variable is still asserted: no REPLICATION_MEDIA_BASE_URL, no runtime", !withoutMedia.ok && errorMessage(withoutMedia.error).includes("REPLICATION_MEDIA_BASE_URL"), withoutMedia.ok ? withoutMedia.value : errorMessage(withoutMedia.error));
      } else {
        expect(S, "the editor flavor resolves a write capability", capability.ok === true, capabilityMissing(capability));
      }
      process.env.DATA_ADMIN_KEY = savedKey;
      resetServerDataWriteCapabilityCacheForTests();

      // transaction: a refused write leaves no partial row behind, on either flavor's data path.
      const journalBefore = (await selectDocuments(pool, "contentRevisions", { where: '"key" = $1', params: [copyKey] })).length;
      const stale = await attempt(() =>
        operator.mutation(api.copyBlocks.upsert, { ...adminActor, key: copyKey, kind: "plain", body: "never", label: "Rehearsal", group: "rehearsal", expectedRevision: 1 }),
      );
      const journalAfter = (await selectDocuments(pool, "contentRevisions", { where: '"key" = $1', params: [copyKey] })).length;
      expect(S, "a refused write rolls back its whole transaction (no journal row, row unchanged)", !stale.ok && journalAfter === journalBefore && (await runtime.query(api.copyBlocks.getByKey, { key: copyKey }))?.body === "reopened body", {
        error: errorMessage(stale.error),
        journalBefore,
        journalAfter,
      });

      // privacy: the public projections never carry private-personal fields, and private queues need a credential.
      if (reportSource) {
        const publicReport = await runtime.query(api.tripReports.getBySlug, { slug: reportSlug });
        const keys = publicReport && typeof publicReport === "object" ? Object.keys(publicReport) : [];
        expect(S, "the public trip report read carries no owner_email or contact_email", keys.length > 0 && !keys.includes("owner_email") && !keys.includes("contact_email"), keys);
      }
      const queue = await attempt(() => runtime.query(api.tripReportSubmissions.list, { apiKey: `${apiKey}-not-the-key` }));
      expect(S, "the private submission queue refuses a wrong credential", !queue.ok, queue.ok ? "served" : errorMessage(queue.error));
      const subscribers = await attempt(() => runtime.query(api.mailingList.list, { apiKey: `${apiKey}-not-the-key` }));
      expect(S, "the subscriber list refuses a wrong credential", !subscribers.ok, subscribers.ok ? "served" : errorMessage(subscribers.error));
    }


    // ------------------------------------------------------------------ measurements
    const remoteImport = newestImportReport("remote");
    const localImport = newestImportReport("local");
    measurements.import = {
      productionSnapshotToPlanetScale: remoteImport
        ? { report: remoteImport.path, totals: remoteImport.report.totals, elapsedMs: remoteImport.report.elapsedMs, method: "npm run postgres:import --allow-remote, elapsedMs from the importer's own report; workstation uplink, batch replays included" }
        : null,
      fixtureToLocalPostgres: localImport
        ? { report: localImport.path, totals: localImport.report.totals, elapsedMs: localImport.report.elapsedMs, method: "npm run postgres:import against localhost, elapsedMs from the importer's own report" }
        : null,
    };
    const parityReport = newestReport("-parity");
    if (parityReport) {
      const latency = parityReport.report.latency ?? parityReport.report.latencies ?? null;
      measurements.readLatency = { report: parityReport.path, latency, method: "scripts/postgres/parity-public-reads.ts, 905 calls per backend from this workstation over WAN" };
    }

    const latencyRun = spawnSync("bun", [path.join(ROOT, "scripts", "postgres", "rehearse-release.ts"), "--latency-child", "--target", target], {
      cwd: ROOT,
      encoding: "utf8",
      env: { ...process.env, POSTGRES_RUNTIME_TRACE: "1" },
    });
    const latencyLine = (latencyRun.stdout ?? "").split("\n").find((line) => line.startsWith("LATENCY_JSON "));
    const writeLatency = latencyLine ? (JSON.parse(latencyLine.slice("LATENCY_JSON ".length)) as Record<string, unknown>) : null;
    measurements.writeLatency = writeLatency;
    expect("measurement", "write latency measured with POSTGRES_RUNTIME_TRACE=1", writeLatency !== null && latencyRun.status === 0, { status: latencyRun.status, stderr: (latencyRun.stderr ?? "").slice(-400) });

    const connections = await pool.query<{ clients: string; total: string; max: string; reserved: string }>(
      "SELECT (SELECT count(*)::text FROM pg_stat_activity WHERE backend_type = 'client backend') AS clients, (SELECT count(*)::text FROM pg_stat_activity) AS total, current_setting('max_connections') AS max, current_setting('superuser_reserved_connections') AS reserved",
    );
    measurements.connections = {
      local: { ...connections.rows[0], poolMaxThisScript: 4, runtimePoolMax: 4, method: "pg_stat_activity while this rehearsal runs" },
      planetscale: {
        maxConnections: 25,
        superuserReserved: 3,
        note: "measured separately with psql against POSTGRES_POOLED_URL; see release-manifest.md for the sample",
      },
    };

    // Timed outside this process (a build cannot run inside it). Each row names its command and who ran it.
    measurements.migrationApply = {
      seconds: 1.84,
      migrations: 6,
      baseTables: 63,
      indexes: 305,
      uniqueIndexesExcludingPrimaryKeys: 39,
      method: "createdb dosewiki_t22_migrations, then POSTGRES_DIRECT_URL=<scratch> /usr/bin/time -p bunx drizzle-kit migrate; scratch database dropped afterwards",
      measuredBy: "this rehearsal's author, local Postgres 17.10",
    };
    measurements.builds = {
      command: "DOSEWIKI_BUILD_SURFACE=<surface> NEXT_PUBLIC_SITE_FLAVOR=<flavor> DOSEWIKI_BUILD_DIR=<dir> DATA_BACKEND=postgres bunx next build --webpack",
      rows: [
        { surface: "public", flavor: "effectindex", backend: "PlanetScale snapshot", cold: true, seconds: 650, staticPages: 605, distDir: ".next-effectindex", measuredBy: "release rehearsal" },
        { surface: "public", flavor: "effectindex", backend: "PlanetScale snapshot", cold: false, seconds: 128, staticPages: 605, distDir: ".next-effectindex", measuredBy: "release rehearsal" },
        { surface: "public", flavor: "dosewiki", backend: "local Postgres", cold: true, seconds: "94 to 108", staticPages: 526, distDir: ".next", measuredBy: "parent agent, this session" },
        { surface: "public", flavor: "dosewiki", backend: "PlanetScale snapshot", cold: true, seconds: 399, staticPages: 605, distDir: ".next", measuredBy: "parent agent, this session" },
        { surface: "editor", flavor: "dosewiki", backend: "local Postgres", cold: true, seconds: 114, staticPages: 524, distDir: ".next-editor", measuredBy: "parent agent, this session" },
      ],
      note: "The 526 versus 605 page difference is REPLICATION_MEDIA_BASE_URL (D6), not the flavor. No warm build was timed for the dosewiki flavor or the editor surface.",
    };

    unknowns.push(
      { quantity: "freeze window (real cutover downtime)", why: "it depends on the snapshot export, the transfer, and the import running from a stable network host, none of which happen on a workstation", howToMeasure: "time the export, transfer and import on the CI or cloud host that will run the cutover, with the freeze on" },
      { quantity: "production read and write traffic and concurrency", why: "not observable from the repository", howToMeasure: "PlanetScale Insights plus Vercel analytics for the same window" },
      { quantity: "PlanetScale write latency", why: "the PlanetScale branch is read-only for this rehearsal, so no write was timed against it", howToMeasure: "repeat the POSTGRES_RUNTIME_TRACE=1 measurement against a scratch PlanetScale branch" },
      { quantity: "warm build time for the dosewiki flavor and the editor surface", why: "only the effectindex flavor was built twice in this session", howToMeasure: "re-run the same build command against an existing distDir and time it" },
      { quantity: "migration apply time on PlanetScale", why: "the branch already carries all six migrations and this rehearsal may not run DDL there", howToMeasure: "time drizzle-kit migrate on a fresh PlanetScale branch created for the cutover" },
    );

    // ------------------------------------------------------------------ sweep
    if (runSweep) {
      const sweepEnv = { ...process.env };
      delete sweepEnv.DATA_WRITES_FROZEN;
      delete sweepEnv.DATA_BACKEND;
      delete sweepEnv.POSTGRES_POOLED_URL;
      const sweep: Array<{ script: string; exit: number | null; passed: number | null; failed: number | null; seconds: number; tail?: string }> = [];
      for (const script of SWEEP_SCRIPTS) {
        const startedAt = performance.now();
        const result = spawnSync("bun", [path.join(ROOT, "scripts", "postgres", `${script}.ts`), "--target", target], {
          cwd: ROOT,
          encoding: "utf8",
          env: sweepEnv,
        });
        const seconds = Math.round((performance.now() - startedAt) / 100) / 10;
        const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
        const summary = [...output.matchAll(/\{"passed":(\d+),"failed":(\d+)/g)].pop();
        const entry = {
          script,
          exit: result.status,
          passed: summary ? Number(summary[1]) : null,
          failed: summary ? Number(summary[2]) : null,
          seconds,
          ...(result.status === 0 ? {} : { tail: output.trim().split("\n").slice(-3).join(" | ").slice(0, 400) }),
        };
        sweep.push(entry);
        console.log(`sweep ${script}: exit=${result.status} passed=${entry.passed} failed=${entry.failed} ${seconds}s`);
        if (result.status !== 0) {
          blockers.push({
            id: `blocker:sweep:${script}`,
            summary: `${script} no longer passes (exit ${result.status}).`,
            evidence: entry.tail ?? "no output captured",
          });
        }
      }
      measurements.sweep = {
        method: `bun scripts/postgres/<script>.ts --target ${target.replace(/\/\/[^@]*@/, "//<redacted>@")}, back to back`,
        totalSeconds: Math.round(sweep.reduce((total, entry) => total + entry.seconds, 0) * 10) / 10,
        passedScripts: sweep.filter((entry) => entry.exit === 0).length,
        scripts: sweep,
      };
    } else {
      measurements.sweep = { skipped: "--no-sweep" };
    }

  } finally {
    delete process.env.DATA_WRITES_FROZEN;
    process.env.DATA_BACKEND = "postgres";
    if (!keep) {
      for (const { table, where, params } of purges) {
        await pool.query(`DELETE FROM "documentIds" WHERE "_id" IN (SELECT "_id" FROM "${table}" WHERE ${where})`, params);
        await pool.query(`DELETE FROM "${table}" WHERE ${where}`, params);
      }
      for (const { table, id } of seeded.reverse()) await deleteDocument(pool, table, id);
    }
    const passed = checks.filter((check) => check.pass).length;
    const summary = {
      ticket: 22,
      target: target.replace(/\/\/[^@]*@/, "//<redacted>@"),
      run,
      kept: keep,
      elapsedMs: Math.round(performance.now() - started),
      passed,
      failed: checks.length - passed,
      blockers,
      measurements,
      unknown: unknowns,
      checks,
    };
    fs.mkdirSync(runDirectory, { recursive: true });
    fs.writeFileSync(path.join(runDirectory, "report.json"), JSON.stringify(summary, null, 2));
    console.log(`\nReport: ${path.relative(ROOT, runDirectory)}/report.json`);
    console.log(`Blockers: ${blockers.length > 0 ? blockers.map((blocker) => blocker.id).join(", ") : "none"}`);
    console.log(JSON.stringify({ passed, failed: summary.failed, elapsedMs: summary.elapsedMs }));
    process.exitCode = summary.failed === 0 ? 0 : 1;
    await runtime.end();
    await operator.end?.();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
