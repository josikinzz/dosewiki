/**
 * Rehearsal: drive the Next route handlers and the publication cron
 * against Postgres.
 *
 *   bun scripts/postgres/rehearse-http-surface.ts --target <isolated-local-url>
 *
 * Imports `src/app/api/subscribe/route.ts` and
 * `src/app/api/cron/publication-delivery/route.ts` with DATA_BACKEND=postgres
 * and POSTGRES_POOLED_URL pointing at the target, invokes them as Next would,
 * and asserts on the rows they leave behind. Scratch rows carry the prefix
 * `t16-<random>` and are deleted in `finally`. The delivery cron claims every
 * due outbox row by design; rows it touched that this run did not create are
 * restored from a snapshot taken just before the call. No outbound delivery
 * happens: PUBLIC_CACHE_PUBLISH_TARGETS and _SECRET are cleared in this
 * process, so every receipt is "unconfigured". The report lands in
 * runs/postgres-import/<timestamp>-http-surface/report.json.
 *
 * Scenarios:
 *   1. subscribe: the four list identities land as four rows, each with the
 *      HMAC ip hash and never the raw IP.
 *   2. generic: duplicate and spam-shaped inputs answer the same 200 as a
 *      fresh subscribe; invalid input answers 400.
 *   3. origin: missing or unlisted origins are refused with 403; preflight
 *      from an allowed origin answers 204.
 *   4. cron: refuses missing authorization and retired backend configuration;
 *      Postgres claims the scratch outbox row and records its receipt.
 *   5. limiter: the per-IP bucket refuses after its burst, the global window
 *      refuses once spent and again inside the window, and the same limiter
 *      admits again once the window rolls over.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import type { DataDocument } from "../../lib/postgres/documentCodec";
import { deleteDocument, insertDocument, mintDocumentId, patchDocument, selectDocuments, withTransaction } from "../../lib/postgres/documentStore";
import { GET as publicationDeliveryGet } from "../../src/app/api/cron/publication-delivery/route";
import { OPTIONS as subscribeOptions, POST as subscribePost } from "../../src/app/api/subscribe/route";
import { SUBSCRIBE_RATE_LIMITS, createSubscribeRateLimiter, hashClientIp } from "../../src/app/api/subscribe/subscribePolicy";
import { guardTarget, resolveTarget } from "./targetGuard";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ORIGIN = "https://dose.wiki";
const USER_AGENT = "dosewiki-rehearsal/http-surface";
const LISTS = ["josiekins", "dosewiki", "effectindex", "mindstate"] as const;

type Check = { scenario: string; check: string; pass: boolean; detail?: unknown };

const checks: Check[] = [];
function expect(scenario: string, check: string, pass: boolean, detail?: unknown): void {
  checks.push({ scenario, check, pass, ...(detail === undefined ? {} : { detail }) });
  console.log(`${pass ? "ok  " : "FAIL"} ${scenario}: ${check}${detail === undefined || pass ? "" : ` ${JSON.stringify(detail)}`}`);
}

type SubscribeCall = {
  body?: unknown;
  rawBody?: string;
  origin?: string | null;
  ip?: string;
};

async function subscribe(call: SubscribeCall): Promise<{ status: number; text: string; headers: Headers }> {
  const headers = new Headers({ "content-type": "application/json", "user-agent": USER_AGENT });
  if (call.origin !== null) headers.set("origin", call.origin ?? ORIGIN);
  if (call.ip) headers.set("x-vercel-forwarded-for", call.ip);
  const response = await subscribePost(new Request("https://dose.wiki/api/subscribe", {
    method: "POST",
    headers,
    body: call.rawBody ?? JSON.stringify(call.body),
  }));
  return { status: response.status, text: await response.text(), headers: response.headers };
}

async function cron(authorization: string | null): Promise<Response> {
  return publicationDeliveryGet(new Request("https://dev.dose.wiki/api/cron/publication-delivery", {
    headers: authorization ? { authorization } : {},
  }));
}

function subscriberRows(pool: Pool, prefix: string): Promise<DataDocument[]> {
  return selectDocuments(pool, "mailingListSubscribers", { where: '"email" LIKE $1', params: [`${prefix}%`], orderBy: '"_creationTime"' });
}

/** The rows `publicationRecovery:claimDue` will take: the `by_due` index order, first 24. */
function dueRows(pool: Pool, now: number): Promise<DataDocument[]> {
  return selectDocuments(pool, "publicCachePublications", {
    where: '"pending" = true AND "nextAttemptAt" <= $1',
    params: [now],
    orderBy: '"nextAttemptAt", "_creationTime"',
    limit: 24,
  });
}

async function main() {
  const argv = process.argv.slice(2);
  const target = resolveTarget(argv);
  // Shared budgets cannot be reset or borrowed on a live target.
  guardTarget(target, false);

  process.env.DATA_BACKEND = "postgres";
  process.env.POSTGRES_POOLED_URL = target;
  process.env.REPLICATION_MEDIA_BASE_URL = "https://media.rehearsal.invalid";
  process.env.VERCEL = "1"; // The local Request fixture models Vercel's trusted ingress.
  delete process.env.MAILING_LIST_FORWARD_URL;
  process.env.MAILING_LIST_IP_HASH_SECRET ||= `t16-ip-secret-${mintDocumentId()}`;
  // Isolated credentials exercise the same intent checks as a configured deployment.
  process.env.DATA_ADMIN_TOKEN_PUBLIC_INTAKE_CREATE = "t16-intake-token";
  process.env.DATA_ADMIN_KEY = "t16-admin-key";
  const cronSecret = `t16-cron-${mintDocumentId()}`;
  process.env.CRON_SECRET = cronSecret;
  delete process.env.PUBLIC_CACHE_PUBLISH_TARGETS;
  delete process.env.PUBLIC_CACHE_PUBLISH_SECRET;
  const ipSecret = process.env.MAILING_LIST_IP_HASH_SECRET;

  const pool = new Pool({ connectionString: target, max: 4 });
  const prefix = `t16-${mintDocumentId().slice(0, 8)}`;
  const runDirectory = path.join(ROOT, "runs", "postgres-import", `${new Date().toISOString().replace(/[:.]/g, "-")}-http-surface`);
  const started = performance.now();
  let outboxId: string | null = null;
  let nextIp = 1;
  const freshIp = () => `10.16.${Math.floor(nextIp / 250)}.${(nextIp++ % 250) + 1}`;
  const limiterNames = [`${prefix}-per-ip`, `${prefix}-global`];
  const existingBuckets = await pool.query('SELECT 1 FROM "subscribeRateLimitBuckets" LIMIT 1');
  if (existingBuckets.rowCount) {
    await pool.end();
    throw new Error("HTTP rehearsal requires an isolated database with no signup limiter state");
  }
  // Pin the real database window away from rollover during the route scenarios.
  await pool.query(
    `INSERT INTO "subscribeRateLimitBuckets" ("name", "key", "value", "ts", "expires_at")
     SELECT 'subscribeGlobal', '', $1, floor(extract(epoch FROM clock_timestamp()) * 1000),
       floor(extract(epoch FROM clock_timestamp()) * 1000) + $2`,
    [SUBSCRIBE_RATE_LIMITS.subscribeGlobal.rate, SUBSCRIBE_RATE_LIMITS.subscribeGlobal.period],
  );
  // Requests that reach the limiter (parse and origin passed) spend the global window.
  let globalSpent = 0;
  const limited = async (call: SubscribeCall) => {
    globalSpent += 1;
    return subscribe(call);
  };

  try {
    // 1. subscribe: four list identities, four rows.
    const listIps: Record<string, string> = {};
    for (const list of LISTS) {
      const ip = freshIp();
      listIps[list] = ip;
      const response = await limited({ body: { email: `${prefix}-${list}@rehearsal.invalid`, list, website: "" }, ip });
      expect("subscribe", `${list} answers the generic 200`, response.status === 200 && response.text === '{"ok":true}', response);
      expect("subscribe", `${list} response carries CORS headers`, response.headers.get("access-control-allow-origin") === ORIGIN && response.headers.get("vary") === "Origin");
    }
    const rows = await subscriberRows(pool, prefix);
    expect("subscribe", "four rows with four distinct list ids", rows.length === 4 && new Set(rows.map((row) => row.list)).size === 4, rows.map((row) => row.list));
    expect("subscribe", "every row is status subscribed with the user agent", rows.every((row) => row.status === "subscribed" && row.user_agent === USER_AGENT && row.honeypot_triggered === false));
    expect("subscribe", "ip_hash is the keyed sha256 of the client IP", rows.every((row) => row.ip_hash === hashClientIp(listIps[row.list as string], ipSecret) && String(row.ip_hash).startsWith("sha256:")));
    expect("subscribe", "no stored column contains the raw IP", rows.every((row) => !JSON.stringify(row).includes(listIps[row.list as string])));

    // 2. generic: duplicate and spam-shaped inputs are indistinguishable from a fresh subscribe.
    const duplicate = await limited({ body: { email: `${prefix}-dosewiki@rehearsal.invalid`, list: "dosewiki", website: "" }, ip: freshIp() });
    expect("generic", "duplicate answers the same 200", duplicate.status === 200 && duplicate.text === '{"ok":true}', duplicate);
    expect("generic", "duplicate stores nothing", (await subscriberRows(pool, prefix)).length === 4);
    const spam = await limited({ body: { email: `${prefix}-spam@rehearsal.invalid`, list: "dosewiki", website: "http://spam.invalid" }, ip: freshIp() });
    expect("generic", "honeypot answers the same 200", spam.status === 200 && spam.text === '{"ok":true}', spam);
    const spamRow = (await subscriberRows(pool, prefix)).find((row) => row.email === `${prefix}-spam@rehearsal.invalid`);
    expect("generic", "honeypot row is stored as spam", spamRow?.status === "spam" && spamRow.honeypot_triggered === true, spamRow);
    const spamInvalid = await limited({ body: { email: "not-an-email", list: "mindstate", website: "bot" }, ip: freshIp() });
    expect("generic", "honeypot with garbage address still answers 200", spamInvalid.status === 200 && spamInvalid.text === '{"ok":true}', spamInvalid);
    const invalid = await limited({ body: { email: `${prefix}-not-an-email`, list: "mindstate", website: "" }, ip: freshIp() });
    expect("generic", "invalid address answers 400", invalid.status === 400 && invalid.text === '{"ok":false}', invalid);
    const unknownList = await subscribe({ body: { email: `${prefix}-x@rehearsal.invalid`, list: "other", website: "" }, ip: freshIp() });
    expect("generic", "unknown list answers 400", unknownList.status === 400 && unknownList.text === '{"ok":false}', unknownList);
    const malformed = await subscribe({ rawBody: "{not json", ip: freshIp() });
    expect("generic", "malformed JSON answers 400", malformed.status === 400 && malformed.text === '{"ok":false}', malformed);
    expect("generic", "invalid inputs stored nothing", (await subscriberRows(pool, prefix)).length === 5);

    // 3. origin: only explicitly allowed browser origins can submit.
    const noOrigin = await subscribe({ body: { email: `${prefix}-o@rehearsal.invalid`, list: "dosewiki", website: "" }, origin: null, ip: freshIp() });
    expect("origin", "missing Origin is refused with 403", noOrigin.status === 403 && noOrigin.text === "", noOrigin);
    const badOrigin = await subscribe({ body: { email: `${prefix}-o@rehearsal.invalid`, list: "dosewiki", website: "" }, origin: "https://evil.invalid", ip: freshIp() });
    expect("origin", "unlisted Origin is refused with 403", badOrigin.status === 403 && badOrigin.text === "", badOrigin);
    expect("origin", "refused origins stored nothing", (await subscriberRows(pool, prefix)).length === 5);
    const preflight = await subscribeOptions(new Request("https://dose.wiki/api/subscribe", { method: "OPTIONS", headers: { origin: "https://effectindex.com" } }));
    expect("origin", "preflight from an allowed origin answers 204 with CORS headers",
      preflight.status === 204 && preflight.headers.get("access-control-allow-origin") === "https://effectindex.com"
        && preflight.headers.get("access-control-allow-methods") === "POST" && preflight.headers.get("access-control-allow-headers") === "Content-Type",
      Object.fromEntries(preflight.headers));
    const badPreflight = await subscribeOptions(new Request("https://dose.wiki/api/subscribe", { method: "OPTIONS", headers: { origin: "https://evil.invalid" } }));
    expect("origin", "preflight from an unlisted origin is refused with 403", badPreflight.status === 403);

    // 4. cron: authorization and fail-closed backend selection.
    const unauthorized = await cron(null);
    expect("cron", "no bearer token answers 401", unauthorized.status === 401, await unauthorized.text());
    const wrongToken = await cron("Bearer nope");
    expect("cron", "wrong bearer token answers 401", wrongToken.status === 401);
    delete process.env.CRON_SECRET;
    const unconfigured = await cron(`Bearer ${cronSecret}`);
    expect("cron", "unset CRON_SECRET answers 503", unconfigured.status === 503);
    process.env.CRON_SECRET = cronSecret;
    process.env.DATA_BACKEND = "retired-backend";
    let retiredBackendRefused = false;
    try {
      await cron(`Bearer ${cronSecret}`);
    } catch (error) {
      retiredBackendRefused = error instanceof Error && error.message.includes("DATA_BACKEND");
    }
    expect("cron", "retired backend configuration is refused", retiredBackendRefused);
    process.env.DATA_BACKEND = "postgres";

    const now = Date.now();
    outboxId = await insertDocument(pool, "publicCachePublications", {
      key: `${prefix}-outbox`,
      target: { kind: "article", slug: `${prefix}-article` },
      revision: null,
      generation: 1,
      pending: true,
      committedAt: now,
      // Sorts ahead of every fixture row except the synthetic -Infinity ones.
      nextAttemptAt: -1e15,
      attempts: 0,
      receipts: [],
    });
    const snapshot = (await dueRows(pool, now)).filter((row) => row._id !== outboxId);
    expect("cron", "scratch outbox row is within the claimable set", (await dueRows(pool, now)).some((row) => row._id === outboxId));
    const live = await cron(`Bearer ${cronSecret}`);
    const run = (await live.json()) as { claimed: number; completed: number; retried: number; skipped: number };
    expect("cron", "Postgres backend runs the delivery mutation", live.status === 200 && run.claimed >= 1 && run.claimed === run.completed + run.retried + run.skipped, run);
    const [after] = await selectDocuments(pool, "publicCachePublications", { where: '"_id" = $1', params: [outboxId] });
    const receipts = after?.receipts as Array<{ status?: string }> | undefined;
    expect("cron", "scratch row attempts incremented by claimDue", after?.attempts === 1, after);
    expect("cron", "scratch row stays pending with an unconfigured receipt and a backoff", after?.pending === true && typeof after.nextAttemptAt === "number" && after.nextAttemptAt > now && receipts?.length === 1 && receipts[0]?.status === "unconfigured", after);

    // Fixture rows the cron leased are put back exactly as they were.
    let restored = 0;
    for (const before of snapshot) {
      const [current] = await selectDocuments(pool, "publicCachePublications", { where: '"_id" = $1', params: [before._id] });
      if (!current || current.attempts === before.attempts) continue;
      await patchDocument(pool, "publicCachePublications", before._id as string, {
        pending: before.pending, nextAttemptAt: before.nextAttemptAt, attempts: before.attempts, receipts: before.receipts,
      });
      restored += 1;
    }
    expect("cron", "leased fixture rows restored", restored <= snapshot.length, { restored, snapshotted: snapshot.length });

    // 5. limiter: per-IP token bucket, then the global fixed window. Last, because it spends the window.
    const burstIp = freshIp();
    const burst: number[] = [];
    for (let index = 0; index < 4; index += 1) {
      burst.push((await limited({ body: { email: `${prefix}-burst-${index}@rehearsal.invalid`, list: "josiekins", website: "" }, ip: burstIp })).status);
    }
    expect("limiter", "per-IP bucket admits its burst of 3 and refuses the 4th with 429", burst.join(",") === "200,200,200,429", burst);
    globalSpent -= 1; // the refused request consumed nothing
    expect("limiter", "refused request stored nothing", (await subscriberRows(pool, prefix)).length === 8);

    const remaining = SUBSCRIBE_RATE_LIMITS.subscribeGlobal.rate - globalSpent;
    let admitted = 0;
    let firstRefusal: number | null = null;
    for (let index = 0; index < remaining + 1; index += 1) {
      // A well-formed but invalid address reaches the limiter and stores nothing.
      const response = await subscribe({ body: { email: `${prefix}-window-${index}`, list: "mindstate", website: "" }, ip: index % 3 === 0 ? freshIp() : `10.16.${Math.floor((nextIp - 1) / 250)}.${((nextIp - 1) % 250) + 1}` });
      if (response.status === 429) {
        firstRefusal = index;
        break;
      }
      admitted += 1;
    }
    expect("limiter", "global window admits exactly its remaining budget then refuses", firstRefusal === remaining && admitted === remaining, { remaining, admitted, firstRefusal });
    const again = await subscribe({ body: { email: `${prefix}-window-again@rehearsal.invalid`, list: "dosewiki", website: "" }, ip: freshIp() });
    expect("limiter", "a fresh IP inside the spent window is still refused with 429", again.status === 429 && again.text === '{"ok":false}', again);
    expect("limiter", "window refusals stored nothing", (await subscriberRows(pool, prefix)).length === 8);

    // Independent application connections share a burst, then reconnect without
    // resetting it. Use isolated names so the already-spent route budget stays intact.
    const limits = {
      [limiterNames[0]]: SUBSCRIBE_RATE_LIMITS.subscribePerIp,
      [limiterNames[1]]: { ...SUBSCRIBE_RATE_LIMITS.subscribeGlobal, start: Date.now() - 1000 },
    };
    let secondPool = new Pool({ connectionString: target, max: 4 });
    const first = createSubscribeRateLimiter(limits, {
      sqlTransaction: (operation) => withTransaction(pool, operation),
    }, ipSecret);
    let second = createSubscribeRateLimiter(limits, {
      sqlTransaction: (operation) => withTransaction(secondPool, operation),
    }, ipSecret);
    try {
      const burst = await Promise.all(Array.from({ length: 20 }, (_, i) =>
        (i % 2 ? first : second).limit(limiterNames[0], "192.0.2.5"),
      ));
      expect("limiter", "two instances atomically share the three-token IP burst", burst.filter((decision) => decision.ok).length === 3);
      await secondPool.end();
      secondPool = new Pool({ connectionString: target, max: 4 });
      second = createSubscribeRateLimiter(limits, {
        sqlTransaction: (operation) => withTransaction(secondPool, operation),
      }, ipSecret);
      expect("limiter", "reconnecting an instance does not reset its spent IP bucket", !(await second.limit(limiterNames[0], "192.0.2.5")).ok);
      const global = await Promise.all(Array.from({ length: 220 }, (_, i) =>
        (i % 2 ? first : second).limit(limiterNames[1]),
      ));
      expect("limiter", "two instances atomically share the 200-token global window", global.filter((decision) => decision.ok).length === 200);
      await pool.query(
        'UPDATE "subscribeRateLimitBuckets" SET "ts" = "ts" - $2 WHERE "name" = $1',
        [limiterNames[0], SUBSCRIBE_RATE_LIMITS.subscribePerIp.period / SUBSCRIBE_RATE_LIMITS.subscribePerIp.rate],
      );
      expect("limiter", "database elapsed time refills the IP bucket", (await second.limit(limiterNames[0], "192.0.2.5")).ok);
      await pool.query(
        'UPDATE "subscribeRateLimitBuckets" SET "ts" = "ts" - $2 WHERE "name" = $1',
        [limiterNames[1], SUBSCRIBE_RATE_LIMITS.subscribeGlobal.period],
      );
      expect("limiter", "database elapsed time rolls over the global window", (await second.limit(limiterNames[1])).ok);
    } finally {
      await secondPool.end();
    }
  } finally {
    await pool.query('DELETE FROM "subscribeRateLimitBuckets" WHERE "name" = ANY($1::text[])', [
      ["subscribePerIp", "subscribeGlobal", ...limiterNames],
    ]);
    for (const row of await subscriberRows(pool, prefix)) {
      await deleteDocument(pool, "mailingListSubscribers", row._id as string);
    }
    if (outboxId) await deleteDocument(pool, "publicCachePublications", outboxId);
    const passed = checks.filter((c) => c.pass).length;
    const summary = {
      target: target.replace(/\/\/[^@]*@/, "//<redacted>@"),
      prefix,
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
