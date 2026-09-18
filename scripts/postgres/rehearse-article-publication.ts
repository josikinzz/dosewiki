/**
 * Rehearsal: publish one article through Postgres and prove the
 * acceptance criteria against a live engine.
 *
 *   bun scripts/postgres/rehearse-article-publication.ts [--target <url>] [--allow-remote] [--keep]
 *
 * Creates one scratch article (slug `rehearsal-<random>`), runs
 * every scenario against it, and deletes the scratch rows unless `--keep`.
 * Nothing outside the scratch slug is read for update or written. The report
 * lands in runs/postgres-import/<timestamp>-publication/report.json.
 *
 * Scenarios:
 *   1. read: the public projection of the scratch article is served from SQL.
 *   2. publish: a save persists content, receipt, and outbox atomically.
 *   3. replay: the same proposal returns its prior result without writing;
 *      a different payload under the same proposalId is refused.
 *   4. race: two stale publishers of one section cannot both win.
 *   5. rollback: a failure injected after every write leaves content,
 *      receipts, and derived rows unchanged.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { computeReviewedArtifactDigest, REVIEWED_ARTIFACT_DIGEST_VERSION } from "../../lib/generatedPublication/canonical.mjs";
import {
  GENERATED_PUBLICATION_HASH_VERSION,
  GeneratedPublicationError,
  computeOwnedSectionHash,
  type ReviewedPublicationProposal,
} from "../../server/lib/generatedPublication";
import {
  articlePublicationKey,
  publishReviewedSectionInPostgres,
  readArticlePublicationState,
  readPublicArticleBySlug,
  type PublishReviewedSectionResult,
} from "../../lib/postgres/articlePublication";
import { documentHash } from "../../lib/postgres/documentCodec";
import { deleteDocument, insertDocument, mintDocumentId, selectDocuments, withTransaction } from "../../lib/postgres/documentStore";
import { minimalArticle } from "../../src/test/fixtures/articles";
import { guardTarget, resolveTarget } from "./targetGuard";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const FINGERPRINT = "postgres-rehearsal";
const ACTOR = "actor@rehearsal.invalid";

type Check = { scenario: string; check: string; pass: boolean; detail?: unknown };

const checks: Check[] = [];
function expect(scenario: string, check: string, pass: boolean, detail?: unknown): void {
  checks.push({ scenario, check, pass, ...(detail === undefined ? {} : { detail }) });
  console.log(`${pass ? "ok  " : "FAIL"} ${scenario}: ${check}${detail === undefined || pass ? "" : ` ${JSON.stringify(detail)}`}`);
}

function proposalFor(slug: string, baseArticle: Record<string, unknown>, summary: string, proposalId: string): ReviewedPublicationProposal {
  const proposedArticle = { ...structuredClone(baseArticle), summary };
  const value: ReviewedPublicationProposal = {
    proposalId,
    slug,
    profile: "summary",
    hashVersion: GENERATED_PUBLICATION_HASH_VERSION,
    baseArticle,
    proposedArticle,
    approvedPaths: ["summary"],
    expectedOwnedHash: computeOwnedSectionHash("summary", baseArticle),
    proposedOwnedHash: computeOwnedSectionHash("summary", proposedArticle),
    manifestDigest: "a".repeat(64),
    rawResponseHash: "b".repeat(64),
    targetDeploymentFingerprint: FINGERPRINT,
    artifactDigestVersion: REVIEWED_ARTIFACT_DIGEST_VERSION,
    artifactDigest: "",
    review: { status: "approved", reviewedBy: "reviewer@rehearsal.invalid", reviewedAt: "2026-09-09T00:00:00.000Z", artifactDigest: "" },
  };
  const artifactDigest = computeReviewedArtifactDigest(value);
  return { ...value, artifactDigest, review: { ...value.review, artifactDigest } };
}

async function snapshot(pool: Pool, slug: string) {
  const [article] = await selectDocuments(pool, "substanceIndex", { where: '"slug" = $1', params: [slug] });
  const state = await readArticlePublicationState(pool, slug);
  return {
    articleHash: article ? documentHash(article) : null,
    publicRevision: state.publicRevision,
    outbox: state.outbox ? { generation: state.outbox.generation, revision: state.outbox.revision, pending: state.outbox.pending } : null,
    outboxHash: state.outbox ? documentHash(state.outbox) : null,
    operations: state.operations.map((op) => op.proposalId),
  };
}

async function cleanup(pool: Pool, slug: string): Promise<void> {
  await withTransaction(pool, async (client) => {
    for (const table of ["generatedPublicationOperations", "substanceIndex"] as const) {
      for (const row of await selectDocuments(client, table, { where: '"slug" = $1', params: [slug] })) await deleteDocument(client, table, row._id as string);
    }
    for (const row of await selectDocuments(client, "publicCachePublications", { where: '"key" = $1', params: [articlePublicationKey(slug)] })) {
      await deleteDocument(client, "publicCachePublications", row._id as string);
    }
  });
}

async function main() {
  const argv = process.argv.slice(2);
  const target = resolveTarget(argv);
  guardTarget(target, argv.includes("--allow-remote"));
  const keep = argv.includes("--keep");
  const pool = new Pool({ connectionString: target, max: 4 });
  const slug = `rehearsal-${mintDocumentId().slice(0, 8)}`;
  const runDirectory = path.join(ROOT, "runs", "postgres-import", `${new Date().toISOString().replace(/[:.]/g, "-")}-publication`);
  const started = performance.now();
  try {
    // Scratch article. `id` is the fixture's canonical id; slug is unique to this run.
    const seed = { ...structuredClone(minimalArticle), slug, title: `Rehearsal ${slug}`, summary: "before summary" } as Record<string, unknown>;
    await insertDocument(pool, "substanceIndex", seed);

    // 1. read
    const projection = await readPublicArticleBySlug(pool, slug);
    expect("read", "public projection served from SQL", projection?.slug === slug && projection.summary === "before summary");
    expect("read", "editorial_review stripped, expert_reviewed exposed", projection !== null && !("editorial_review" in projection) && "expert_reviewed" in projection);
    const [stored] = await selectDocuments(pool, "substanceIndex", { where: '"slug" = $1', params: [slug] });
    const { _id, _creationTime, ...storedContent } = stored;
    expect("read", "stored document round-trips the seed losslessly", documentHash(storedContent) === documentHash(seed));
    const base = stored;

    // 2. publish
    const first = proposalFor(slug, base, "after summary", `rehearsal-${slug}-1`);
    const s0 = await snapshot(pool, slug);
    const r1 = await publishReviewedSectionInPostgres({ pool, proposal: first, actorEmail: ACTOR, expectedTargetDeploymentFingerprint: FINGERPRINT });
    const s1 = await snapshot(pool, slug);
    expect("publish", "status updated with outbox written", r1.status === "updated" && r1.outboxWritten, r1);
    expect("publish", "content changed", (await readPublicArticleBySlug(pool, slug))?.summary === "after summary");
    expect("publish", "one operation receipt recorded", s1.operations.length === 1 && s1.operations[0] === first.proposalId, s1.operations);
    expect("publish", "outbox receipt pending at generation 1 with the new revision", s1.outbox?.generation === 1 && s1.outbox.pending === true && s1.outbox.revision === s1.publicRevision, s1.outbox);
    expect("publish", "public revision moved", s0.publicRevision !== s1.publicRevision);

    // 3. replay
    const r2 = await publishReviewedSectionInPostgres({ pool, proposal: first, actorEmail: ACTOR, expectedTargetDeploymentFingerprint: FINGERPRINT });
    const s2 = await snapshot(pool, slug);
    expect("replay", "same payload returns already_applied with the recorded nextHash", r2.status === "already_applied" && r2.currentHash === (r1.status === "updated" ? r1.nextHash : null), r2);
    expect("replay", "replay wrote nothing", JSON.stringify(s2) === JSON.stringify(s1));
    const reused = proposalFor(slug, base, "a different payload", first.proposalId);
    let reuseError: unknown = null;
    try {
      await publishReviewedSectionInPostgres({ pool, proposal: reused, actorEmail: ACTOR, expectedTargetDeploymentFingerprint: FINGERPRINT });
    } catch (error) {
      reuseError = error;
    }
    expect("replay", "different payload under the same proposalId is refused", reuseError instanceof GeneratedPublicationError && reuseError.code === "IDEMPOTENCY_KEY_REUSED", reuseError instanceof Error ? reuseError.message : reuseError);
    expect("replay", "refused reuse wrote nothing", JSON.stringify(await snapshot(pool, slug)) === JSON.stringify(s1));
    // The unique index is the last line of defence against a raced replay.
    let uniqueError: unknown = null;
    try {
      await insertDocument(pool, "generatedPublicationOperations", { ...(await selectDocuments(pool, "generatedPublicationOperations", { where: '"proposalId" = $1', params: [first.proposalId] }))[0], _id: mintDocumentId() });
    } catch (error) {
      uniqueError = error;
    }
    expect("replay", "SQL refuses a second receipt for the same proposalId", (uniqueError as { code?: string } | null)?.code === "23505");

    // 4. race: both publishers hold the same stale base; A holds the row lock until B is blocked on it.
    const [live] = await selectDocuments(pool, "substanceIndex", { where: '"slug" = $1', params: [slug] });
    const a = proposalFor(slug, live, "publisher A", `rehearsal-${slug}-A`);
    const b = proposalFor(slug, live, "publisher B", `rehearsal-${slug}-B`);
    let releaseA: () => void = () => {};
    const aHolding = new Promise<void>((resolve) => { releaseA = resolve; });
    let bStarted: () => void = () => {};
    const bStartedPromise = new Promise<void>((resolve) => { bStarted = resolve; });
    const runA = publishReviewedSectionInPostgres({
      pool, proposal: a, actorEmail: ACTOR, expectedTargetDeploymentFingerprint: FINGERPRINT,
      beforeCommit: async () => { bStarted(); await aHolding; },
    });
    await bStartedPromise;
    const runB = publishReviewedSectionInPostgres({ pool, proposal: b, actorEmail: ACTOR, expectedTargetDeploymentFingerprint: FINGERPRINT });
    // B is now queued on A's row lock; give it a moment to prove it did not read past the lock, then let A commit.
    const bSettledEarly = await Promise.race([runB.then(() => true, () => true), new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 750))]);
    expect("race", "second publisher blocks on the row lock instead of reading stale content", bSettledEarly === false);
    releaseA();
    const [rA, rB]: PublishReviewedSectionResult[] = await Promise.all([runA, runB]);
    const s4 = await snapshot(pool, slug);
    expect("race", "first publisher wins", rA.status === "updated", rA);
    expect("race", "second publisher reports conflict with the committed hash", rB.status === "conflict" && rB.currentHash === (rA.status === "updated" ? rA.nextHash : null), rB);
    expect("race", "content is publisher A's, not silently B's", (await readPublicArticleBySlug(pool, slug))?.summary === "publisher A");
    expect("race", "only A's receipt exists", s4.operations.length === 2 && s4.operations.includes(a.proposalId) && !s4.operations.includes(b.proposalId), s4.operations);
    expect("race", "outbox generation advanced exactly once", s4.outbox?.generation === 2, s4.outbox);

    // 5. rollback
    const [live2] = await selectDocuments(pool, "substanceIndex", { where: '"slug" = $1', params: [slug] });
    const failing = proposalFor(slug, live2, "never visible", `rehearsal-${slug}-fail`);
    const before = await snapshot(pool, slug);
    let injected: unknown = null;
    try {
      await publishReviewedSectionInPostgres({
        pool, proposal: failing, actorEmail: ACTOR, expectedTargetDeploymentFingerprint: FINGERPRINT,
        beforeCommit: async (client) => {
          // Every write is already issued on this connection; prove it, then fail.
          const pending = await client.query('SELECT count(*)::int AS n FROM "generatedPublicationOperations" WHERE "proposalId" = $1', [failing.proposalId]);
          if (pending.rows[0].n !== 1) throw new Error("expected the receipt to be visible inside the transaction");
          throw new Error("injected failure before commit");
        },
      });
    } catch (error) {
      injected = error;
    }
    const after = await snapshot(pool, slug);
    expect("rollback", "injected failure surfaced", injected instanceof Error && injected.message === "injected failure before commit", injected instanceof Error ? injected.message : injected);
    expect("rollback", "content unchanged", after.articleHash === before.articleHash);
    expect("rollback", "receipts unchanged", JSON.stringify(after.operations) === JSON.stringify(before.operations));
    expect("rollback", "derived outbox row unchanged", after.outboxHash === before.outboxHash);
    expect("rollback", "connection is reusable after rollback", (await readPublicArticleBySlug(pool, slug))?.summary === "publisher A");
  } finally {
    if (!keep) await cleanup(pool, slug);
    const passed = checks.filter((c) => c.pass).length;
    const summary = {
      target: target.replace(/\/\/[^@]*@/, "//<redacted>@"),
      slug,
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
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
