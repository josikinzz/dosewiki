/**
 * Rehearsal: the editor article lifecycle on Postgres, driven through
 * `PostgresClient` with the same `api.*` calls the app makes.
 *
 *   bun scripts/postgres/rehearse-article-lifecycle.ts [--target <url>] [--allow-remote] [--keep]
 *
 * Creates two scratch articles (`t06-<random>-a`, `t06-<random>-b`) and one
 * scratch editor membership, runs every scenario, and deletes every row it or
 * the handlers created unless `--keep`. Nothing outside the scratch prefix is
 * written, except the global `{"kind":"changelog"}` outbox row, which every
 * public changelog insert bumps by design. The report lands in
 * runs/postgres-import/<timestamp>-article-lifecycle/report.json.
 *
 * Scenarios (letters are the ticket's acceptance criteria):
 *   a. lifecycle: saveDraft, discardDraft, publish, submit (+ approve), restore
 *      each succeed and the expected rows appear in articleDrafts,
 *      articleDraftReceipts, articleRevisions, substanceIndex, changelog,
 *      articleHistory, and the publicCachePublications outbox. Replay of a
 *      publish returns the committed revision without writing; the same
 *      change ID with different content is refused.
 *   b. proposal rollback: a two-article proposal whose second target fails
 *      mid-apply (ARTICLE_EVIDENCE_LIMIT) leaves both articles, all receipt
 *      and revision counts, and the proposal row unchanged; a proposal whose
 *      target drifted (stale baseHash) is parked as changes_requested with no
 *      article writes; the repaired proposal then applies both targets.
 *   c. restore: an optional field absent before the edit is absent after the
 *      restore (not null), and the revision's before-image equals the
 *      pre-edit runtime document byte-for-byte in canonical JSON.
 *   d. atomicity: a failure injected after the changelog insert (a trigger
 *      scoped to one changeId raises at the receipt insert, the last write)
 *      leaves zero new rows in substanceIndex, articleRevisions, changelog,
 *      articleHistory, receipts, and the outbox; a stale-hash publish is
 *      refused with the same zero-row result.
 *   e. concurrency: two publishes of one article from the same baseHash;
 *      exactly one commits and the other fails with ARTICLE_CONFLICT.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { FunctionArgs } from "../../lib/postgres/runtime/api";
import { PostgresError } from "../../lib/postgres/runtime/values";
import { Pool } from "pg";
import { api } from "../../lib/postgres/runtime/api";
import { PostgresClient } from "../../lib/postgres/runtime/client";
import { documentHash } from "../../lib/postgres/documentCodec";
import { insertDocument, selectDocuments, withTransaction, type SqlClient } from "../../lib/postgres/documentStore";
import type { TableName } from "../../lib/postgres/schema.generated";
import { projectEditorArticle } from "../../src/data/projections/substanceReadProjections";
import { minimalArticle } from "../../src/test/fixtures/articles";
import { guardTarget, resolveTarget } from "./targetGuard";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

type Check = { scenario: string; check: string; pass: boolean; detail?: unknown };
/** The article shape `articleLifecycle.write` accepts: what the editor sends and what `get` returns. */
type Article = NonNullable<FunctionArgs<typeof api.articleLifecycle.write>["article"]>;

const checks: Check[] = [];
const observedCodes = new Set<string>();

function expect(scenario: string, check: string, pass: boolean, detail?: unknown): void {
  checks.push({ scenario, check, pass, ...(detail === undefined ? {} : { detail }) });
  console.log(`${pass ? "ok  " : "FAIL"} ${scenario}: ${check}${detail === undefined || pass ? "" : ` ${JSON.stringify(detail)}`}`);
}

/** Sorted keys at every depth; `null` survives and `undefined` drops, so absent and null differ. */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().filter((key) => record[key] !== undefined).map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function codeOf(error: unknown): string {
  const code = error instanceof PostgresError && error.data && typeof error.data === "object" && "code" in error.data ? String(error.data.code) : "";
  const label = code || (error instanceof Error ? `Error:${error.message}` : String(error));
  observedCodes.add(label.replace(/\b[a-z0-9]{32}\b/, "<id>"));
  return label;
}

async function failure(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
    return "no error";
  } catch (error) {
    return codeOf(error);
  }
}

async function count(client: SqlClient, table: TableName, where: string, params: unknown[]): Promise<number> {
  const result = await client.query(`SELECT count(*)::int AS n FROM "${table}" WHERE ${where}`, params);
  return result.rows[0].n as number;
}

async function purge(client: SqlClient, table: TableName, where: string, params: unknown[]): Promise<number> {
  const ids = (await client.query(`SELECT "_id" FROM "${table}" WHERE ${where}`, params)).rows.map((row) => row._id as string);
  if (ids.length === 0) return 0;
  await client.query(`DELETE FROM "${table}" WHERE "_id" = ANY($1)`, [ids]);
  await client.query('DELETE FROM "documentIds" WHERE "_id" = ANY($1)', [ids]);
  return ids.length;
}

async function cleanup(pool: Pool, prefix: string): Promise<Record<string, number>> {
  const like = `${prefix}%`;
  const removed: Record<string, number> = {};
  await withTransaction(pool, async (client) => {
    const plan: Array<[TableName, string, unknown[]]> = [
      ["citationEvidence", '"slug" LIKE $1', [like]],
      ["articleProposalTargets", '"slug" LIKE $1', [like]],
      ["changeProposals", '"proposedBy" LIKE $1 OR "targets"::text LIKE $2', [like, `%${prefix}%`]],
      ["articleHistory", '"slug" LIKE $1', [like]],
      ["changelog", '"articles"::text LIKE $1', [`%${prefix}%`]],
      ["articleRevisions", '"slug" LIKE $1', [like]],
      ["articleDraftReceipts", '"changeId" LIKE $1', [like]],
      ["articleDrafts", '"slug" LIKE $1', [like]],
      ["publicCachePublications", '"key" LIKE $1', [`%${prefix}%`]],
      ["reviewedArticles", '"slug" LIKE $1', [like]],
      ["substanceIndex", '"slug" LIKE $1', [like]],
      ["memberships", '"email" LIKE $1', [like]],
    ];
    for (const [table, where, params] of plan) removed[table] = await purge(client, table, where, params);
  });
  return removed;
}

/** Row counts and content hashes that a rejected or rolled-back write must leave untouched. */
async function snapshot(pool: Pool, slugs: string[], prefix: string) {
  const articles: Record<string, string | null> = {};
  for (const slug of slugs) {
    const [row] = await selectDocuments(pool, "substanceIndex", { where: '"slug" = $1', params: [slug] });
    articles[slug] = row ? documentHash(row) : null;
  }
  const like = `${prefix}%`;
  const outbox = await selectDocuments(pool, "publicCachePublications", { where: '"key" LIKE $1', params: [`%${prefix}%`], orderBy: '"key"' });
  return {
    articles,
    revisions: await count(pool, "articleRevisions", '"slug" LIKE $1', [like]),
    changelog: await count(pool, "changelog", '"articles"::text LIKE $1', [`%${prefix}%`]),
    history: await count(pool, "articleHistory", '"slug" LIKE $1', [like]),
    receipts: await count(pool, "articleDraftReceipts", '"changeId" LIKE $1', [like]),
    drafts: await count(pool, "articleDrafts", '"slug" LIKE $1', [like]),
    outbox: outbox.map((row) => ({ key: row.key, generation: row.generation, revision: row.revision, pending: row.pending })),
  };
}

function seedArticle(slug: string, id: number): Article {
  const seed: Record<string, unknown> = { ...structuredClone(minimalArticle), id, slug, title: `Rehearsal ${slug}`, summary: "seed summary" };
  // The absent-field criterion (c): this optional section must not exist before the first edit.
  delete seed.history_culture;
  // Not part of `substanceArticleLightValidator`; the editor never sends it, so the seed does not carry it.
  delete seed.section_gaps;
  // The fixture satisfies the light validator once the storage-only keys above are dropped.
  return seed as Article;
}

function baselineFor(article: Article) {
  const { _id, _creationTime, ...document } = projectEditorArticle(article as never) as Record<string, unknown>;
  return document;
}

async function main() {
  const argv = process.argv.slice(2);
  const target = resolveTarget(argv);
  guardTarget(target, argv.includes("--allow-remote"));
  const keep = argv.includes("--keep");
  const apiKey = process.env.DATA_ADMIN_TOKEN_EDITOR_ARTICLE_WRITE || process.env.DATA_ADMIN_KEY;
  if (!apiKey) throw new Error("DATA_ADMIN_TOKEN_EDITOR_ARTICLE_WRITE or DATA_ADMIN_KEY must be set");

  const pool = new Pool({ connectionString: target, max: 4 });
  const client = PostgresClient.fromUrl(target, 6);
  const random = Math.random().toString(36).slice(2, 10);
  const prefix = `t06-${random}`;
  const triggerName = `t06_${random}_inject`;
  const slugA = `${prefix}-a`;
  const slugB = `${prefix}-b`;
  const editorEmail = `${prefix}-editor@rehearsal.invalid`;
  const proposerEmail = `${prefix}-admin@rehearsal.invalid`;
  const admin = { apiKey };
  const editor = { apiKey, actorEmail: editorEmail };
  const proposer = { apiKey, actorEmail: proposerEmail };
  const idBase = 900_000_000 + Math.floor(Math.random() * 90_000_000);
  const runDirectory = path.join(ROOT, "runs", "postgres-import", `${new Date().toISOString().replace(/[:.]/g, "-")}-article-lifecycle`);
  const started = performance.now();
  let changeCounter = 0;
  const changeId = () => `${prefix}-${String(++changeCounter).padStart(3, "0")}`;
  let removed: Record<string, number> = {};

  try {
    await withTransaction(pool, async (tx) => {
      await insertDocument(tx, "substanceIndex", seedArticle(slugA, idBase));
      await insertDocument(tx, "substanceIndex", seedArticle(slugB, idBase + 1));
      const now = new Date().toISOString();
      await insertDocument(tx, "memberships", { email: editorEmail, role: "editor", createdAt: now, updatedAt: now });
      await insertDocument(tx, "memberships", { email: proposerEmail, role: "admin", createdAt: now, updatedAt: now });
    });

    // ---------------------------------------------------------------- a. lifecycle
    const initial = await client.query(api.articleLifecycle.get, { ...admin, slug: slugA });
    const article0 = initial.article as Article;
    const article0Json = canonicalJson(article0);
    expect("a", "get serves the scratch article with baseHash and no history", initial.baseHash.length === 64 && initial.history.length === 0 && initial.draftVersion === 0);
    expect("c", "optional field history_culture is absent before the edit", !("history_culture" in article0));

    const draft1 = { ...article0, summary: "draft one" };
    const cDraft1 = changeId();
    const saved = await client.mutation(api.articleLifecycle.write, { ...admin, action: "saveDraft", slug: slugA, baseHash: initial.baseHash, changeId: cDraft1, article: draft1, draftVersion: 0 });
    const [draftRow1] = await selectDocuments(pool, "articleDrafts", { where: '"slug" = $1', params: [slugA] });
    expect("a", "saveDraft returns draftVersion 1 and stores the draft article", saved.draftVersion === 1 && draftRow1?.version === 1 && (draftRow1.article as Article)?.summary === "draft one", saved);
    const [receipt1] = await selectDocuments(pool, "articleDraftReceipts", { where: '"changeId" = $1', params: [cDraft1] });
    expect("a", "saveDraft writes a receipt carrying the full result", receipt1?.ownerEmail === "system@dosewiki.internal" && canonicalJson(receipt1.result) === canonicalJson(saved), receipt1?.result);
    const afterDraft = await client.query(api.articleLifecycle.get, { ...admin, slug: slugA });
    expect("a", "saveDraft leaves the published article and baseHash untouched", afterDraft.baseHash === initial.baseHash && canonicalJson(afterDraft.article) === article0Json && afterDraft.draft?.version === 1);

    const discarded = await client.mutation(api.articleLifecycle.write, { ...admin, action: "discardDraft", slug: slugA, baseHash: initial.baseHash, changeId: changeId(), draftVersion: 1 });
    const [draftRow2] = await selectDocuments(pool, "articleDrafts", { where: '"slug" = $1', params: [slugA] });
    expect("a", "discardDraft bumps the version and clears the draft article", discarded.draftVersion === 2 && draftRow2?.version === 2 && !("article" in draftRow2), draftRow2 && Object.keys(draftRow2));
    expect("a", "discardDraft with a stale draftVersion is refused", await failure(() => client.mutation(api.articleLifecycle.write, { ...admin, action: "discardDraft", slug: slugA, baseHash: initial.baseHash, changeId: changeId(), draftVersion: 1 })) === "ARTICLE_CONFLICT");

    const edited = { ...article0, summary: "published summary", history_culture: { content: "History added by the rehearsal.", sections: [] } };
    await client.mutation(api.articleLifecycle.write, { ...admin, action: "saveDraft", slug: slugA, baseHash: initial.baseHash, changeId: changeId(), article: edited, draftVersion: 2 });
    const before = await snapshot(pool, [slugA], prefix);
    const cPublish = changeId();
    const publishArgs = { ...admin, action: "publish" as const, slug: slugA, baseHash: initial.baseHash, changeId: cPublish, article: edited, summary: "Rehearsal publish", draftVersion: 3 };
    const published = await client.mutation(api.articleLifecycle.write, publishArgs);
    const after = await snapshot(pool, [slugA], prefix);
    const afterPublish = await client.query(api.articleLifecycle.get, { ...admin, slug: slugA });
    const revisionId = String(published.revisionId);
    expect("a", "publish returns the revision, the new baseHash, and draftVersion 4", typeof published.revisionId === "string" && published.baseHash === afterPublish.baseHash && published.draftVersion === 4, published);
    expect("a", "substanceIndex carries the edit", afterPublish.article.summary === "published summary" && canonicalJson(afterPublish.article.history_culture) === canonicalJson({ content: "History added by the rehearsal.", sections: [] }) && after.articles[slugA] !== before.articles[slugA]);
    const [revision1] = await selectDocuments(pool, "articleRevisions", { where: '"slug" = $1', params: [slugA] });
    expect("a", "articleRevisions gained one row with the actor, summary, and hashes", after.revisions === before.revisions + 1 && revision1?._id === revisionId && revision1.actorEmail === "system@dosewiki.internal" && revision1.actorRole === "admin" && revision1.baseHash === initial.baseHash && revision1.resultHash === published.baseHash && revision1.summary === "Rehearsal publish", revision1 && { baseHash: revision1.baseHash, resultHash: revision1.resultHash });
    expect("c", "revision before-image equals the pre-edit runtime document byte-for-byte", canonicalJson(revision1?.before) === article0Json);
    expect("c", "revision after-image equals the published runtime document", canonicalJson(revision1?.after) === canonicalJson(afterPublish.article));
    const [changelogRow] = await selectDocuments(pool, "changelog", { where: '"entryId" = $1', params: [`article-${revisionId}`] });
    expect("a", "changelog gained the article entry naming the changed sections", after.changelog === before.changelog + 1 && changelogRow?.message === "Rehearsal publish" && String(changelogRow.markdown).includes("summary") && String(changelogRow.markdown).includes("history_culture") && (changelogRow.articles as Array<{ slug: string }>)[0]?.slug === slugA, changelogRow?.markdown);
    const [historyRow] = await selectDocuments(pool, "articleHistory", { where: '"slug" = $1', params: [slugA] });
    expect("a", "articleHistory derived row links the slug to the changelog entry", after.history === before.history + 1 && historyRow?.changelog_id === changelogRow?._id && historyRow?.createdAt === changelogRow?.createdAt, historyRow);
    const articleOutbox = after.outbox.find((row) => row.key === JSON.stringify({ kind: "article", slug: slugA }));
    const [changelogOutbox] = await selectDocuments(pool, "publicCachePublications", { where: '"key" = $1', params: [JSON.stringify({ kind: "changelog" })] });
    expect("a", "outbox holds a pending article target with the public revision", articleOutbox?.pending === true && articleOutbox.generation === 1 && typeof articleOutbox.revision === "string", articleOutbox);
    expect("a", "outbox holds a pending changelog target", changelogOutbox?.pending === true && (changelogOutbox.generation as number) >= 1, changelogOutbox && { generation: changelogOutbox.generation, pending: changelogOutbox.pending });
    const [publishReceipt] = await selectDocuments(pool, "articleDraftReceipts", { where: '"changeId" = $1', params: [cPublish] });
    expect("a", "publish receipt stores only the revision id and draft version", after.receipts === before.receipts + 1 && canonicalJson(publishReceipt?.result) === canonicalJson({ revisionId, draftVersion: 4 }), publishReceipt?.result);
    const [draftRow3] = await selectDocuments(pool, "articleDrafts", { where: '"slug" = $1', params: [slugA] });
    expect("a", "publish consumed the matching draft (article cleared, version 4)", draftRow3?.version === 4 && !("article" in draftRow3) && afterPublish.draft === null, draftRow3 && Object.keys(draftRow3));

    const replayed = await client.mutation(api.articleLifecycle.write, publishArgs);
    const afterReplay = await snapshot(pool, [slugA], prefix);
    expect("a", "replaying the publish returns the committed revision without writing", replayed.revisionId === published.revisionId && replayed.baseHash === published.baseHash && canonicalJson(afterReplay) === canonicalJson(after), replayed);
    expect("a", "same changeId with different content is refused", await failure(() => client.mutation(api.articleLifecycle.write, { ...publishArgs, summary: "different" })) === "ARTICLE_CHANGE_REUSED");
    expect("a", "editor role cannot publish", await failure(() => client.mutation(api.articleLifecycle.write, { ...editor, action: "publish", slug: slugA, baseHash: afterPublish.baseHash, changeId: changeId(), article: { ...afterPublish.article, summary: "editor publish" }, summary: "x" })) === "Error:Admin access required");

    // ---------------------------------------------------------------- c. restore
    const beforeRestore = await snapshot(pool, [slugA], prefix);
    const restored = await client.mutation(api.articleLifecycle.write, { ...admin, action: "restore", slug: slugA, baseHash: afterPublish.baseHash, changeId: changeId(), revisionId: published.revisionId, summary: "Rehearsal restore" });
    const afterRestore = await snapshot(pool, [slugA], prefix);
    const restoredGet = await client.query(api.articleLifecycle.get, { ...admin, slug: slugA });
    const restoredArticle = restoredGet.article as Article;
    expect("c", "restore returns a new revision and the article equals the pre-edit document byte-for-byte", restored.revisionId !== published.revisionId && canonicalJson(restoredArticle) === article0Json && restoredGet.baseHash === restored.baseHash);
    expect("c", "optional field absent before the edit is absent after restore, not null", !("history_culture" in restoredArticle) && restoredArticle.history_culture !== null, { present: "history_culture" in restoredArticle, value: restoredArticle.history_culture });
    const [restoredColumn] = (await pool.query('SELECT "history_culture" IS NULL AS absent, "summary" FROM "substanceIndex" WHERE "slug" = $1', [slugA])).rows;
    expect("c", "the stored column is SQL NULL, and summary rolled back", restoredColumn?.absent === true && restoredColumn.summary === "seed summary", restoredColumn);
    const [revision2] = await selectDocuments(pool, "articleRevisions", { where: '"_id" = $1', params: [restored.revisionId] });
    expect("c", "restore revision links restoredFrom and its before-image equals the published document", revision2?.restoredFrom === published.revisionId && canonicalJson(revision2?.before) === canonicalJson(afterPublish.article) && canonicalJson(revision2?.after) === article0Json);
    expect("a", "restore added one revision, one changelog entry, one history row, one receipt", afterRestore.revisions === beforeRestore.revisions + 1 && afterRestore.changelog === beforeRestore.changelog + 1 && afterRestore.history === beforeRestore.history + 1 && afterRestore.receipts === beforeRestore.receipts + 1, { beforeRestore, afterRestore });
    expect("c", "restoring a revision that is no longer the latest is refused", await failure(() => client.mutation(api.articleLifecycle.write, { ...admin, action: "restore", slug: slugA, baseHash: restoredGet.baseHash, changeId: changeId(), revisionId: published.revisionId, summary: "stale restore" })) === "ARTICLE_CONFLICT");

    // ---------------------------------------------------------------- a. submit (+ approve)
    const submitted = await client.mutation(api.articleLifecycle.write, { ...editor, action: "submit", slug: slugA, baseHash: restoredGet.baseHash, changeId: changeId(), article: { ...restoredArticle, summary: "submitted summary" }, summary: "Rehearsal submit" });
    const proposalId = String(submitted.proposalId);
    const [proposalRow] = await selectDocuments(pool, "changeProposals", { where: '"_id" = $1', params: [proposalId] });
    const [targetRow] = await selectDocuments(pool, "articleProposalTargets", { where: '"proposalId" = $1', params: [proposalId] });
    const afterSubmit = await snapshot(pool, [slugA], prefix);
    expect("a", "submit creates a submitted proposal by the editor with one article target", submitted.status === "submitted" && proposalRow?.status === "submitted" && proposalRow.proposedBy === editorEmail && (proposalRow.targets as Array<{ key: string }>)[0]?.key === slugA && targetRow?.slug === slugA && targetRow.ownerEmail === editorEmail, { status: proposalRow?.status, proposedBy: proposalRow?.proposedBy });
    expect("a", "submit writes no article, revision, or changelog rows", canonicalJson(afterSubmit.articles) === canonicalJson(afterRestore.articles) && afterSubmit.revisions === afterRestore.revisions && afterSubmit.changelog === afterRestore.changelog && afterSubmit.receipts === afterRestore.receipts + 1);
    expect("a", "an editor cannot approve a proposal", await failure(() => client.mutation(api.changeProposalReview.approveAndApply, { ...editor, proposalId: submitted.proposalId })) === "Error:Admin access required");
    const approved = await client.mutation(api.changeProposalReview.approveAndApply, { ...admin, proposalId: submitted.proposalId });
    const afterApprove = await snapshot(pool, [slugA], prefix);
    const approvedGet = await client.query(api.articleLifecycle.get, { ...admin, slug: slugA });
    const [appliedRow] = await selectDocuments(pool, "changeProposals", { where: '"_id" = $1', params: [proposalId] });
    const [proposalEntry] = await selectDocuments(pool, "changelog", { where: '"entryId" = $1', params: [`proposal-${proposalId}`] });
    expect("a", "approveAndApply applies the proposal: article, revision, changelog entry, history row", approved.status === "applied" && approvedGet.article.summary === "submitted summary" && afterApprove.revisions === afterSubmit.revisions + 1 && afterApprove.changelog === afterSubmit.changelog + 1 && afterApprove.history === afterSubmit.history + 1 && appliedRow?.status === "applied" && proposalEntry?.message === "Rehearsal submit", { status: approved.status, revalidatePaths: (approved as { revalidatePaths?: string[] }).revalidatePaths });
    expect("a", "the proposal's revision carries the proposal change id and adds no article-keyed changelog row", (await count(pool, "articleRevisions", '"slug" = $1 AND "changeId" = $2', [slugA, `proposal-${proposalId}:${slugA}`])) === 1 && (await count(pool, "changelog", '"entryId" LIKE $1 AND "articles"::text LIKE $2', ["article-%", `%${prefix}%`])) === 2);
    expect("a", "re-approving an applied proposal replays without writing", (await client.mutation(api.changeProposalReview.approveAndApply, { ...admin, proposalId: submitted.proposalId })).status === "applied" && canonicalJson(await snapshot(pool, [slugA], prefix)) === canonicalJson(afterApprove));

    // ---------------------------------------------------------------- b. proposal rollback
    const getA = await client.query(api.articleLifecycle.get, { ...admin, slug: slugA });
    const getB = await client.query(api.articleLifecycle.get, { ...admin, slug: slugB });
    const proposalPayload = { articles: [{ ...(getA.article as Article), summary: "proposal A" }, { ...(getB.article as Article), summary: "proposal B" }] };
    const baselines = [
      { kind: "article" as const, key: slugA, document: baselineFor(getA.article as Article) },
      { kind: "article" as const, key: slugB, document: baselineFor(getB.article as Article) },
    ];
    const twoTarget = await client.mutation(api.changeProposals.submit, { ...proposer, payload: proposalPayload, summary: "Rehearsal two targets", baselines });
    const twoTargetId = String(twoTarget.proposalId);
    expect("b", "two-target proposal submitted by the scratch admin", (await count(pool, "articleProposalTargets", '"proposalId" = $1', [twoTargetId])) === 2);
    expect("b", "the proposer cannot approve their own proposal", await failure(() => client.mutation(api.changeProposalReview.approveAndApply, { ...proposer, proposalId: twoTarget.proposalId })) === "PROPOSAL_SELF_APPROVAL");
    // Make the second target fail mid-apply: more evidence rows than one atomic edit may decertify.
    await withTransaction(pool, async (tx) => {
      const values: string[] = [];
      const params: unknown[] = [];
      const now = new Date().toISOString();
      for (let index = 0; index < 1001; index += 1) {
        const id = `t06ev${random}${String(index).padStart(6, "0")}`.padEnd(32, "0");
        params.push(id, Date.now(), slugB, `claim-${index}`, now);
        const base = params.length - 5;
        values.push(`($${base + 1}, $${base + 2}, $${base + 3}, 'summary', $${base + 4}, '[]'::jsonb, 'supported', 'non_blocking', $${base + 5}, $${base + 5})`);
      }
      await tx.query(`INSERT INTO "citationEvidence" ("_id", "_creationTime", "slug", "section", "claimKey", "referenceIds", "status", "severity", "createdAt", "updatedAt") VALUES ${values.join(", ")}`, params);
      await tx.query('INSERT INTO "documentIds" ("_id", "table") SELECT "_id", \'citationEvidence\' FROM "citationEvidence" WHERE "slug" = $1', [slugB]);
    });
    const beforeRollback = await snapshot(pool, [slugA, slugB], prefix);
    const evidenceBefore = await count(pool, "citationEvidence", '"slug" = $1 AND "status" = $2', [slugB, "supported"]);
    const rollbackCode = await failure(() => client.mutation(api.changeProposalReview.approveAndApply, { ...admin, proposalId: twoTarget.proposalId }));
    const afterRollback = await snapshot(pool, [slugA, slugB], prefix);
    const [parkedRow] = await selectDocuments(pool, "changeProposals", { where: '"_id" = $1', params: [twoTargetId] });
    expect("b", "second target fails mid-apply with ARTICLE_EVIDENCE_LIMIT", rollbackCode === "ARTICLE_EVIDENCE_LIMIT", rollbackCode);
    expect("b", "both articles' content hashes are unchanged (first target rolled back too)", afterRollback.articles[slugA] === beforeRollback.articles[slugA] && afterRollback.articles[slugB] === beforeRollback.articles[slugB], { before: beforeRollback.articles, after: afterRollback.articles });
    expect("b", "receipt, revision, changelog, history, and outbox counts are unchanged", canonicalJson(afterRollback) === canonicalJson(beforeRollback), { beforeRollback, afterRollback });
    expect("b", "proposal row stays submitted and evidence rows are untouched", parkedRow?.status === "submitted" && !("appliedAt" in parkedRow) && (await count(pool, "citationEvidence", '"slug" = $1 AND "status" = $2', [slugB, "supported"])) === evidenceBefore, parkedRow?.status);
    expect("b", "A's runtime document is unchanged after the rolled-back apply", canonicalJson((await client.query(api.articleLifecycle.get, { ...admin, slug: slugA })).article) === canonicalJson(getA.article));

    // Stale baseHash: drift under a proposal is parked, not applied.
    const staleProposal = await client.mutation(api.changeProposals.submit, { ...proposer, payload: { articles: [{ ...(getA.article as Article), summary: "stale proposal A" }] }, summary: "Rehearsal stale", baselines: [baselines[0]] });
    await client.mutation(api.articleLifecycle.write, { ...admin, action: "publish", slug: slugA, baseHash: getA.baseHash, changeId: changeId(), article: { ...(getA.article as Article), summary: "drifted under the proposal" }, summary: "Rehearsal drift" });
    const beforeStale = await snapshot(pool, [slugA, slugB], prefix);
    const staleResult = await client.mutation(api.changeProposalReview.approveAndApply, { ...admin, proposalId: staleProposal.proposalId });
    const afterStale = await snapshot(pool, [slugA, slugB], prefix);
    const [staleRow] = await selectDocuments(pool, "changeProposals", { where: '"_id" = $1', params: [String(staleProposal.proposalId)] });
    observedCodes.add(`approveAndApply:${staleResult.status}`);
    expect("b", "stale baseHash proposal is parked as changes_requested with no article writes", staleResult.status === "changes_requested" && staleRow?.status === "changes_requested" && typeof staleRow.conflictReason === "string" && canonicalJson(afterStale) === canonicalJson(beforeStale), { status: staleResult.status, reason: staleRow?.conflictReason });

    // Repair and apply the two-target proposal: it must now also be stale (A drifted), so resubmit it.
    await withTransaction(pool, (tx) => purge(tx, "citationEvidence", '"slug" = $1', [slugB]));
    const getA2 = await client.query(api.articleLifecycle.get, { ...admin, slug: slugA });
    const repaired = await client.mutation(api.changeProposals.submit, { ...proposer, payload: { articles: [{ ...(getA2.article as Article), summary: "proposal A" }, proposalPayload.articles[1]] }, summary: "Rehearsal two targets", baselines: [{ kind: "article", key: slugA, document: baselineFor(getA2.article as Article) }, baselines[1]] });
    const beforeApply = await snapshot(pool, [slugA, slugB], prefix);
    const twoApplied = await client.mutation(api.changeProposalReview.approveAndApply, { ...admin, proposalId: repaired.proposalId });
    const afterApply = await snapshot(pool, [slugA, slugB], prefix);
    const appliedA = await client.query(api.articleLifecycle.get, { ...admin, slug: slugA });
    const appliedB = await client.query(api.articleLifecycle.get, { ...admin, slug: slugB });
    expect("b", "the repaired two-target proposal applies both articles atomically", twoApplied.status === "applied" && appliedA.article.summary === "proposal A" && appliedB.article.summary === "proposal B" && afterApply.revisions === beforeApply.revisions + 2 && afterApply.changelog === beforeApply.changelog + 1 && afterApply.history === beforeApply.history + 2, { twoApplied, beforeApply, afterApply });
    expect("b", "the two-target changelog entry names both articles", ((await selectDocuments(pool, "changelog", { where: '"entryId" = $1', params: [`proposal-${String(repaired.proposalId)}`] }))[0]?.articles as Array<{ slug: string }>)?.map((row) => row.slug).sort().join(",") === [slugA, slugB].sort().join(","));

    // ---------------------------------------------------------------- d. atomicity
    const getD = await client.query(api.articleLifecycle.get, { ...admin, slug: slugA });
    const stale = await snapshot(pool, [slugA, slugB], prefix);
    const staleCode = await failure(() => client.mutation(api.articleLifecycle.write, { ...admin, action: "publish", slug: slugA, baseHash: initial.baseHash, changeId: changeId(), article: { ...(getD.article as Article), summary: "stale publish" }, summary: "stale" }));
    expect("d", "stale-hash publish is refused with ARTICLE_CONFLICT", staleCode === "ARTICLE_CONFLICT", staleCode);
    expect("d", "rejected publish leaves zero new rows in substanceIndex, articleRevisions, changelog (and history, receipts, outbox)", canonicalJson(await snapshot(pool, [slugA, slugB], prefix)) === canonicalJson(stale));

    // Injected failure after the changelog insert: the receipt insert is the handler's last write, after
    // the draft patch. A trigger scoped to this one changeId raises there, so content, revision, changelog,
    // history, and the draft patch are all written before the transaction fails.
    const injectedDraft = await client.mutation(api.articleLifecycle.write, { ...admin, action: "saveDraft", slug: slugA, baseHash: getD.baseHash, changeId: changeId(), article: { ...(getD.article as Article), summary: "injected" }, draftVersion: getD.draftVersion });
    const injectedChangeId = changeId();
    const beforeInjected = await snapshot(pool, [slugA, slugB], prefix);
    const injectedArgs = { ...admin, action: "publish" as const, slug: slugA, baseHash: getD.baseHash, changeId: injectedChangeId, article: { ...(getD.article as Article), summary: "injected" }, summary: "Rehearsal injected", draftVersion: injectedDraft.draftVersion };
    let injectedCode = "not run";
    try {
      await pool.query(`CREATE FUNCTION ${triggerName}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'rehearsal injected failure after changelog insert'; END $$`);
      await pool.query(`CREATE TRIGGER ${triggerName} BEFORE INSERT ON "articleDraftReceipts" FOR EACH ROW WHEN (NEW."changeId" = '${injectedChangeId}') EXECUTE FUNCTION ${triggerName}()`);
      injectedCode = await failure(() => client.mutation(api.articleLifecycle.write, injectedArgs));
    } finally {
      await pool.query(`DROP TRIGGER IF EXISTS ${triggerName} ON "articleDraftReceipts"`);
      await pool.query(`DROP FUNCTION IF EXISTS ${triggerName}()`);
    }
    const afterInjected = await snapshot(pool, [slugA, slugB], prefix);
    expect("d", "the injected failure fires at the receipt insert that follows the changelog insert", injectedCode === "Error:rehearsal injected failure after changelog insert", injectedCode);
    expect("d", "content, revision, changelog, history, receipt, and outbox rows all rolled back together", canonicalJson(afterInjected) === canonicalJson(beforeInjected), { beforeInjected, afterInjected });
    expect("d", "the article's runtime document is unchanged", canonicalJson((await client.query(api.articleLifecycle.get, { ...admin, slug: slugA })).article) === canonicalJson(getD.article));
    const retried = await client.mutation(api.articleLifecycle.write, injectedArgs);
    const afterRetry = await snapshot(pool, [slugA, slugB], prefix);
    expect("d", "the same request commits once the fault is removed, in one transaction", typeof retried.revisionId === "string" && afterRetry.revisions === beforeInjected.revisions + 1 && afterRetry.changelog === beforeInjected.changelog + 1 && afterRetry.history === beforeInjected.history + 1 && afterRetry.receipts === beforeInjected.receipts + 1 && afterRetry.articles[slugA] !== beforeInjected.articles[slugA]);

    // ---------------------------------------------------------------- e. concurrency
    const getE = await client.query(api.articleLifecycle.get, { ...admin, slug: slugA });
    const beforeRace = await snapshot(pool, [slugA, slugB], prefix);
    const racers = ["left", "right"].map((name) => client.mutation(api.articleLifecycle.write, { ...admin, action: "publish", slug: slugA, baseHash: getE.baseHash, changeId: changeId(), article: { ...(getE.article as Article), summary: `race ${name}` }, summary: `Rehearsal race ${name}` }));
    const outcomes = await Promise.allSettled(racers);
    const afterRace = await snapshot(pool, [slugA, slugB], prefix);
    const winners = outcomes.filter((outcome) => outcome.status === "fulfilled");
    const losers = outcomes.filter((outcome): outcome is PromiseRejectedResult => outcome.status === "rejected").map((outcome) => codeOf(outcome.reason));
    const raceGet = await client.query(api.articleLifecycle.get, { ...admin, slug: slugA });
    expect("e", "exactly one concurrent publish commits", winners.length === 1, outcomes.map((outcome) => outcome.status));
    expect("e", "the other fails with ARTICLE_CONFLICT", losers.length === 1 && losers[0] === "ARTICLE_CONFLICT", losers);
    expect("e", "exactly one revision, changelog entry, history row, and receipt were added", afterRace.revisions === beforeRace.revisions + 1 && afterRace.changelog === beforeRace.changelog + 1 && afterRace.history === beforeRace.history + 1 && afterRace.receipts === beforeRace.receipts + 1, { beforeRace, afterRace });
    expect("e", "the winner's content is what is published", winners.length === 1 && raceGet.article.summary === (winners[0] as PromiseFulfilledResult<{ article: Article }>).value.article.summary && raceGet.baseHash === (winners[0] as PromiseFulfilledResult<{ baseHash: string }>).value.baseHash);
  } finally {
    if (!keep) removed = await cleanup(pool, prefix);
    const passed = checks.filter((check) => check.pass).length;
    const summary = {
      target: target.replace(/\/\/[^@]*@/, "//<redacted>@"),
      prefix,
      kept: keep,
      removed,
      observedCodes: [...observedCodes].sort(),
      elapsedMs: Math.round(performance.now() - started),
      passed,
      failed: checks.length - passed,
      checks,
    };
    fs.mkdirSync(runDirectory, { recursive: true });
    fs.writeFileSync(path.join(runDirectory, "report.json"), JSON.stringify(summary, null, 2));
    console.log(`\nObserved codes: ${summary.observedCodes.join(", ")}`);
    console.log(`Report: ${path.relative(ROOT, runDirectory)}/report.json`);
    console.log(JSON.stringify({ passed, failed: summary.failed, elapsedMs: summary.elapsedMs }));
    process.exitCode = summary.failed === 0 ? 0 : 1;
    await client.end();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
