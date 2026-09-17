/**
 * Rehearsal: citation evidence and guarded publication on Postgres.
 *
 *   bun scripts/postgres/rehearse-citation-publication.ts [--target <url>] [--allow-remote] [--keep]
 *
 * Every call goes through `PostgresClient` with the same `api.*`
 * references the app uses, so the registered native handlers run unchanged.
 * The script creates one scratch article, two scratch memberships (admin and
 * editor), and its own evidence rows under a `t07-<random>` prefix, then
 * deletes them unless `--keep`. Nothing outside the prefix is written. The
 * report lands in runs/postgres-import/<timestamp>-citation-publication/report.json.
 *
 * Criteria:
 *   a. round-trip: evidence written through `api.citationEvidence.upsertMany`
 *      and `setManyStatus` reads back identically through `getBySlug` and SQL;
 *      `approvedWriteMode: preserve` leaves approved rows byte-identical.
 *   b. invalidation: an admin publish of the cited `summary` section through
 *      `api.articleLifecycle.write` decertifies only the evidence owned by
 *      that section (`server/lib/articleRevisionJournal.ts`), retaining the
 *      old support for audit and leaving other sections' rows untouched.
 *   c. guarded publication: `api.substanceIndex.publishReviewedSection`
 *      refuses a tampered owned hash, a stale base, a changed manifest digest,
 *      and a wrong deployment fingerprint with no partial writes; a valid
 *      proposal publishes content, receipt, and outbox together and leaves
 *      evidence untouched.
 *   d. reviewed gate: every mutation that touches `editorial_review` is
 *      exercised with an agent credential (scoped intent token plus a delegated
 *      editor actor, and the bare-token script path where agents use it) and
 *      cannot set `status: "completed"`.
 *
 * Deployment binding: `requireGeneratedPublicationDeploymentFingerprint`
 * reads GENERATED_PUBLICATION_DEPLOYMENT_FINGERPRINT from the process env. The
 * rehearsal uses `postgres-rehearsal` unless the environment supplies a fingerprint.
 */

import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { PostgresError } from "../../lib/postgres/runtime/values";
import { Pool } from "pg";
import { api } from "../../lib/postgres/runtime/api";
import { computeReviewedArtifactDigest, REVIEWED_ARTIFACT_DIGEST_VERSION } from "../../lib/generatedPublication/canonical.mjs";
import {
  GENERATED_PUBLICATION_HASH_VERSION,
  computeOwnedSectionHash,
  type ReviewedPublicationProposal,
} from "../../server/lib/generatedPublication";
import { articlePublicationKey } from "../../lib/postgres/articlePublication";
import { documentHash, type DataDocument } from "../../lib/postgres/documentCodec";
import { deleteDocument, insertDocument, mintDocumentId, selectDocuments, withTransaction } from "../../lib/postgres/documentStore";
import { PostgresClient } from "../../lib/postgres/runtime/client";
import { minimalArticle } from "../../src/test/fixtures/articles";
import { guardTarget, resolveTarget } from "./targetGuard";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

// Tokens are read from the editor process environment. Distinct random
// values per intent make "scoped" and "legacy" credentials distinguishable.
process.env.GENERATED_PUBLICATION_DEPLOYMENT_FINGERPRINT ||= "postgres-rehearsal";
const FINGERPRINT = process.env.GENERATED_PUBLICATION_DEPLOYMENT_FINGERPRINT;
const TOKENS = {
  editorArticleWrite: `t07-scoped-editor-${randomBytes(12).toString("hex")}`,
  citationEvidenceWrite: `t07-scoped-evidence-write-${randomBytes(12).toString("hex")}`,
  citationEvidenceReview: `t07-scoped-evidence-review-${randomBytes(12).toString("hex")}`,
  generatedPublicationWrite: `t07-scoped-publication-${randomBytes(12).toString("hex")}`,
};
process.env.DATA_ADMIN_TOKEN_EDITOR_ARTICLE_WRITE = TOKENS.editorArticleWrite;
process.env.DATA_ADMIN_TOKEN_CITATION_EVIDENCE_WRITE = TOKENS.citationEvidenceWrite;
process.env.DATA_ADMIN_TOKEN_CITATION_EVIDENCE_REVIEW = TOKENS.citationEvidenceReview;
process.env.DATA_ADMIN_TOKEN_GENERATED_PUBLICATION_WRITE = TOKENS.generatedPublicationWrite;
process.env.DATA_ADMIN_KEY ||= `t07-legacy-${randomBytes(12).toString("hex")}`;

const INVALIDATION_REASON = "Article content or reference metadata changed; retained support must be rechecked against this revision.";

type Check = { scenario: string; check: string; pass: boolean; detail?: unknown };
const checks: Check[] = [];
function expect(scenario: string, check: string, pass: boolean, detail?: unknown): void {
  checks.push({ scenario, check, pass, ...(detail === undefined ? {} : { detail }) });
  console.log(`${pass ? "ok  " : "FAIL"} ${scenario}: ${check}${detail === undefined || pass ? "" : ` ${JSON.stringify(detail)}`}`);
}

/** Key-sorted JSON; `undefined` members drop out, so absent and undefined compare equal. */
function canon(value: unknown): string {
  return JSON.stringify(value, (_key, inner) => (
    inner && typeof inner === "object" && !Array.isArray(inner)
      ? Object.fromEntries(Object.keys(inner as object).sort().map((key) => [key, (inner as Record<string, unknown>)[key]]))
      : inner
  ));
}

type Refusal = { code: string | null; message: string } | null;
/** Null when the call succeeded; otherwise the PostgresError code (or error name) and message. */
async function refusal(run: () => Promise<unknown>): Promise<Refusal> {
  try {
    await run();
    return null;
  } catch (error) {
    if (error instanceof PostgresError) {
      const data = error.data as Record<string, unknown> | string;
      if (typeof data === "object" && data) return { code: String(data.code ?? ""), message: String(data.message ?? error.message) };
      return { code: String(data), message: error.message };
    }
    return { code: error instanceof Error ? error.name : null, message: error instanceof Error ? error.message : String(error) };
  }
}

function stripSystemFields(document: DataDocument): Record<string, unknown> {
  const { _id, _creationTime, ...content } = document;
  return content;
}

function proposalFor(slug: string, baseArticle: Record<string, unknown>, summary: string, proposalId: string, fingerprint = FINGERPRINT, manifestDigest = "a".repeat(64)): ReviewedPublicationProposal {
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
    manifestDigest,
    rawResponseHash: "b".repeat(64),
    targetDeploymentFingerprint: fingerprint,
    artifactDigestVersion: REVIEWED_ARTIFACT_DIGEST_VERSION,
    artifactDigest: "",
    review: { status: "approved", reviewedBy: "reviewer@rehearsal.invalid", reviewedAt: "2026-09-09T00:00:00.000Z", artifactDigest: "" },
  };
  const artifactDigest = computeReviewedArtifactDigest(value);
  return { ...value, artifactDigest, review: { ...value.review, artifactDigest } };
}

async function main() {
  const argv = process.argv.slice(2);
  const target = resolveTarget(argv);
  guardTarget(target, argv.includes("--allow-remote"));
  const keep = argv.includes("--keep");
  const pool = new Pool({ connectionString: target, max: 4 });
  const data = PostgresClient.fromUrl(target);
  const prefix = `t07-${mintDocumentId().slice(0, 8)}`;
  const slug = `${prefix}-article`;
  const adminEmail = `${prefix}-admin@rehearsal.invalid`;
  const editorEmail = `${prefix}-editor@rehearsal.invalid`;
  const REF1 = `${prefix}-ref-1`;
  const REF2 = `${prefix}-ref-2`;
  const runDirectory = path.join(ROOT, "runs", "postgres-import", `${new Date().toISOString().replace(/[:.]/g, "-")}-citation-publication`);
  const started = performance.now();
  let articleDocumentId: string | null = null;

  const article = async () => (await selectDocuments(pool, "substanceIndex", { where: '"slug" = $1', params: [slug], limit: 2 }))[0];
  const evidenceRows = async () => selectDocuments(pool, "citationEvidence", { where: '"slug" = $1', params: [slug], orderBy: '"claimKey" ASC' });
  const evidenceByClaim = async () => new Map((await evidenceRows()).map((row) => [row.claimKey as string, row]));
  const reviewStatus = async () => ((await article()).editorial_review as { status?: string } | undefined)?.status ?? null;
  /** Everything a guarded publish may touch, for the "no partial writes" comparisons. */
  const guardSnapshot = async () => {
    const live = await article();
    const operations = await selectDocuments(pool, "generatedPublicationOperations", { where: '"slug" = $1', params: [slug] });
    const outbox = await selectDocuments(pool, "publicCachePublications", { where: '"key" = $1', params: [articlePublicationKey(slug)] });
    return {
      articleHash: documentHash(live),
      ownedHash: computeOwnedSectionHash("summary", stripSystemFields(live)),
      operations: operations.map((op) => op.proposalId as string).sort(),
      outboxHash: outbox[0] ? documentHash(outbox[0]) : null,
      evidenceHash: documentHash({ rows: await evidenceRows() }),
    };
  };
  const readEvidence = () => data.query(api.citationEvidence.getBySlug, { apiKey: TOKENS.citationEvidenceReview, actorEmail: editorEmail, slug });

  try {
    // Scratch memberships and article. The numeric id must not collide with a fixture article.
    const now = new Date().toISOString();
    for (const [email, role] of [[adminEmail, "admin"], [editorEmail, "editor"]] as const) {
      await insertDocument(pool, "memberships", { email, role, createdAt: now, updatedAt: now });
    }
    let articleId = 70_000_000 + Math.floor(Math.random() * 10_000_000);
    while ((await selectDocuments(pool, "substanceIndex", { where: '"id" = $1', params: [articleId], limit: 1 })).length) articleId += 1;
    const references = [
      { id: REF1, type: "journal_article", title: "Rehearsal source one", authors: ["Rehearsal, A."], year: 2020, sourceType: "primary_literature", quality: "high" },
      { id: REF2, type: "book", title: "Rehearsal source two", authors: ["Rehearsal, B."], year: 2018, sourceType: "book", quality: "medium" },
    ];
    const seed = {
      ...structuredClone(minimalArticle),
      id: articleId,
      slug,
      title: `Rehearsal ${prefix}`,
      summary: `Summary claim about overdose risk. [cite:${REF1}]`,
      pharmacology: { ...structuredClone(minimalArticle.pharmacology), pharmacodynamics: `Pharmacodynamics claim with lethal dose data. [cite:${REF2}]` },
      tolerance: { ...structuredClone(minimalArticle.tolerance), full_tolerance: "Tolerance claim without a source." },
      references,
      editorial_review: { status: "needed", notes: "rehearsal scratch" },
    } as Record<string, unknown>;
    // The write validator (`substanceArticleLightValidator`) does not name `section_gaps`; stored articles that
    // round-trip through the editor never carry it.
    delete seed.section_gaps;
    articleDocumentId = await insertDocument(pool, "substanceIndex", seed);

    // ---------------------------------------------------------------- a. round-trip
    const strictFor = (row: { claimKey: string; fieldPath: string; claimText: string; referenceIds: string[] }) => ({
      decision: "approved" as const, reviewedBy: adminEmail, reviewedAt: "2026-09-09T01:00:00.000Z",
      claimKey: row.claimKey, fieldPath: row.fieldPath, claimText: row.claimText, referenceIds: row.referenceIds,
      rationale: "Reviewer read the quoted passage against the claim.",
    });
    const rowA = {
      section: "summary", claimKey: "summary.overdose-risk", fieldPath: "summary", claimText: "Summary claim about overdose risk.",
      entailmentVerdict: "entails" as const, status: "approved" as const, severity: "blocking" as const, confidence: 0.93,
      referenceIds: [REF1],
      supports: [{
        sourceId: `${prefix}-src-1`, sourceName: "Rehearsal source one", referenceId: REF1, sourceType: "journal_article", quality: null,
        supportingQuote: "Overdose risk is documented in the cohort.", rationale: "The quote states the claim directly.",
        verifiedQuote: { sourceId: `${prefix}-src-1`, matchType: "exact" as const, startOffset: 12, endOffset: 41 },
      }],
      diagnostics: [{ code: "t07-note", message: "Rehearsal diagnostic.", severity: "warning" as const, claimKey: null }],
      provenance: { runId: prefix, offsets: [12, 41], nested: { marker: `[cite:${REF1}]` } },
    };
    const rowB = {
      section: "pharmacology", claimKey: "pharmacology.lethal-dose", fieldPath: "pharmacology.pharmacodynamics", claimText: "Pharmacodynamics claim with lethal dose data.",
      entailmentVerdict: "entails" as const, status: "approved" as const, severity: "blocking" as const, confidence: 0.81,
      referenceIds: [REF2],
      supports: [{
        sourceId: `${prefix}-src-2`, sourceName: "Rehearsal source two", referenceId: REF2, sourceType: null, quality: "medium",
        supportingQuote: "The lethal dose was reported   with irregular spacing.", rationale: "Whitespace-normalized match.",
        verifiedQuote: { sourceId: `${prefix}-src-2`, matchType: "normalized_whitespace" as const, startOffset: null, endOffset: null },
      }],
      provenance: { runId: prefix, marker: `[cite:${REF2}]` },
    };
    const rowC = {
      section: "tolerance", claimKey: "tolerance.unsourced", fieldPath: "tolerance.full_tolerance", claimText: "Tolerance claim without a source.",
      status: "needs_source" as const, severity: "non_blocking" as const, referenceIds: [] as string[],
    };
    const evidence = [
      { ...rowA, strictReviewEvidence: strictFor(rowA) },
      { ...rowB, strictReviewEvidence: strictFor(rowB) },
      rowC,
    ];
    /** What `validateEvidenceRow` stores: referenceIds and the single-support mirrors derive from `supports`. */
    const expectedStored = (row: typeof evidence[number]) => {
      const supports = "supports" in row && row.supports ? row.supports : [];
      const single = supports.length === 1 ? supports[0] : null;
      return {
        ...row, slug, articleId, supports, referenceIds: supports.map((support) => support.referenceId),
        sourceName: single?.sourceName, sourceType: single?.sourceType ?? undefined, quality: single?.quality ?? undefined,
        supportingSnippet: single?.supportingQuote, supportRationale: single?.rationale,
      };
    };
    const write1 = await data.mutation(api.citationEvidence.upsertMany, {
      apiKey: TOKENS.citationEvidenceWrite, actorEmail: adminEmail, slug, articleId, evidence, approvedWriteMode: "replace",
    });
    expect("round-trip", "upsertMany created three rows", write1.created === 3 && write1.updated === 0, write1);
    const read1 = await readEvidence();
    const stored1 = new Map(read1.map((row) => [row.claimKey, row]));
    for (const row of evidence) {
      const stored = stored1.get(row.claimKey);
      const { _id, _creationTime, createdAt, updatedAt, updatedBy, ...content } = stored ?? {};
      expect("round-trip", `${row.claimKey} reads back identically through getBySlug`, canon(content) === canon(expectedStored(row)), { stored: content, expected: expectedStored(row) });
      expect("round-trip", `${row.claimKey} stamps updatedBy with the scoped intent and actor`, updatedBy === `apiKey:citationEvidenceWrite:${adminEmail}` && typeof updatedAt === "string" && createdAt === updatedAt, { updatedBy, updatedAt, createdAt });
    }
    const sqlRows = await evidenceByClaim();
    expect("round-trip", "runtime read and SQL documents are the same documents", read1.length === 3 && read1.every((row) => documentHash(row as DataDocument) === documentHash(sqlRows.get(row.claimKey)!)));
    const a1 = sqlRows.get(rowA.claimKey)!;
    expect("round-trip", "offsets keep numbers and nulls distinct inside jsonb",
      (a1.supports as typeof rowA.supports)[0].verifiedQuote.startOffset === 12
      && (sqlRows.get(rowB.claimKey)!.supports as typeof rowB.supports)[0].verifiedQuote.startOffset === null
      && (a1.supports as typeof rowA.supports)[0].quality === null
      && !("strictReviewEvidence" in sqlRows.get(rowC.claimKey)!));
    // preserve: approved rows are not rewritten even when the payload differs.
    const tampered = evidence.map((row) => (row.status === "approved" ? { ...row, confidence: 0.1 } : { ...row, claimText: `${row.claimText} (rewritten)` }));
    const write2 = await data.mutation(api.citationEvidence.upsertMany, {
      apiKey: TOKENS.citationEvidenceWrite, actorEmail: adminEmail, slug, articleId, evidence: tampered, approvedWriteMode: "preserve",
    });
    const sqlRows2 = await evidenceByClaim();
    expect("round-trip", "preserve mode reports two preserved approved rows and one update", write2.preservedApproved === 2 && write2.updated === 1 && write2.created === 0, write2);
    expect("round-trip", "preserved approved rows are byte-identical to the prior evidence",
      [rowA, rowB].every((row) => documentHash(sqlRows.get(row.claimKey)!) === documentHash(sqlRows2.get(row.claimKey)!)));
    expect("round-trip", "the non-approved row took the new claim text", sqlRows2.get(rowC.claimKey)?.claimText === `${rowC.claimText} (rewritten)`);
    // refresh with the original payload: content restored, only the stamp moves.
    // tsconfig.scripts.json targets a lib without Promise.withResolvers.
    await new Promise<void>((resolve) => setTimeout(resolve, 2));
    const write3 = await data.mutation(api.citationEvidence.upsertMany, {
      apiKey: TOKENS.citationEvidenceWrite, actorEmail: adminEmail, slug, articleId, evidence, approvedWriteMode: "refresh",
    });
    const sqlRows3 = await evidenceByClaim();
    expect("round-trip", "refresh mode rewrites every row", write3.updated === 3, write3);
    expect("round-trip", "refresh with the original payload differs from the first write only by updatedAt",
      evidence.every((row) => {
        const { updatedAt: before, ...first } = sqlRows.get(row.claimKey)!;
        const { updatedAt: after, ...third } = sqlRows3.get(row.claimKey)!;
        return canon(first) === canon(third) && before !== after;
      }));
    const status1 = await data.mutation(api.citationEvidence.setManyStatus, {
      apiKey: TOKENS.citationEvidenceReview, actorEmail: adminEmail, slug, claimKeys: [rowC.claimKey], status: "needs_review", statusReason: "Rehearsal reviewer note",
    });
    const c4 = (await evidenceByClaim()).get(rowC.claimKey)!;
    expect("round-trip", "setManyStatus round-trips status and reviewer note", status1.updated === 1 && c4.status === "needs_review" && c4.statusReason === "Rehearsal reviewer note" && canon(c4.referenceIds) === "[]", c4);

    // ---------------------------------------------------------------- b. invalidation
    const before = await evidenceByClaim();
    const state = await data.query(api.articleLifecycle.get, { apiKey: TOKENS.editorArticleWrite, actorEmail: adminEmail, slug });
    const edited = { ...structuredClone(state.article), summary: `Summary claim about overdose risk, revised wording. [cite:${REF1}]` };
    const publishStart = Date.now();
    const published = await data.mutation(api.articleLifecycle.write, {
      apiKey: TOKENS.editorArticleWrite, actorEmail: adminEmail, action: "publish", slug,
      baseHash: state.baseHash, changeId: `${prefix}-publish-1`, article: edited, summary: "Rehearsal: revise the summary wording",
    });
    const after = await evidenceByClaim();
    expect("invalidation", "publish recorded a revision", typeof published.revisionId === "string" && published.baseHash !== state.baseHash, published);
    expect("invalidation", "article summary changed and the marker survived", (await article()).summary === edited.summary);
    const a2 = after.get(rowA.claimKey)!;
    const a0 = before.get(rowA.claimKey)!;
    expect("invalidation", "summary evidence is decertified: needs_review, uncertain, strict evidence cleared, contract reason",
      a2.status === "needs_review" && a2.entailmentVerdict === "uncertain" && !("strictReviewEvidence" in a2) && a2.statusReason === INVALIDATION_REASON,
      { status: a2.status, entailmentVerdict: a2.entailmentVerdict, strict: a2.strictReviewEvidence, statusReason: a2.statusReason });
    expect("invalidation", "decertification is stamped with the publishing actor", a2.updatedBy === adminEmail && typeof a2.updatedAt === "string" && Date.parse(a2.updatedAt as string) >= publishStart - 1000, { updatedBy: a2.updatedBy, updatedAt: a2.updatedAt });
    const { status: _s0, entailmentVerdict: _v0, strictReviewEvidence: _e0, statusReason: _r0, updatedBy: _b0, updatedAt: _t0, ...retained0 } = a0;
    const { status: _s2, entailmentVerdict: _v2, statusReason: _r2, updatedBy: _b2, updatedAt: _t2, ...retained2 } = a2;
    expect("invalidation", "old support, quotes, offsets, references, and provenance are retained for audit", canon(retained0) === canon(retained2));
    expect("invalidation", "pharmacology strict evidence untouched by a summary edit", documentHash(before.get(rowB.claimKey)!) === documentHash(after.get(rowB.claimKey)!));
    expect("invalidation", "tolerance evidence untouched by a summary edit", documentHash(before.get(rowC.claimKey)!) === documentHash(after.get(rowC.claimKey)!));
    const revisions = await selectDocuments(pool, "articleRevisions", { where: '"slug" = $1', params: [slug] });
    const changelog = await selectDocuments(pool, "changelog", { where: '"articles"::text LIKE $1', params: [`%${slug}%`] });
    expect("invalidation", "revision journal and public changelog were written in the same publish", revisions.length === 1 && changelog.length === 1 && revisions[0].changeId === `${prefix}-publish-1`, { revisions: revisions.length, changelog: changelog.length });
    const history = await selectDocuments(pool, "articleHistory", { where: '"slug" = $1', params: [slug] });
    expect("invalidation", "changelog insert synced the derived articleHistory row (indexedMutation)", history.length === 1 && history[0].changelog_id === changelog[0]?._id, { history: history.length });
    // Re-approve the summary row so the guarded publication scenario has strict evidence to protect.
    await data.mutation(api.citationEvidence.upsertMany, {
      apiKey: TOKENS.citationEvidenceWrite, actorEmail: adminEmail, slug, articleId, evidence, approvedWriteMode: "refresh",
    });

    // ---------------------------------------------------------------- c. guarded publication
    const publishAs = (proposal: ReviewedPublicationProposal) => data.mutation(api.substanceIndex.publishReviewedSection, {
      apiKey: TOKENS.generatedPublicationWrite, actorEmail: editorEmail, proposal,
    });
    const liveBase = stripSystemFields(await article());
    const s0 = await guardSnapshot();
    const valid = proposalFor(slug, liveBase, `Summary claim about overdose risk, generated wording. [cite:${REF1}]`, `${prefix}-proposal-valid`);

    const staleHash = await refusal(() => publishAs({ ...valid, expectedOwnedHash: "0".repeat(64) }));
    expect("guarded", "tampered expectedOwnedHash is refused", staleHash?.code === "EXPECTED_HASH_MISMATCH", staleHash);
    expect("guarded", "tampered expectedOwnedHash wrote nothing", canon(await guardSnapshot()) === canon(s0));

    const staleBase = proposalFor(slug, { ...liveBase, summary: `Summary claim about overdose risk. [cite:${REF1}]` }, `Summary from a stale base. [cite:${REF1}]`, `${prefix}-proposal-stale`);
    const staleResult = await publishAs(staleBase);
    expect("guarded", "stale owned-section base reports conflict against the live hash", staleResult.status === "conflict" && staleResult.currentHash === s0.ownedHash, staleResult);
    expect("guarded", "stale base wrote nothing (no receipt, no content, no outbox, no evidence change)", canon(await guardSnapshot()) === canon(s0));

    const manifest = await refusal(() => publishAs({ ...valid, manifestDigest: "c".repeat(64) }));
    expect("guarded", "changed manifest digest breaks the reviewed artifact digest", manifest?.code === "ARTIFACT_DIGEST_MISMATCH", manifest);
    expect("guarded", "changed manifest digest wrote nothing", canon(await guardSnapshot()) === canon(s0));

    const wrongTarget = await refusal(() => publishAs(proposalFor(slug, liveBase, valid.proposedArticle.summary as string, `${prefix}-proposal-wrong-target`, "wrong-deployment")));
    expect("guarded", "wrong targetDeploymentFingerprint is refused by the deployment binding", wrongTarget?.code === "TARGET_DEPLOYMENT_MISMATCH", wrongTarget);
    expect("guarded", "wrong fingerprint wrote nothing", canon(await guardSnapshot()) === canon(s0));

    const legacy = await refusal(() => data.mutation(api.substanceIndex.publishReviewedSection, { apiKey: process.env.DATA_ADMIN_KEY, actorEmail: editorEmail, proposal: valid }));
    expect("guarded", "legacy admin key cannot authorize generated publication", legacy?.code === "SCOPED_TOKEN_REQUIRED", legacy);

    const ok = await publishAs(valid);
    const s1 = await guardSnapshot();
    expect("guarded", "valid proposal publishes with status updated", ok.status === "updated" && ok.previousHash === s0.ownedHash, ok);
    expect("guarded", "content hash moved to the proposal's nextHash", s1.ownedHash === (ok.status === "updated" ? ok.nextHash : null) && s1.articleHash !== s0.articleHash);
    expect("guarded", "exactly one receipt was written, under the valid proposalId", canon(s1.operations) === canon([valid.proposalId]), s1.operations);
    const outbox = (await selectDocuments(pool, "publicCachePublications", { where: '"key" = $1', params: [articlePublicationKey(slug)] }))[0];
    expect("guarded", "publication outbox receipt is pending for the article", outbox?.pending === true && typeof outbox.generation === "number", outbox && { generation: outbox.generation, pending: outbox.pending });
    expect("guarded", "generated publication leaves citation evidence untouched (markers preserved, no decertification)", s1.evidenceHash === s0.evidenceHash);
    const replay = await publishAs(valid);
    expect("guarded", "replay returns already_applied without writing", replay.status === "already_applied" && canon(await guardSnapshot()) === canon(s1), replay);

    // ---------------------------------------------------------------- d. reviewed gate
    const gateBase = await guardSnapshot();
    const unchanged = async (label: string) => {
      expect("reviewed-gate", `${label}: editorial_review still "needed"`, (await reviewStatus()) === "needed");
    };
    const editorCall = (token: string) => ({ apiKey: token, actorEmail: editorEmail });

    const d1 = await refusal(() => data.mutation(api.substanceIndex.setEditorialReview, { ...editorCall(TOKENS.editorArticleWrite), slug, status: "completed" }));
    expect("reviewed-gate", "setEditorialReview completed with scoped token + editor actor is refused at the admin floor", d1?.message === "Admin access required", d1);
    await unchanged("setEditorialReview by editor");
    const d2 = await refusal(() => data.mutation(api.substanceIndex.setEditorialReview, { ...editorCall(TOKENS.citationEvidenceWrite), slug, status: "completed" }));
    expect("reviewed-gate", "setEditorialReview with a token scoped to another intent is refused as an invalid key", d2?.message === "Authentication failed: Invalid API key", d2);
    const d3 = await refusal(() => data.mutation(api.substanceIndex.setEditorialReview, { ...editorCall(TOKENS.generatedPublicationWrite), slug, status: "completed" }));
    expect("reviewed-gate", "the generated-publication token cannot reach setEditorialReview", d3?.message === "Authentication failed: Invalid API key", d3);
    await unchanged("wrong-intent tokens");

    const progress = await data.mutation(api.substanceIndex.setEditorialReview, { ...editorCall(TOKENS.editorArticleWrite), slug, status: "in_progress" });
    expect("reviewed-gate", "editor may move the review to in_progress (notes kept, no reviewer stamp)", progress.editorial_review.status === "in_progress" && progress.editorial_review.notes === "rehearsal scratch" && !("reviewed_by" in progress.editorial_review), progress);
    const back = await data.mutation(api.substanceIndex.setEditorialReview, { ...editorCall(TOKENS.editorArticleWrite), slug, status: "needed" });
    expect("reviewed-gate", "editor may move it back to needed", back.editorial_review.status === "needed");

    const flagged = await data.mutation(api.substanceIndex.addHumanReviewFlag, { ...editorCall(TOKENS.editorArticleWrite), slug, flag: { label: "Check wording", severity: "minor", note: "Rehearsal flag", section: "summary" } });
    expect("reviewed-gate", "addHumanReviewFlag appends a flag and preserves status", flagged.flags.length === 1 && (await reviewStatus()) === "needed", flagged);
    const agentFlags = await data.mutation(api.substanceIndex.replaceAgentReviewFlagsForArticle, { apiKey: TOKENS.editorArticleWrite, slug, runId: `${prefix}-review-run`, flags: [{ label: "Agent flag", severity: "note", note: "Rehearsal agent flag" }] });
    expect("reviewed-gate", "replaceAgentReviewFlagsForArticle (bare-token script path) replaces agent flags only and preserves status",
      agentFlags.flags.length === 2 && agentFlags.flags.some((flag) => flag.source === "human") && (await reviewStatus()) === "needed", agentFlags);
    const injected = await refusal(() => data.mutation(api.substanceIndex.addHumanReviewFlag, { ...editorCall(TOKENS.editorArticleWrite), slug, flag: { label: "Smuggled", severity: "note", note: "", status: "completed" } as never }));
    expect("reviewed-gate", "a flag payload carrying extra keys is rejected before the article is touched", injected !== null, injected);
    const deleted = await data.mutation(api.substanceIndex.deleteReviewFlag, { ...editorCall(TOKENS.editorArticleWrite), slug, identity: { created_at: flagged.flags[0].created_at, label: "Check wording", source: "human" } });
    expect("reviewed-gate", "deleteReviewFlag removes the flag and preserves status", deleted.flags.length === 1 && (await reviewStatus()) === "needed");

    const lifecycle = await data.query(api.articleLifecycle.get, { apiKey: TOKENS.editorArticleWrite, actorEmail: editorEmail, slug });
    const reviewedArticle = { ...structuredClone(lifecycle.article), editorial_review: { ...(lifecycle.article.editorial_review as Record<string, unknown>), status: "completed", reviewed_by: editorEmail, reviewed_at: now } };
    for (const action of ["saveDraft", "submit"] as const) {
      const result = await refusal(() => data.mutation(api.articleLifecycle.write, {
        ...editorCall(TOKENS.editorArticleWrite), action, slug, baseHash: lifecycle.baseHash, changeId: `${prefix}-${action}-review`, article: reviewedArticle, summary: "Rehearsal attempt", draftVersion: lifecycle.draftVersion,
      }));
      expect("reviewed-gate", `articleLifecycle.write ${action} carrying a completed review is refused as an invalid content edit`, result?.code === "ARTICLE_INVALID" && result.message.startsWith("editorial_review:"), result);
    }
    const editorPublish = await refusal(() => data.mutation(api.articleLifecycle.write, {
      ...editorCall(TOKENS.editorArticleWrite), action: "publish", slug, baseHash: lifecycle.baseHash, changeId: `${prefix}-publish-review-editor`, article: reviewedArticle, summary: "Rehearsal attempt",
    }));
    expect("reviewed-gate", "articleLifecycle.write publish by an editor is refused at the admin floor", editorPublish?.message === "Admin access required", editorPublish);
    const adminPublish = await refusal(() => data.mutation(api.articleLifecycle.write, {
      apiKey: TOKENS.editorArticleWrite, actorEmail: adminEmail, action: "publish", slug, baseHash: lifecycle.baseHash, changeId: `${prefix}-publish-review-admin`, article: reviewedArticle, summary: "Rehearsal attempt",
    }));
    expect("reviewed-gate", "even an admin content publish cannot carry a review status change", adminPublish?.code === "ARTICLE_INVALID" && adminPublish.message.startsWith("editorial_review:"), adminPublish);
    await unchanged("articleLifecycle.write");
    expect("reviewed-gate", "refused lifecycle writes left no drafts, receipts, or proposals",
      (await selectDocuments(pool, "articleDrafts", { where: '"slug" = $1', params: [slug] })).length === 0
      && (await selectDocuments(pool, "articleDraftReceipts", { where: '"ownerEmail" = $1', params: [editorEmail] })).length === 0
      && (await selectDocuments(pool, "articleProposalTargets", { where: '"slug" = $1', params: [slug] })).length === 0);

    const fieldWrite = await refusal(() => data.mutation(api.substanceIndex.setArticleField, {
      apiKey: TOKENS.editorArticleWrite, actorEmail: adminEmail, slug, path: "editorial_review.status", value: "completed", expected: "needed", baseHash: lifecycle.baseHash, changeId: `${prefix}-field-review`,
    }));
    expect("reviewed-gate", "setArticleField refuses editorial_review as a field path", fieldWrite !== null && fieldWrite.code !== "ARTICLE_CONFLICT", fieldWrite);
    await unchanged("setArticleField");

    const reviewProposal = (() => {
      const base = stripSystemFields(lifecycle.article as DataDocument);
      const value = { ...proposalFor(slug, base, base.summary as string, `${prefix}-proposal-review`), proposedArticle: { ...structuredClone(base), editorial_review: reviewedArticle.editorial_review }, approvedPaths: ["editorial_review"] };
      const artifactDigest = computeReviewedArtifactDigest(value);
      return { ...value, artifactDigest, review: { ...value.review, artifactDigest } };
    })();
    const generated = await refusal(() => publishAs(reviewProposal));
    expect("reviewed-gate", "publishReviewedSection refuses editorial_review as a protected field", generated?.code === "UNOWNED_FIELD_CHANGE", generated);
    await unchanged("publishReviewedSection");

    const draftAsEditor = await refusal(() => data.mutation(api.citationEvidence.applyDraft, { ...editorCall(TOKENS.citationEvidenceWrite), slug, article: reviewedArticle, evidence: [] }));
    expect("reviewed-gate", "citationEvidence.applyDraft with a delegated editor is refused at the admin floor", draftAsEditor?.message === "Admin access required", draftAsEditor);
    const draftAsScript = await data.mutation(api.citationEvidence.applyDraft, { apiKey: TOKENS.citationEvidenceWrite, slug, article: reviewedArticle, evidence: [], approvedWriteMode: "preserve" });
    expect("reviewed-gate", "citationEvidence.applyDraft (bare-token script path) patches only citable sections and ignores editorial_review", draftAsScript.article.updated === true && (await reviewStatus()) === "needed", draftAsScript.article.outcome);

    const saveAsEditor = await refusal(() => data.mutation(api.substanceIndex.saveSubstance, { ...editorCall(TOKENS.editorArticleWrite), article: reviewedArticle }));
    expect("reviewed-gate", "saveSubstance with a delegated editor is refused at the admin floor", saveAsEditor?.message === "Admin access required", saveAsEditor);
    await unchanged("agent-reachable mutations");
    expect("reviewed-gate", "no receipt or outbox generation was minted by the refused attempts", canon((await guardSnapshot()).operations) === canon(gateBase.operations));

    // Positive control: the admin tick is the one path that sets Reviewed and stamps the reviewer.
    const completed = await data.mutation(api.substanceIndex.setEditorialReview, { apiKey: TOKENS.editorArticleWrite, actorEmail: adminEmail, slug, status: "completed" });
    const reviewedRows = await selectDocuments(pool, "reviewedArticles", { where: '"article_id" = $1', params: [articleDocumentId] });
    expect("reviewed-gate", "admin actor sets completed with reviewer stamp and the derived reviewedArticles row appears",
      completed.editorial_review.status === "completed" && completed.editorial_review.reviewed_by === adminEmail && reviewedRows.length === 1 && reviewedRows[0].reviewer_email === adminEmail, { review: completed.editorial_review, derived: reviewedRows.length });
    const reopened = await data.mutation(api.substanceIndex.setEditorialReview, { apiKey: TOKENS.editorArticleWrite, actorEmail: adminEmail, slug, status: "needed" });
    expect("reviewed-gate", "reopening drops the derived row again", reopened.editorial_review.status === "needed" && (await selectDocuments(pool, "reviewedArticles", { where: '"article_id" = $1', params: [articleDocumentId] })).length === 0);
  } finally {
    if (!keep) {
      await withTransaction(pool, async (client) => {
        const purge = async (table: Parameters<typeof selectDocuments>[1], where: string, params: unknown[]) => {
          for (const row of await selectDocuments(client, table, { where, params })) await deleteDocument(client, table, row._id as string);
        };
        await purge("citationEvidence", '"slug" = $1', [slug]);
        await purge("generatedPublicationOperations", '"slug" = $1', [slug]);
        await purge("publicCachePublications", '"key" = $1', [articlePublicationKey(slug)]);
        await purge("articleRevisions", '"slug" = $1', [slug]);
        await purge("articleHistory", '"slug" = $1', [slug]);
        await purge("changelog", '"articles"::text LIKE $1', [`%${slug}%`]);
        await purge("articleDrafts", '"slug" = $1', [slug]);
        await purge("articleProposalTargets", '"slug" = $1', [slug]);
        await purge("articleDraftReceipts", '"ownerEmail" = ANY($1)', [[adminEmail, editorEmail]]);
        if (articleDocumentId) await purge("reviewedArticles", '"article_id" = $1', [articleDocumentId]);
        await purge("substanceIndex", '"slug" = $1', [slug]);
        await purge("memberships", '"email" = ANY($1)', [[adminEmail, editorEmail]]);
      });
    }
    const passed = checks.filter((check) => check.pass).length;
    const summary = {
      target: target.replace(/\/\/[^@]*@/, "//<redacted>@"),
      prefix,
      slug,
      fingerprint: FINGERPRINT,
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
    await data.end();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
