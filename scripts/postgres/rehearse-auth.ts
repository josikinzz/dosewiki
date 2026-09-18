/**
 * Rehearsal: sign-in and account controls on Postgres.
 *
 * Runs the real `auth.ts` credentials provider and JWT callback, the real
 * `lib/auth/memberships.ts` adapter, and the real route write client
 * with `DATA_BACKEND=postgres`, so every membership, invite, and reset-token
 * handler executes unchanged on `PostgresClient`. Proves:
 *
 *   a. a scratch admin created with the app's scrypt hash signs in through
 *      `authorizeCredentials` without a reset, and touches `lastSeenAt`;
 *   b. a banned member and a member whose role refresh fails (unreachable
 *      database, missing server key) never resolve above `viewer`;
 *   c. two concurrent redemptions of one invite code and of one reset token
 *      succeed exactly once, with a single consumption stored;
 *   d. role floors, roster ownership refusals, the actor requirement of the
 *      server write client, and the same-origin gate hold.
 *
 * Every row it creates carries the `t05-<run>` prefix and is deleted in
 * `finally` unless `--keep` is passed.
 *
 *   bun scripts/postgres/rehearse-auth.ts --target postgres://localhost:5432/dosewiki
 */

import fs from "node:fs";
import path from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { NextResponse } from "next/server";
import { Pool } from "pg";
import { guardTarget, resolveTarget } from "./targetGuard";

const argv = process.argv.slice(2);
const target = resolveTarget(argv);
guardTarget(target, argv.includes("--allow-remote"));
// The backend switch and pool URL are read lazily by `lib/postgres/runtime/backend.ts`,
// so setting them before the first call is what puts the adapters on Postgres.
process.env.DATA_BACKEND = "postgres";
process.env.POSTGRES_POOLED_URL = target;

import { api } from "../../lib/postgres/runtime/api";
import { authOptions, authorizeCredentials } from "../../lib/auth/authOptions";
import {
  consumePasswordReset,
  getCredentialsByUsername,
  getMembershipByEmail,
  redeemInviteCode,
} from "../../lib/auth/memberships";
import { generateInviteCode, hashInviteCode, normalizeInviteCode } from "../../lib/auth/inviteCodes";
import { hashPassword, verifyPassword } from "../../lib/auth/passwords";
import {
  getServerDataWriteCapabilityOrThrow,
  resetServerDataWriteCapabilityCacheForTests,
  ServerDataWriteClient,
} from "../../lib/data/serverWriteCapability";
import { getPostgresClient } from "../../lib/postgres/runtime/backend";
import { insertDocument, mintDocumentId, selectDocuments } from "../../lib/postgres/documentStore";
import { classifyDataRejection } from "../../src/lib/http/dataRejection";
import { protectedRouteOperation } from "../../src/lib/http/protectedRouteOperation";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

type Check = { scenario: string; check: string; pass: boolean; detail?: unknown };

const checks: Check[] = [];
function expect(scenario: string, check: string, pass: boolean, detail?: unknown): void {
  checks.push({ scenario, check, pass, ...(detail === undefined ? {} : { detail }) });
  console.log(`${pass ? "ok  " : "FAIL"} ${scenario}: ${check}${detail === undefined || pass ? "" : ` ${JSON.stringify(detail)}`}`);
}

// Both members carry both keys so the non-strict scripts tsconfig (no strictNullChecks) still type-checks `outcome.error`.
type Outcome<T> = { ok: true; value: T; error?: undefined } | { ok: false; value?: undefined; error: unknown };

async function attempt<T>(run: () => Promise<T>): Promise<Outcome<T>> {
  try {
    return { ok: true, value: await run() };
  } catch (error) {
    return { ok: false, error };
  }
}

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));
const rejectionCode = (outcome: Outcome<unknown>) => (outcome.ok ? null : classifyDataRejection(outcome.error)?.code ?? null);
const outcomeDetail = (outcome: Outcome<unknown>) => (outcome.ok ? outcome.value : errorMessage(outcome.error));
const sha256 = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");

/** The JWT refresh as Auth.js runs it on every request for an existing session. */
async function refreshedRole(email: string): Promise<unknown> {
  // Only `token.email` is read by the callback; the rest of Auth.js's parameter shape is irrelevant here.
  const refresh = { token: { email }, user: undefined, account: null } as never;
  const token = await authOptions.callbacks!.jwt!(refresh);
  return token.role;
}

/** Runs `fn` with `console.error` muted; the fail-closed path logs on purpose. */
async function quietly<T>(fn: () => Promise<T>): Promise<T> {
  const original = console.error;
  console.error = () => undefined;
  try {
    return await fn();
  } finally {
    console.error = original;
  }
}

async function main() {
  const keep = argv.includes("--keep");
  const run = `t05-${mintDocumentId().slice(0, 8)}`;
  const pool = new Pool({ connectionString: target, max: 2 });
  const runDirectory = path.join(ROOT, "runs", "postgres-import", `${new Date().toISOString().replace(/[:.]/g, "-")}-auth`);
  const started = performance.now();
  // A stray rejection from the runtime is a defect, not a crash: record it and let `finally` clean up.
  process.on("unhandledRejection", (reason) => expect("runtime", "no unhandled rejection escaped a handler", false, errorMessage(reason)));

  const admin = { username: `${run}-admin`, email: `${run}-admin@rehearsal.invalid`, password: `${run} admin passphrase` };
  const editorUsernames = [`${run}-editor-a`, `${run}-editor-b`];
  const viewerEmail = `${run}-viewer@rehearsal.invalid`;
  const inviteCode = normalizeInviteCode(generateInviteCode());
  const inviteHash = hashInviteCode(inviteCode);

  const membershipsFor = (where: string, params: unknown[]) => selectDocuments(pool, "memberships", { where, params });

  try {
    // Routes reach the backend through the write capability; on Postgres it wraps the runtime client.
    const capability = getServerDataWriteCapabilityOrThrow();
    const write = capability.client;
    const adminKey = capability.adminKey;
    const editorToken = capability.getAdminIntentToken("editorArticleWrite") ?? adminKey;

    // (a) seed path: the same mutation `scripts/auth/seed-admin-accounts.mjs` calls, with the app's hash.
    const adminHash = await hashPassword(admin.password);
    const seeded = await getPostgresClient().mutation(api.memberships.setAdminAccount, {
      apiKey: adminKey,
      username: admin.username,
      email: admin.email,
      name: "Rehearsal admin",
      passwordHash: adminHash,
    });
    expect("sign-in", "scratch admin created through memberships:setAdminAccount", seeded.created === true, seeded);

    const credentials = await getCredentialsByUsername(admin.username.toUpperCase());
    expect("sign-in", "getCredentialsByUsername returns the stored scrypt hash (case-insensitive username)", credentials?.passwordHash === adminHash && credentials.role === "admin");
    expect("sign-in", "app verifyPassword accepts the stored hash", credentials !== null && (await verifyPassword(admin.password, credentials.passwordHash!)));

    const before = await membershipsFor('"email" = $1', [admin.email]);
    const authorized = await authorizeCredentials({ username: admin.username, password: admin.password });
    expect("sign-in", "authorizeCredentials returns the member without a reset", authorized?.email === admin.email && authorized.id === admin.email, authorized);
    const after = await membershipsFor('"email" = $1', [admin.email]);
    expect("sign-in", "touchSignIn stamped lastSeenAt", before[0]?.lastSeenAt === undefined && typeof after[0]?.lastSeenAt === "string", after[0]?.lastSeenAt);
    expect("sign-in", "wrong password is refused", (await authorizeCredentials({ username: admin.username, password: `${admin.password}!` })) === null);
    expect("sign-in", "unknown username is refused", (await authorizeCredentials({ username: `${run}-nobody`, password: admin.password })) === null);
    expect("sign-in", "JWT refresh resolves the admin role", (await refreshedRole(admin.email)) === "admin");

    // (c) invite race: one single-use code, two concurrent redemptions.
    const minted = await write.mutation(api.inviteCodes.mint, { apiKey: adminKey, actorEmail: admin.email, role: "editor", codeHash: inviteHash, maxUses: 1 });
    expect("invite", "single-use invite minted as the scratch admin", minted.status === "active" && minted.maxUses === 1 && minted.createdBy === admin.email, minted);
    const editorHash = await hashPassword(`${run} editor passphrase`);
    const redemptions = await Promise.all(
      editorUsernames.map((username) => attempt(() => redeemInviteCode({ codeHash: inviteHash, username, passwordHash: editorHash }))),
    );
    const redeemed = redemptions.find((outcome) => outcome.ok);
    const refused = redemptions.filter((outcome) => !outcome.ok);
    expect("invite", "exactly one redemption succeeded", redemptions.filter((outcome) => outcome.ok).length === 1 && refused.length === 1, redemptions.map(outcomeDetail));
    expect("invite", "the loser was refused with INVITE_EXHAUSTED", refused.length === 1 && rejectionCode(refused[0]) === "INVITE_EXHAUSTED", refused.map(rejectionCode));
    const [inviteRow] = await selectDocuments(pool, "inviteCodes", { where: '"codeHash" = $1', params: [inviteHash] });
    const editorRows = await membershipsFor('"username" = ANY($1)', [editorUsernames]);
    const editor = redeemed?.ok ? redeemed.value : null;
    const storedRedemptions = Array.isArray(inviteRow?.redemptions) ? inviteRow.redemptions : [];
    const firstRedemption = storedRedemptions[0];
    const firstRedemptionEmail = firstRedemption && typeof firstRedemption === "object" && "email" in firstRedemption ? firstRedemption.email : undefined;
    expect("invite", "stored code records one redemption", storedRedemptions.length === 1 && firstRedemptionEmail === editor?.email, inviteRow?.redemptions);
    expect("invite", "exactly one membership was created, as editor", editorRows.length === 1 && editorRows[0].role === "editor" && editorRows[0].email === editor?.email && editorRows[0].inviteCodeId === inviteRow?._id, editorRows.map((row) => row.username));
    expect("invite", "a further redemption is refused", rejectionCode(await attempt(() => redeemInviteCode({ codeHash: inviteHash, username: `${run}-editor-c`, passwordHash: editorHash }))) === "INVITE_EXHAUSTED");
    if (!editor) throw new Error("invite redemption produced no editor; later scenarios need one");
    const editorUsername = editorRows[0].username as string;
    expect("invite", "the new editor signs in with the invite password", (await authorizeCredentials({ username: editorUsername, password: `${run} editor passphrase` }))?.email === editor.email);
    expect("invite", "JWT refresh resolves the editor role", (await refreshedRole(editor.email)) === "editor");

    // (c) reset race: one token, two concurrent consumptions with different passwords.
    const token = randomBytes(32).toString("hex");
    await write.mutation(api.memberships.issuePasswordReset, { apiKey: adminKey, actorEmail: admin.email, email: editor.email, tokenHash: sha256(token) });
    const resetPasswords = [`${run} reset one`, `${run} reset two`];
    const resetHashes = await Promise.all(resetPasswords.map((password) => hashPassword(password)));
    const consumptions = await Promise.all(resetHashes.map((passwordHash) => attempt(() => consumePasswordReset(sha256(token), passwordHash))));
    const consumed = consumptions.map((outcome, index) => (outcome.ok ? index : -1)).filter((index) => index >= 0);
    expect("reset", "exactly one consumption succeeded", consumed.length === 1, consumptions.map((o) => (o.ok ? "ok" : errorMessage(o.error))));
    expect("reset", "the loser was refused with RESET_TOKEN_INVALID", consumptions.filter((o) => !o.ok).map(rejectionCode).join() === "RESET_TOKEN_INVALID");
    const [afterReset] = await membershipsFor('"email" = $1', [editor.email]);
    expect("reset", "stored row holds the winner's hash with the token cleared", consumed.length === 1 && afterReset?.passwordHash === resetHashes[consumed[0]] && afterReset.resetTokenHash === undefined && afterReset.resetTokenExpiresAt === undefined, { resetTokenHash: afterReset?.resetTokenHash });
    expect("reset", "the winner's password signs in and the loser's does not", consumed.length === 1
      && (await authorizeCredentials({ username: editorUsername, password: resetPasswords[consumed[0]] }))?.email === editor.email
      && (await authorizeCredentials({ username: editorUsername, password: resetPasswords[1 - consumed[0]] })) === null);
    expect("reset", "replaying the token is refused", rejectionCode(await attempt(() => consumePasswordReset(sha256(token), resetHashes[0]))) === "RESET_TOKEN_INVALID");
    expect("reset", "an unknown token is refused", rejectionCode(await attempt(() => consumePasswordReset(sha256(`${token}x`), resetHashes[0]))) === "RESET_TOKEN_INVALID");

    // (d) role floor: changelog:addEntry requires editor; called as viewer, editor, admin.
    const now = new Date().toISOString();
    await insertDocument(pool, "memberships", { email: viewerEmail, role: "viewer", createdAt: now, updatedAt: now });
    const entry = (actorEmail: string, suffix: string) => write.mutation(api.changelog.addEntry, {
      apiKey: editorToken, actorEmail, entryId: `${run}-${suffix}`, createdAt: now, message: "rehearsal floor probe", markdown: "probe", submittedBy: null, articles: [],
    });
    const asViewer = await attempt(() => entry(viewerEmail, "viewer"));
    const asEditor = await attempt(() => entry(editor.email, "editor"));
    const asAdmin = await attempt(() => entry(admin.email, "admin"));
    expect("floor", "viewer is refused at the editor floor", !asViewer.ok && errorMessage(asViewer.error).includes("Editor access required"), outcomeDetail(asViewer));
    expect("floor", "editor passes the editor floor", asEditor.ok && asEditor.value.created === true, outcomeDetail(asEditor));
    expect("floor", "admin passes the editor floor", asAdmin.ok && asAdmin.value.created === true, outcomeDetail(asAdmin));
    const entries = await selectDocuments(pool, "changelog", { where: '"entryId" LIKE $1', params: [`${run}-%`] });
    expect("floor", "only the admitted calls wrote rows", entries.map((row) => row.entryId).sort().join() === `${run}-admin,${run}-editor`, entries.map((row) => row.entryId));

    const unknownActor = await attempt(() => entry(`${run}-ghost@rehearsal.invalid`, "ghost"));
    expect("floor", "an actor with no membership is refused", !unknownActor.ok && errorMessage(unknownActor.error).includes("Editor access required"));

    // (d) admin floor and roster ownership: setRole as editor, as admin on self, on an admin, on the editor.
    const roleAsEditor = await attempt(() => write.mutation(api.memberships.setRole, { apiKey: adminKey, actorEmail: editor.email, email: viewerEmail, role: "contributor" }));
    expect("ownership", "editor is refused at the admin floor", !roleAsEditor.ok && errorMessage(roleAsEditor.error).includes("Admin access required"));
    const selfTarget = await attempt(() => write.mutation(api.memberships.setRole, { apiKey: adminKey, actorEmail: admin.email, email: admin.email, role: "contributor" }));
    expect("ownership", "admin cannot change their own row (SELF_TARGET)", rejectionCode(selfTarget) === "SELF_TARGET");
    const adminTarget = await attempt(() => write.mutation(api.memberships.ban, { apiKey: adminKey, actorEmail: editor.email, email: admin.email }));
    expect("ownership", "editor cannot ban an admin", !adminTarget.ok && errorMessage(adminTarget.error).includes("Admin access required"));
    await write.mutation(api.memberships.setRole, { apiKey: adminKey, actorEmail: admin.email, email: editor.email, role: "contributor" });
    expect("ownership", "admin demoted the editor to contributor", (await getMembershipByEmail(editor.email))?.role === "contributor");
    const demoted = await attempt(() => entry(editor.email, "demoted"));
    expect("floor", "demoted contributor is refused at the editor floor", !demoted.ok && errorMessage(demoted.error).includes("Editor access required"));
    expect("floor", "JWT refresh follows the demotion", (await refreshedRole(editor.email)) === "contributor");
    await write.mutation(api.memberships.setRole, { apiKey: adminKey, actorEmail: admin.email, email: editor.email, role: "editor" });

    // (d) the write client refuses an actorless mutation before any backend call.
    // The type system already demands `actorEmail`; the cast reproduces a caller that omitted it.
    const actorlessArgs = { apiKey: adminKey, email: editor.email, role: "editor" } as never;
    const actorless = await attempt(() => new ServerDataWriteClient(getPostgresClient()).mutation(api.memberships.setRole, actorlessArgs));
    expect("ownership", "ServerDataWriteClient refuses a mutation without actorEmail", !actorless.ok);

    // (d) same-origin gate in src/lib/http/protectedRouteOperation.ts: runs before rate limiting, session, and backend.
    let operationRan = false;
    const guarded = protectedRouteOperation({
      auth: "editor",
      rateLimit: "editorSmallWrite",
      unexpectedErrorLabel: "[t05]",
      operation: async () => {
        operationRan = true;
        return NextResponse.json({ ok: true });
      },
    });
    const foreign = await guarded(new Request("https://dev.dose.wiki/api/dev/members/ban", { method: "POST", headers: { Origin: "https://evil.example" } }));
    const crossSite = await guarded(new Request("https://dev.dose.wiki/api/dev/members/ban", { method: "POST", headers: { Origin: "https://dev.dose.wiki", "Sec-Fetch-Site": "cross-site" } }));
    expect("same-origin", "foreign Origin is refused with 403 ORIGIN_REQUIRED before the operation runs", foreign.status === 403 && (await foreign.json()).code === "ORIGIN_REQUIRED" && !operationRan);
    expect("same-origin", "cross-site Sec-Fetch-Site is refused with 403 before the operation runs", crossSite.status === 403 && (await crossSite.json()).code === "ORIGIN_REQUIRED" && !operationRan);

    // (b) ban: sign-in refused, JWT refresh degrades to viewer, reset link refused.
    await write.mutation(api.memberships.ban, { apiKey: adminKey, actorEmail: admin.email, email: editor.email });
    const bannedCredentials = await getCredentialsByUsername(editorUsername);
    expect("ban", "getCredentialsByUsername still returns the row, marked banned", typeof bannedCredentials?.bannedAt === "string");
    expect("ban", "authorizeCredentials refuses the banned member with the right password", (await authorizeCredentials({ username: editorUsername, password: resetPasswords[consumed[0]] })) === null);
    expect("ban", "JWT refresh degrades the banned member to viewer", (await refreshedRole(editor.email)) === "viewer");
    const bannedReset = await attempt(() => write.mutation(api.memberships.issuePasswordReset, { apiKey: adminKey, actorEmail: admin.email, email: editor.email, tokenHash: sha256("unused") }));
    expect("ban", "no reset link for a banned member (MEMBER_BANNED)", rejectionCode(bannedReset) === "MEMBER_BANNED");
    const bannedEntry = await attempt(() => entry(editor.email, "banned"));
    expect("ban", "banned member is refused by requireRole", !bannedEntry.ok && errorMessage(bannedEntry.error).includes("banned"));
    await write.mutation(api.memberships.unban, { apiKey: adminKey, actorEmail: admin.email, email: editor.email });
    expect("ban", "unban restores the editor role on refresh", (await refreshedRole(editor.email)) === "editor");

    // (b) refresh failure: the backend is unreachable, then the server key is missing. Both fail closed.
    await getPostgresClient().end();
    process.env.POSTGRES_POOLED_URL = "postgres://localhost:1/dosewiki";
    process.env.POSTGRES_DIRECT_URL = process.env.POSTGRES_POOLED_URL;
    process.env.TARGET_POSTGRES_URL = process.env.POSTGRES_POOLED_URL;
    const unreachable = await quietly(() => refreshedRole(admin.email));
    expect("refresh-failure", "unreachable database degrades the admin to viewer", unreachable === "viewer", unreachable);
    const unreachableSignIn = await attempt(() => authorizeCredentials({ username: admin.username, password: admin.password }));
    expect("refresh-failure", "sign-in surfaces the outage instead of admitting anyone", !unreachableSignIn.ok, outcomeDetail(unreachableSignIn));
    await getPostgresClient().end();
    process.env.POSTGRES_POOLED_URL = target;
    process.env.POSTGRES_DIRECT_URL = target;
    process.env.TARGET_POSTGRES_URL = target;
    resetServerDataWriteCapabilityCacheForTests();
    const savedKey = process.env.DATA_ADMIN_KEY;
    delete process.env.DATA_ADMIN_KEY;
    const keyless = await quietly(() => refreshedRole(admin.email));
    process.env.DATA_ADMIN_KEY = savedKey;
    expect("refresh-failure", "missing DATA_ADMIN_KEY degrades the admin to viewer", keyless === "viewer", keyless);
    expect("refresh-failure", "recovery restores the admin role", (await refreshedRole(admin.email)) === "admin");
  } finally {
    if (!keep) {
      await pool.query('DELETE FROM "changelog" WHERE "entryId" LIKE $1', [`${run}-%`]);
      await pool.query('DELETE FROM "inviteCodes" WHERE "codeHash" = $1', [inviteHash]);
      // Invite-created rows default to `<username>@members.dose.wiki`, so match the username prefix too.
      await pool.query('DELETE FROM "memberships" WHERE "email" LIKE $1 OR "username" LIKE $2', [`${run}-%`, `${run}-%`]);
    }
    const passed = checks.filter((c) => c.pass).length;
    const summary = {
      target: target.replace(/\/\/[^@]*@/, "//<redacted>@"),
      run,
      kept: keep,
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
    await getPostgresClient().end().catch(() => undefined);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
