/**
 * Rehearsal: replication curation, playback metadata,
 * contributor identity and attribution, all through `PostgresClient`
 * with the owned native handlers.
 *
 *   a. curation: publishMetadata on a scratch replication updates the derived
 *      `replicationGalleryCandidates` rows and writes one `replicationEditReceipts`
 *      row in the same transaction; a stale expectedRevision leaves both untouched.
 *   b. order and visibility: an effect collection, a playlist, and a substance
 *      selection keep their order through the public queries and through
 *      `PublicDataReadAdapter` under DATA_BACKEND=postgres.
 *   c. viewer and embed data: the adapter methods the showcase and the embed
 *      consume return the field sets `src/types/replications.ts` declares, and
 *      media URLs resolve through `ctx.storage.getUrl` -> `storageObjects`
 *      (a missing mapping yields null, never a throw).
 *   d. conflict and replay codes for stale edits and reused request identities.
 *   e. contributor profiles: owner field permissions, the stale-profile check,
 *      alias matching of attributed works, and the journaled merge with rollback.
 *
 * Usage: bun scripts/postgres/rehearse-replications-identity.ts --target postgres://localhost:5432/dosewiki [--keep]
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import ts from "typescript";
import { PostgresError } from "../../lib/postgres/runtime/values";
import { makeFunctionReference } from "../../lib/postgres/runtime/api";
import { api } from "../../lib/postgres/runtime/api";
import type { Id } from "../../lib/postgres/runtime/dataModel";
import { PostgresClient } from "../../lib/postgres/runtime/client";
import { mintDataId } from "../../lib/postgres/runtime/db";
import { getPostgresClient } from "../../lib/postgres/runtime/backend";
import { getPublicDataReadAdapter } from "../../lib/data/publicData.reads";
import { documentHash } from "../../lib/postgres/documentCodec";
import { insertDocument, mintDocumentId, selectDocuments } from "../../lib/postgres/documentStore";
import type { TableName } from "../../lib/postgres/schema.generated";
import { contributorMatchNames } from "../../lib/contributorProfileIdentity";
import { buildEffectShowcaseWorks, buildShowcaseWorks } from "../../src/features/replications/components/showcaseModel";
import { minimalArticle } from "../../src/test/fixtures/articles";
import { guardTarget, resolveTarget } from "./targetGuard";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const RUN = mintDocumentId().slice(0, 8);
const P12 = `t12-${RUN}`;
const P13 = `t13-${RUN}`;
const API_KEY = process.env.DATA_ADMIN_KEY ?? "";
const OWNER_EMAIL = `${P13}-owner@rehearsal.invalid`;
const OTHER_EMAIL = `${P13}-other@rehearsal.invalid`;
const ADMIN_EMAIL = `${P13}-admin@rehearsal.invalid`;
const OWNER_KEY = `${P13}-OWNER`.toUpperCase();
const ARTIST = `T12 Artist ${RUN}`;
const ALIAS = `Alias ${RUN}`;
// contributorProfileMerges.apply is pinned to two owner-approved immutable ids;
// on Postgres those ids are plain text, so the scratch pair borrows them.
const MERGE_SOURCE_ID = "kx72vtw19621c4kmbwjt0127558dhbvw" as Id<"contributorProfiles">;
const MERGE_TARGET_ID = "kx77dw7zwgzk9p8byv1b75ny958c9adm" as Id<"contributorProfiles">;
const MERGE_SOURCE_KEY = "WHERESSUEDE";
const MERGE_TARGET_KEY = "LOKA";
const PINNED_SNAPSHOT_DIGEST = "aea1bbeac1ce5a10e7e3a0981af17b40909c13ecf04fcf49299bbb32f66c2d8d";
const PINNED_PROFILE_COUNT = 2_119;
/** Internal mutation the backfill CLI calls; the runtime registry serves internal and public functions alike. */
const backfill = makeFunctionReference<"mutation", { name: "gallery"; cursor?: string; limit?: number }, { processed: number; inserted: number; removed: number; cursor: string; isDone: boolean }>("publicReadIndexes:backfill");

type Check = { scenario: string; check: string; pass: boolean; detail?: unknown };
const checks: Check[] = [];
function expect(scenario: string, check: string, pass: boolean, detail?: unknown): void {
  checks.push({ scenario, check, pass, ...(detail === undefined ? {} : { detail }) });
  console.log(`${pass ? "ok  " : "FAIL"} ${scenario}: ${check}${detail === undefined || pass ? "" : ` ${JSON.stringify(detail)}`}`);
}

type Row = Record<string, unknown>;
const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);
function errorCode(error: unknown): string | null {
  if (!(error instanceof PostgresError) || typeof error.data !== "object" || error.data === null || !("code" in error.data)) return null;
  return typeof error.data.code === "string" ? error.data.code : null;
}
const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);
async function attempt<T>(fn: () => Promise<T>): Promise<{ value?: T; error?: unknown }> {
  try {
    return { value: await fn() };
  } catch (error) {
    return { error };
  }
}

/** Scratch rows go through the document store, which registers them in `documentIds` like the runtime's own inserts. */
class Scratch {
  readonly rows: { table: TableName | "storageObjects"; id: string }[] = [];
  constructor(private readonly pool: Pool) {}
  async seed<T extends TableName>(table: T, doc: Row): Promise<Id<T>> {
    const id = await insertDocument(this.pool, table, { _id: mintDataId(table), ...doc });
    this.rows.push({ table, id });
    // The store hands back the text primary key; the callable API uses the branded type.
    return id as Id<T>;
  }
  /** The R2 manifest is a runtime table keyed by storage_id, outside the document codec. */
  async seedStorageObject(storageId: string, url: string): Promise<void> {
    await this.pool.query('INSERT INTO "storageObjects" ("storage_id", "url", "content_type") VALUES ($1, $2, $3)', [storageId, url, "image/jpeg"]);
    this.rows.push({ table: "storageObjects", id: storageId });
  }
  async derived(table: TableName, where: string, params: unknown[]): Promise<void> {
    const result = await this.pool.query(`SELECT "_id" FROM "${table}" WHERE ${where}`, params);
    for (const row of result.rows) this.rows.push({ table, id: row._id as string });
  }
  async cleanup(): Promise<number> {
    let deleted = 0;
    for (const { table, id } of [...this.rows].reverse()) {
      const column = table === "storageObjects" ? "storage_id" : "_id";
      const result = await this.pool.query(`DELETE FROM "${table}" WHERE "${column}" = $1`, [id]);
      deleted += result.rowCount ?? 0;
      await this.pool.query('DELETE FROM "documentIds" WHERE "_id" = $1', [id]);
    }
    return deleted;
  }
}

async function docs(pool: Pool, table: TableName, where: string, params: unknown[], orderBy = '"_creationTime", "_id"'): Promise<Row[]> {
  return selectDocuments(pool, table, { where, params, orderBy });
}
async function candidateState(pool: Pool, replicationId: string) {
  const rows = await docs(pool, "replicationGalleryCandidates", '"replication_id" = $1', [replicationId], '"candidate_key"');
  return rows.map(({ _id, _creationTime, ...row }) => row);
}
async function receiptState(pool: Pool, target: string) {
  const rows = await docs(pool, "replicationEditReceipts", '"target" = $1', [target]);
  return rows.map((row) => ({ id: row._id, requestId: row.requestId, operation: row.operation }));
}

/** Property names of an interface in src/types/replications.ts, following `extends`. */
function typeFields(source: ts.SourceFile, name: string): { all: Set<string>; required: Set<string> } {
  const all = new Set<string>();
  const required = new Set<string>();
  const visit = (typeName: string) => {
    const declaration = source.statements.find((statement): statement is ts.InterfaceDeclaration => ts.isInterfaceDeclaration(statement) && statement.name.text === typeName);
    if (!declaration) throw new Error(`interface ${typeName} not found in src/types/replications.ts`);
    for (const member of declaration.members) {
      if (!ts.isPropertySignature(member) || !member.name) continue;
      const property = member.name.getText(source);
      all.add(property);
      if (!member.questionToken) required.add(property);
    }
    for (const clause of declaration.heritageClauses ?? []) for (const type of clause.types) visit(type.expression.getText(source));
  };
  visit(name);
  return { all, required };
}
function shapeCheck(scenario: string, label: string, rows: readonly object[], fields: { all: Set<string>; required: Set<string> }) {
  const unknown = new Set<string>();
  const missing = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) if (!fields.all.has(key)) unknown.add(key);
    for (const key of fields.required) if (!(key in row)) missing.add(key);
  }
  expect(scenario, `${label}: every key is declared by the type`, rows.length > 0 && unknown.size === 0, [...unknown]);
  expect(scenario, `${label}: every required field is present`, rows.length > 0 && missing.size === 0, [...missing]);
  expect(scenario, `${label}: url is a string on every row`, rows.every((row) => "url" in row && typeof row.url === "string"));
}

async function main() {
  const argv = process.argv.slice(2);
  const target = resolveTarget(argv);
  guardTarget(target, argv.includes("--allow-remote"));
  if (!API_KEY) throw new Error("DATA_ADMIN_KEY is required (Bun loads .env.local)");
  // The app boundary reads its target from env; point it at the rehearsal target, never PlanetScale.
  process.env.DATA_BACKEND = "postgres";
  process.env.POSTGRES_POOLED_URL = target;
  delete process.env.POSTGRES_DIRECT_URL;
  // REPLICATION_MEDIA_BASE_URL stays set, as every real deployment has it (D6).
  // The unmapped-storage fallback is still exercised by scratch rows that carry
  // no r2_key, which is the only case where storage resolution is consulted.

  const keep = argv.includes("--keep");
  const pool = new Pool({ connectionString: target, max: 4 });
  const client = PostgresClient.fromUrl(target);
  const scratch = new Scratch(pool);
  const runDirectory = path.join(ROOT, "runs", "postgres-import", `${new Date().toISOString().replace(/[:.]/g, "-")}-replications-identity`);
  const started = performance.now();
  const admin = { apiKey: API_KEY };
  const owner = { apiKey: API_KEY, actorEmail: OWNER_EMAIL };
  const now = new Date().toISOString();

  const substanceSlug = `${P12}-substance`;
  const effectSlug = `${P12}-effect`;
  const playlistKey = `${P12}-playlist`;
  const storageId = `${P12}-storage-main`;
  const storageUrl = `https://media.rehearsal.invalid/${P12}/main.jpg`;
  const slugs = { r1: `${P12}-r1`, r2: `${P12}-r2`, r3: `${P12}-r3`, r4: `${P12}-r4`, r5: `${P12}-r5`, r6: `${P12}-r6` };

  try {
    // ---- setup: certify the gallery candidate index ------------------------
    // Substance showcases refuse to read until the derived index is complete.
    // Run the production backfill through the runtime, paged by its own CAS
    // cursor, when the state row is not yet ready (authorized once by Main).
    const S = "setup-gallery-index";
    const [galleryState] = await docs(pool, "publicReadIndexState", '"name" = $1', ["gallery"]);
    if (galleryState?.version === 1 && galleryState.ready === true) {
      expect(S, "gallery index already certified", true);
    } else {
      const cursors: string[] = [];
      let cursor: string | undefined = galleryState?.version === 1 && typeof galleryState.cursor === "string" ? galleryState.cursor : undefined;
      let pages = 0;
      let processed = 0;
      let isDone = false;
      while (!isDone && pages < 200) {
        const page = await client.mutation(backfill, { name: "gallery", cursor, limit: 50 });
        pages += 1;
        processed += page.processed;
        isDone = page.isDone;
        if (!isDone) cursors.push(page.cursor);
        cursor = page.cursor;
      }
      const [certified] = await docs(pool, "publicReadIndexState", '"name" = $1', ["gallery"]);
      const distinctCursors = new Set(cursors).size === cursors.length;
      expect(S, `backfill completed in ${pages} pages over ${processed} rows with distinct cursors`, isDone && distinctCursors, { pages, processed, cursors: cursors.length });
      expect(S, "state row reports version 1 and ready", certified?.version === 1 && certified.ready === true && certified.processed === processed, certified);
      const replicationCount = Number((await pool.query('SELECT count(*)::int AS n FROM "replications"')).rows[0].n);
      expect(S, "every replication row was visited exactly once", processed === replicationCount, { processed, replicationCount });
      const stale = await attempt(() => client.mutation(backfill, { name: "gallery", cursor: cursors[0], limit: 50 }));
      expect(S, "a certified index short-circuits further backfill pages", stale.value?.isDone === true && stale.value.processed === 0, stale.error ? errorMessage(stale.error) : stale.value);
    }

    // ---- scratch corpus ------------------------------------------------------
    await scratch.seedStorageObject(storageId, storageUrl);
    await scratch.seed("substanceIndex", { ...structuredClone(minimalArticle), slug: substanceSlug, title: `Rehearsal ${RUN}`, classification: { psychoactive_class: ["Psychedelic"], chemical_class: [] } });
    const effectId = await scratch.seed("subjectiveEffects", { slug: effectSlug, name: `Rehearsal effect ${RUN}`, tags: [], summary: "", description_raw: "" });
    const titleDrug = { slug: substanceSlug, name: `Rehearsal ${RUN}`, class: "psychedelics", matched_title_text: "ticket" };
    const base = { artist: ARTIST, type: "image", format: "jpg", created_at: now, role: "replication", publication_state: "published", replication_status: "replication", effect_slug: effectSlug, title_drugs: [titleDrug] };
    const ids = {
      r1: await scratch.seed("replications", { ...base, slug: slugs.r1, title: `Rehearsal work one ${RUN}`, storage_id: storageId }),
      r2: await scratch.seed("replications", { ...base, slug: slugs.r2, title: `Rehearsal work two ${RUN}`, url: `https://media.rehearsal.invalid/${P12}/two.jpg`, created_at: new Date(Date.now() - 1000).toISOString() }),
      // Unmapped storage id and no direct URL: the null path.
      r3: await scratch.seed("replications", { ...base, slug: slugs.r3, title: `Rehearsal unmapped ${RUN}`, storage_id: `${P12}-storage-missing`, effect_slug: undefined, title_drugs: undefined }),
      r4: await scratch.seed("replications", { ...base, slug: slugs.r4, title: `Rehearsal work four ${RUN}`, url: `https://media.rehearsal.invalid/${P12}/four.jpg`, created_at: new Date(Date.now() - 2000).toISOString() }),
      // Attributed under an alias, not the profile's display name.
      r5: await scratch.seed("replications", { ...base, slug: slugs.r5, title: `Rehearsal alias work ${RUN}`, artist: ALIAS, url: `https://media.rehearsal.invalid/${P13}/five.jpg`, effect_slug: undefined, title_drugs: undefined }),
      r6: await scratch.seed("replications", { ...base, slug: slugs.r6, title: `Rehearsal duplicate ${RUN}`, artist: ALIAS, url: `https://media.rehearsal.invalid/${P13}/six.jpg`, effect_slug: undefined, title_drugs: undefined, publication_state: "duplicate-suppressed" }),
    };
    await scratch.seed("memberships", { email: OWNER_EMAIL, role: "editor", createdAt: now, updatedAt: now });
    await scratch.seed("memberships", { email: ADMIN_EMAIL, role: "admin", createdAt: now, updatedAt: now });

    // ---- a. curation --------------------------------------------------------
    const A = "a-curation";
    const targetR1 = `replication:${ids.r1}`;
    const detail0 = await client.query(api.replicationContextualEditing.detail, { ...admin, slug: slugs.r1 });
    expect(A, "detail resolves the scratch row with its storage URL", detail0.row.id === ids.r1 && detail0.row.url === storageUrl, detail0.row.url);
    expect(A, "no gallery candidates exist before the first indexed write", (await candidateState(pool, ids.r1)).length === 0);
    const snapshot = { artist: ARTIST, role: "replication" as const, effect_slug: effectSlug, credit_line: null, effect_tags: [] as string[] };
    const request1 = `${P12}-publish-metadata-1`;
    const publish1 = await client.mutation(api.replicationContextualEditing.publishMetadata, {
      ...admin, id: ids.r1, expectedRevision: detail0.revision, requestId: request1, updates: { ...snapshot, title: `Rehearsal retitled ${RUN}` }, sourceUrl: null,
    });
    const candidates1 = await candidateState(pool, ids.r1);
    const receipts1 = await receiptState(pool, targetR1);
    expect(A, "publishMetadata applied", publish1.ok && !publish1.reconciled, publish1);
    expect(A, "candidates derived for slug and title drug route with the new title",
      same(candidates1.map((row) => row.candidate_key), [`drug:${substanceSlug}`, `slug:${slugs.r1}`]) && candidates1.every((row) => row.title === `Rehearsal retitled ${RUN}` && row.replication_id === ids.r1), candidates1);
    expect(A, "exactly one receipt with the request id, whose id is the returned revision", receipts1.length === 1 && receipts1[0].requestId === request1 && receipts1[0].id === publish1.resultRevision, receipts1);
    const detail1 = await client.query(api.replicationContextualEditing.detail, { ...admin, slug: slugs.r1 });
    expect(A, "revision token moved with the receipt", detail1.revision !== detail0.revision);

    const stale = await attempt(() => client.mutation(api.replicationContextualEditing.publishMetadata, {
      ...admin, id: ids.r1, expectedRevision: detail0.revision, requestId: `${P12}-publish-metadata-stale`, updates: { ...snapshot, title: "never stored" }, sourceUrl: null,
    }));
    expect(A, "stale expectedRevision is refused with CONFLICT", errorCode(stale.error) === "CONFLICT", errorMessage(stale.error));
    expect(A, "stale write left the candidates untouched", same(await candidateState(pool, ids.r1), candidates1));
    expect(A, "stale write left the receipts untouched", same(await receiptState(pool, targetR1), receipts1));
    expect(A, "stale write left the row untouched", (await client.query(api.replications.getBySlug, { slug: slugs.r1 }))?.title === `Rehearsal retitled ${RUN}`);

    // Retained maintenance writer: the journal proxy records a generation without a request id.
    const editorial = await client.mutation(api.replications.updateEditorialFields, {
      ...admin, id: ids.r1, expected: { ...snapshot, title: `Rehearsal retitled ${RUN}` }, updates: { ...snapshot, title: `Rehearsal retitled twice ${RUN}` },
    });
    const receipts2 = await receiptState(pool, targetR1);
    expect(A, "retained studio write succeeded", editorial.success === true, editorial);
    expect(A, "retained studio write journaled one retained receipt", receipts2.length === 2 && String(receipts2[1].requestId).startsWith("retained-"), receipts2);
    expect(A, "candidates follow the retained write", (await candidateState(pool, ids.r1)).every((row) => row.title === `Rehearsal retitled twice ${RUN}`));

    // ---- d. replay identities on the metadata path -------------------------
    const D = "d-conflict-replay";
    const replay = await client.mutation(api.replicationContextualEditing.publishMetadata, {
      ...admin, id: ids.r1, expectedRevision: detail0.revision, requestId: request1, updates: { ...snapshot, title: `Rehearsal retitled ${RUN}` }, sourceUrl: null,
    });
    expect(D, "same request id and payload replays as reconciled with the original revision", replay.ok && replay.reconciled && replay.resultRevision === publish1.resultRevision, replay);
    expect(D, "replay wrote no receipt", (await receiptState(pool, targetR1)).length === 2);
    const reused = await attempt(() => client.mutation(api.replicationContextualEditing.publishMetadata, {
      ...admin, id: ids.r1, expectedRevision: detail0.revision, requestId: request1, updates: { ...snapshot, title: "different payload" }, sourceUrl: null,
    }));
    expect(D, "same request id with a different payload is REPLICATION_CHANGE_REUSED", errorCode(reused.error) === "REPLICATION_CHANGE_REUSED", errorMessage(reused.error));

    // ---- b. order and visibility --------------------------------------------
    const B = "b-order-visibility";
    for (const key of ["r2", "r4"] as const) {
      const detail = await client.query(api.replicationContextualEditing.detail, { ...admin, slug: slugs[key] });
      await client.mutation(api.replicationContextualEditing.publishMetadata, {
        ...admin, id: ids[key], expectedRevision: detail.revision, requestId: `${P12}-publish-${key}`, updates: { ...snapshot, title: detail.row.title }, sourceUrl: null,
      });
    }
    // Effect collection: order only, membership from canonical metadata.
    const effectCollection = await client.query(api.replicationContextualEditing.collectionDetail, { ...admin, targetKind: "effect", targetKey: effectSlug });
    const effectOrder = [slugs.r4, slugs.r1, slugs.r2];
    const effectPublish = await client.mutation(api.replicationContextualEditing.publishCollection, {
      ...admin, targetKind: "effect", targetKey: effectSlug, expectedRevision: effectCollection.revision, requestId: `${P12}-effect-order`, slugs: effectOrder, previousSlugs: [slugs.r1, slugs.r2, slugs.r4], title: "Effect",
    });
    expect(B, "effect collection published", effectPublish.ok && !effectPublish.reconciled, effectPublish);
    const [effectRow] = await docs(pool, "subjectiveEffects", '"_id" = $1', [effectId]);
    expect(B, "effect gallery_order stored in the published order", same(effectRow.gallery_order, effectOrder), effectRow.gallery_order);
    expect(B, "effect collection receipt written", (await receiptState(pool, `effect:${effectSlug}`)).length === 1);
    const byEffect = await client.query(api.replications.getReplicationsByEffect, { effect_slug: effectSlug });
    expect(B, "getReplicationsByEffect returns the three effect works with resolved URLs", byEffect.length === 3 && byEffect.every((row) => typeof row.url === "string"), byEffect.map((row) => [row.slug, row.url]));
    const effectWorks = buildEffectShowcaseWorks(byEffect, { effectSlug, effectName: effectRow.name as string, galleryOrder: effectRow.gallery_order as string[] });
    expect(B, "showcase model orders the effect works by gallery_order", same(effectWorks.map((work) => work.slug), effectOrder), effectWorks.map((work) => work.slug));
    const effectStale = await attempt(() => client.mutation(api.replicationContextualEditing.publishCollection, {
      ...admin, targetKind: "effect", targetKey: effectSlug, expectedRevision: effectCollection.revision, requestId: `${P12}-effect-stale`, slugs: [slugs.r1, slugs.r2, slugs.r4], previousSlugs: effectOrder, title: "Effect",
    }));
    expect(D, "stale collection revision is CONFLICT", errorCode(effectStale.error) === "CONFLICT", errorMessage(effectStale.error));
    expect(D, "stale collection write left gallery_order untouched", same((await docs(pool, "subjectiveEffects", '"_id" = $1', [effectId]))[0].gallery_order, effectOrder));

    // Playlist: owner-scoped visibility and archive/restore.
    const playlistOrder = [slugs.r2, slugs.r4, slugs.r1];
    const upsert = await client.mutation(api.replicationPlaylists.upsert, { ...owner, key: playlistKey, title: `Rehearsal playlist ${RUN}`, replication_slugs: [...playlistOrder, slugs.r6] });
    expect(B, "playlist upsert kept the order and pruned the suppressed work", upsert.status === "ok" && same(upsert.replication_slugs, playlistOrder) && same(upsert.pruned, [slugs.r6]), upsert);
    const playlist = await client.query(api.replicationPlaylists.get, { ...owner, key: playlistKey });
    expect(B, "playlist reads back in order, owned and editable", playlist !== null && same(playlist.replication_slugs, playlistOrder) && playlist.owner_email === OWNER_EMAIL && playlist.editable, playlist);
    const playlistCollection = await client.query(api.replicationContextualEditing.collectionDetail, { ...owner, targetKind: "playlist", targetKey: playlistKey });
    const playlistReorder = [slugs.r1, slugs.r4, slugs.r2];
    const playlistPublish = await client.mutation(api.replicationContextualEditing.publishCollection, {
      ...owner, targetKind: "playlist", targetKey: playlistKey, expectedRevision: playlistCollection.revision, requestId: `${P12}-playlist-order`, slugs: playlistReorder, previousSlugs: playlistOrder, title: `Rehearsal playlist ${RUN}`,
    });
    expect(B, "owner published a playlist reorder", playlistPublish.ok, playlistPublish);
    expect(B, "playlist order retained after publish", same((await client.query(api.replicationPlaylists.get, { ...owner, key: playlistKey }))?.replication_slugs, playlistReorder));
    expect(B, "playlist publish journaled a content revision", (await docs(pool, "contentRevisions", '"table" = $1 AND "key" = $2', ["replicationPlaylists", playlistKey])).length === 1);
    const playlistConflict = await client.mutation(api.replicationPlaylists.upsert, { ...owner, key: playlistKey, title: "never", replication_slugs: [], expectedUpdatedAt: upsert.status === "ok" ? upsert.updated_at : null });
    expect(D, "playlist upsert with a stale updated_at returns a conflict carrying the server row", playlistConflict.status === "conflict" && same(playlistConflict.server.replication_slugs, playlistReorder), playlistConflict);
    await client.mutation(api.replicationPlaylists.remove, { ...owner, key: playlistKey });
    expect(B, "archived playlist is invisible to get", (await client.query(api.replicationPlaylists.get, { ...owner, key: playlistKey })) === null);
    expect(B, "archived playlist is listed for admins", (await client.query(api.replicationPlaylists.listArchived, admin)).some((row) => row.key === playlistKey));
    await client.mutation(api.replicationPlaylists.restore, { ...admin, key: playlistKey });
    expect(B, "restored playlist keeps its order", same((await client.query(api.replicationPlaylists.get, { ...owner, key: playlistKey }))?.replication_slugs, playlistReorder));

    // Substance selection: publishCollection drops r2 and orders r4 before r1.
    const substanceCollection = await attempt(() => client.query(api.replicationContextualEditing.collectionDetail, { ...admin, targetKind: "substance", targetKey: substanceSlug }));
    expect(B, "substance collection detail reads", substanceCollection.value !== undefined, errorMessage(substanceCollection.error));
    const substanceOrder = [slugs.r4, slugs.r1];
    const substancePublish = await attempt(() => client.mutation(api.replicationContextualEditing.publishCollection, {
      ...admin, targetKind: "substance", targetKey: substanceSlug, expectedRevision: substanceCollection.value?.revision ?? "", requestId: `${P12}-substance-order`, slugs: substanceOrder, previousSlugs: [slugs.r4, slugs.r2, slugs.r1], title: "Substance",
    }));
    expect(B, "substance selection published", substancePublish.value?.ok === true, errorMessage(substancePublish.error));
    const curation = await client.query(api.substanceGalleries.getBySubstance, { substance_slug: substanceSlug });
    expect(B, "substanceGalleries row stores the exclusion and carousel order", curation !== null && same(curation.removed_slugs, [slugs.r2]) && same(curation.carousel_order, substanceOrder), curation);
    const gallery = await attempt(() => client.query(api.substanceGalleries.getPublicGalleryBySubstance, { substance_slug: substanceSlug }));
    expect(B, "public substance gallery returns the two visible works in carousel order",
      gallery.value !== undefined && same(gallery.value.items.map((item) => item.replication.slug), substanceOrder) && same(gallery.value.carouselOrder, substanceOrder), gallery.error ? errorMessage(gallery.error) : gallery.value);
    const adapter = getPublicDataReadAdapter();
    const adapterGallery = await adapter.getPublicSubstanceGallery(substanceSlug);
    expect(B, "adapter getPublicSubstanceGallery matches the query byte for byte under DATA_BACKEND=postgres", adapterGallery !== null && same(adapterGallery, gallery.value), adapterGallery);
    const adapterCuration = await adapter.getPublicSubstanceGalleryCuration(substanceSlug);
    expect(B, "adapter getPublicSubstanceGalleryCuration carries the exclusion and order", adapterCuration !== null && same(adapterCuration.removed_slugs, [slugs.r2]) && same(adapterCuration.carousel_order, substanceOrder), adapterCuration);
    if (adapterGallery) {
      const substanceWorks = buildShowcaseWorks(adapterGallery.items, new Map(), () => null, () => null, adapterGallery.carouselOrder);
      expect(B, "showcase model orders the substance works by carousel order", same(substanceWorks.map((work) => work.slug), substanceOrder), substanceWorks.map((work) => work.slug));
    }
    const bySlugs = await adapter.getPublicReplicationsBySlugs([slugs.r4, slugs.r1, slugs.r2]);
    expect(B, "adapter getPublicReplicationsBySlugs keeps caller order", same(bySlugs.map((row) => row.slug), [slugs.r4, slugs.r1, slugs.r2]), bySlugs.map((row) => row.slug));
    const galleryPage = await adapter.getPublicReplications();
    const pageBySlug = new Map(galleryPage.map((row) => [row.slug, row]));
    expect(B, "adapter gallery pages surface the effect works with their curated positions",
      effectOrder.every((slug, index) => pageBySlug.get(slug)?.effect_order_index?.[effectSlug] === index), effectOrder.map((slug) => pageBySlug.get(slug)?.effect_order_index));
    expect(B, "adapter gallery pages withhold the duplicate-suppressed work and the URL-less work", !pageBySlug.has(slugs.r6) && !pageBySlug.has(slugs.r3));

    // ---- c. viewer and embed shapes, media URLs -----------------------------
    const C = "c-viewer-embed";
    const typesSource = ts.createSourceFile("replications.ts", fs.readFileSync(path.join(ROOT, "src/types/replications.ts"), "utf8"), ts.ScriptTarget.Latest, true);
    const withUrl = typeFields(typesSource, "ReplicationWithUrl");
    const galleryPreview = typeFields(typesSource, "PublicGalleryReplicationPreview");
    const single = await adapter.getPublicReplicationBySlug(slugs.r1);
    shapeCheck(C, "getPublicReplicationBySlug -> ReplicationWithUrl", single ? [single] : [], withUrl);
    shapeCheck(C, "getPublicReplicationsBySlugs -> ReplicationWithUrl", bySlugs, withUrl);
    shapeCheck(C, "getPublicReplicationsByEffect rows -> ReplicationWithUrl", byEffect, withUrl);
    shapeCheck(C, "getPublicReplications page items -> PublicGalleryReplicationPreview", effectOrder.map((slug) => pageBySlug.get(slug)).filter((row) => row !== undefined), galleryPreview);
    if (adapterGallery) shapeCheck(C, "getPublicSubstanceGallery items -> ReplicationWithUrl", adapterGallery.items.map((item) => item.replication), withUrl);
    expect(C, "storage-backed work resolves its URL from storageObjects", single?.url === storageUrl && single?.storage_id === storageId, single?.url);
    const unmapped = await attempt(() => client.query(api.replications.getBySlug, { slug: slugs.r3 }));
    expect(C, "unmapped storage id yields url null without throwing", unmapped.value !== undefined && unmapped.value !== null && unmapped.value.url === null, unmapped.error ? errorMessage(unmapped.error) : unmapped.value?.url);
    expect(C, "getBySlugs drops the URL-less work rather than failing", (await client.query(api.replications.getBySlugs, { slugs: [slugs.r3, slugs.r1] })).map((row) => row.slug).join() === slugs.r1);
    const resolved = await attempt(() => client.query(api.replications.resolveStorageUrls, { storageIds: [storageId, `${P12}-storage-missing`] }));
    expect(C, "resolveStorageUrls returns the mapped URL and null for the missing mapping", same(resolved.value, [storageUrl, null]), resolved.error ? errorMessage(resolved.error) : resolved.value);

    // ---- e. contributor profiles --------------------------------------------
    const E = "e-profiles";
    const created = await client.mutation(api.contributorProfiles.saveProfile, {
      ...owner, profile: { key: "", displayName: `Owner ${RUN}`, bio: "first bio", links: [] }, expectedUpdatedAt: null, operationId: `${P13}-profile-create`,
    });
    expect(E, "owner created their own profile under the derived key", created.updated === false && created.profile?.key === OWNER_KEY, created.profile?.key);
    const stored0 = (await docs(pool, "contributorProfiles", '"key" = $1', [OWNER_KEY]))[0];
    expect(E, "owner's membership email is bound to the profile", stored0?.membershipEmail === OWNER_EMAIL);
    const permitted = await client.mutation(api.contributorProfiles.saveProfileAsEditor, {
      ...owner, key: OWNER_KEY, patch: { bio: "second bio" }, expectedUpdatedAt: stored0.updatedAt as string, operationId: `${P13}-profile-bio`,
    });
    expect(E, "owner edited a permitted field", permitted.updated && permitted.profile?.bio === "second bio", permitted);
    const stored1 = (await docs(pool, "contributorProfiles", '"key" = $1', [OWNER_KEY]))[0];
    const forbidden = await attempt(() => client.mutation(api.contributorProfiles.saveProfileAsEditor, {
      ...owner, key: OWNER_KEY, patch: { approved_replicator: true }, expectedUpdatedAt: stored1.updatedAt as string, operationId: `${P13}-profile-forbidden`,
    }));
    expect(E, "owner is refused an admin-only field with ADMIN_ONLY_PROFILE_FIELD", errorCode(forbidden.error) === "ADMIN_ONLY_PROFILE_FIELD", errorMessage(forbidden.error));
    expect(E, "refused write left the profile untouched", documentHash((await docs(pool, "contributorProfiles", '"key" = $1', [OWNER_KEY]))[0]) === documentHash(stored1));
    const otherKey = `${P13}-OTHER`.toUpperCase();
    const otherId = await scratch.seed("contributorProfiles", { key: otherKey, displayName: `Other ${RUN}`, aliases: [], bio: "", links: [], membershipEmail: OTHER_EMAIL, createdAt: now, updatedAt: now });
    const notOwned = await attempt(() => client.mutation(api.contributorProfiles.saveProfileAsEditor, {
      ...owner, key: otherKey, patch: { bio: "hijack" }, expectedUpdatedAt: now, operationId: `${P13}-profile-hijack`,
    }));
    expect(E, "owner cannot edit another member's profile", errorMessage(notOwned.error) === "You can only edit your own contributor profile.", errorMessage(notOwned.error));
    expect(E, "other profile untouched", (await docs(pool, "contributorProfiles", '"_id" = $1', [otherId]))[0].bio === "");
    const staleProfile = await attempt(() => client.mutation(api.contributorProfiles.saveProfileAsEditor, {
      ...owner, key: OWNER_KEY, patch: { bio: "third bio" }, expectedUpdatedAt: stored0.updatedAt as string, operationId: `${P13}-profile-stale`,
    }));
    expect(D, "stale profile expectedUpdatedAt is PROFILE_CONFLICT", errorCode(staleProfile.error) === "PROFILE_CONFLICT", errorMessage(staleProfile.error));
    const staleSelf = await attempt(() => client.mutation(api.contributorProfiles.saveProfile, {
      ...owner, profile: { key: OWNER_KEY, displayName: `Owner ${RUN}`, bio: "self stale", links: [] }, expectedUpdatedAt: stored0.updatedAt as string, operationId: `${P13}-profile-self-stale`,
    }));
    expect(D, "owner's self-serve save cannot bypass the stale-profile check", errorCode(staleSelf.error) === "PROFILE_CONFLICT", errorMessage(staleSelf.error));
    const profileReplay = await client.mutation(api.contributorProfiles.saveProfileAsEditor, {
      ...owner, key: OWNER_KEY, patch: { bio: "second bio" }, expectedUpdatedAt: stored0.updatedAt as string, operationId: `${P13}-profile-bio`,
    });
    expect(D, "repeated profile operation id replays the recorded revision", profileReplay.revision === permitted.revision, profileReplay);
    const profileReused = await attempt(() => client.mutation(api.contributorProfiles.saveProfileAsEditor, {
      ...owner, key: OWNER_KEY, patch: { bio: "another payload" }, expectedUpdatedAt: stored0.updatedAt as string, operationId: `${P13}-profile-bio`,
    }));
    expect(D, "profile operation id reuse with a different payload is PROFILE_OPERATION_REUSED", errorCode(profileReused.error) === "PROFILE_OPERATION_REUSED", errorMessage(profileReused.error));

    // Alias matching resolves attributed works after an alias is added.
    const profileBefore = await client.query(api.contributorProfiles.getByKey, { key: OWNER_KEY });
    const namesBefore = contributorMatchNames({ displayName: profileBefore!.displayName, aliases: profileBefore!.aliases });
    expect(E, "no works attributed before the alias exists", (await client.query(api.replications.getByArtistNames, { artistNames: namesBefore })).length === 0);
    const aliasWrite = await client.mutation(api.contributorProfiles.saveProfileAsEditor, {
      ...admin, key: OWNER_KEY, patch: { aliases: [ALIAS] }, expectedUpdatedAt: stored1.updatedAt as string, operationId: `${P13}-profile-alias`,
    });
    expect(E, "admin recorded the alias", aliasWrite.updated && aliasWrite.profile?.aliases.includes(ALIAS.toLowerCase()) === true, aliasWrite.profile?.aliases);
    const profileAfter = await client.query(api.contributorProfiles.getByKey, { key: OWNER_KEY });
    const namesAfter = contributorMatchNames({ displayName: profileAfter!.displayName, aliases: profileAfter!.aliases });
    const attributed = await client.query(api.replications.getByArtistNames, { artistNames: namesAfter });
    expect(E, "alias-credited work resolves to the canonical profile through the query", same(attributed.map((row) => row.slug).sort(), [slugs.r5, slugs.r6].sort()), attributed.map((row) => row.slug));
    const attributedAdapter = await adapter.getPublicReplicationsByArtistNames(namesAfter);
    expect(E, "adapter getPublicReplicationsByArtistNames drains pages to the same works", same(attributedAdapter.map((row) => row.slug).sort(), [slugs.r5, slugs.r6].sort()), attributedAdapter.map((row) => row.slug));

    // Journaled merge of two scratch profiles under the pinned immutable ids.
    const M = "e-merge";
    const sourceId = await scratch.seed("contributorProfiles", { _id: MERGE_SOURCE_ID, key: MERGE_SOURCE_KEY, displayName: "wheressuede", aliases: [], bio: "", links: [], replicationOrder: [slugs.r5], reportOrder: [], createdAt: now, updatedAt: now });
    const targetId = await scratch.seed("contributorProfiles", { _id: MERGE_TARGET_ID, key: MERGE_TARGET_KEY, displayName: "Loka", aliases: ["loka"], bio: "target bio", links: [], replicationOrder: [], reportOrder: [], createdAt: now, updatedAt: now });
    expect(M, "scratch profiles seeded under the approved immutable ids", sourceId === MERGE_SOURCE_ID && targetId === MERGE_TARGET_ID);
    const evidence = [{ kind: "editorial-review", digest: "e".repeat(64), note: "rehearsal" }];
    const attributionId = await scratch.seed("replicationIdentityAttributions", { replication_id: ids.r5, poster_display_name: "wheressuede", poster_profile_id: MERGE_SOURCE_ID, creator_display_name: "wheressuede", creator_profile_id: MERGE_SOURCE_ID, creator_determination: "poster-presumed-creator", review_status: "reviewed-no-obvious-conflict", evidence, source_digest: "a".repeat(64), operation_id: `${P13}-attribution`, updated_at: Date.now() });
    const aliasEvidenceId = await scratch.seed("contributorAliasEvidence", { profile_id: MERGE_SOURCE_ID, alias: "WheresSuede", normalized_alias: "wheressuede", evidence, operation_id: `${P13}-alias-evidence`, recorded_at: Date.now() });
    const avatarId = await scratch.seed("contributorAvatarHistory", { profile_id: MERGE_SOURCE_ID, provenance: "profile-controlled", media_digest: "b".repeat(64), delivery_verification: "pending", evidence, operation_id: `${P13}-avatar`, recorded_at: Date.now() });
    const sourceVerificationId = await scratch.seed("contributorReplicatorVerifications", { profile_id: MERGE_SOURCE_ID, status: "verified", basis: "artist-sheet-review", work_count_reviewed: 3, rationale: "source verified", evidence, source_digest: "c".repeat(64), operation_id: `${P13}-verify-source`, reviewed_at: Date.now() });
    const targetVerificationId = await scratch.seed("contributorReplicatorVerifications", { profile_id: MERGE_TARGET_ID, status: "unclear", basis: "editorial-review", work_count_reviewed: 1, rationale: "target unclear", evidence, source_digest: "d".repeat(64), operation_id: `${P13}-verify-target`, reviewed_at: Date.now() });
    const bindingId = await scratch.seed("replicationIdentityProfileBindings", { artist_id: "wheressuede", profile_id: MERGE_SOURCE_ID, profile_key: MERGE_SOURCE_KEY, decision: "bound-existing-profile", snapshot_digest: PINNED_SNAPSHOT_DIGEST, operation_id: `${P13}-binding`, bound_at: Date.now() });
    const duplicateId = await scratch.seed("replicationDuplicateReconciliations", { component_id: `${P13}-component`, keeper_replication_id: ids.r5, suppressed_replication_id: ids.r6, evidence_digest: "f".repeat(64), classification: "same-work-confirmed-prior-multi-method-review", keeper_policy: "original-collection-default", reddit_post_ids: [], source_references: [], state: "active", operation_id: `${P13}-duplicate`, created_at: Date.now(), updated_at: Date.now() });
    const before = async (table: TableName, id: string) => documentHash((await docs(pool, table, '"_id" = $1', [id]))[0]);
    const preMerge = { source: await before("contributorProfiles", MERGE_SOURCE_ID), attribution: await before("replicationIdentityAttributions", attributionId), binding: await before("replicationIdentityProfileBindings", bindingId), duplicate: await before("replicationDuplicateReconciliations", duplicateId), alias: await before("contributorAliasEvidence", aliasEvidenceId), avatar: await before("contributorAvatarHistory", avatarId), sourceVerification: await before("contributorReplicatorVerifications", sourceVerificationId) };
    const mergeActor = { apiKey: API_KEY, actor_email: ADMIN_EMAIL };
    const preview = await client.query(api.contributorProfileMerges.preview, { ...mergeActor, input: { source_profile_id: MERGE_SOURCE_ID, source_key: MERGE_SOURCE_KEY, target_profile_id: MERGE_TARGET_ID, target_key: MERGE_TARGET_KEY, pinned_snapshot_digest: PINNED_SNAPSHOT_DIGEST, pinned_snapshot_profile_count: PINNED_PROFILE_COUNT, expected_state_digest: "0".repeat(64), applied_at: 1 } });
    expect(M, "preview captured the attribution, binding, and no reports", preview.attribution_count === 1 && preview.binding_count === 1 && preview.report_count === 0, preview);
    const mergeInput = { source_profile_id: MERGE_SOURCE_ID, source_key: MERGE_SOURCE_KEY, target_profile_id: MERGE_TARGET_ID, target_key: MERGE_TARGET_KEY, pinned_snapshot_digest: PINNED_SNAPSHOT_DIGEST, pinned_snapshot_profile_count: PINNED_PROFILE_COUNT, expected_state_digest: preview.state_digest, applied_at: Date.now() };
    const mergeOperation = `${P13}-merge`;
    const rollbackOperation = `${P13}-rollback`;
    const dryRun = await client.mutation(api.contributorProfileMerges.apply, { ...mergeActor, operation_id: mergeOperation, dry_run: true, input: mergeInput });
    expect(M, "dry run plans changes without writing", dryRun.dry_run && dryRun.item_count >= 5 && (await docs(pool, "contributorProfileMergeOperations", '"operation_id" = $1', [mergeOperation])).length === 0, dryRun);
    const applied = await client.mutation(api.contributorProfileMerges.apply, { ...mergeActor, operation_id: mergeOperation, dry_run: false, input: mergeInput });
    expect(M, "merge applied", !applied.dry_run && !applied.idempotent_replay && applied.item_count === dryRun.item_count, applied);
    const [sourceMerged] = await docs(pool, "contributorProfiles", '"_id" = $1', [MERGE_SOURCE_ID]);
    const [targetMerged] = await docs(pool, "contributorProfiles", '"_id" = $1', [MERGE_TARGET_ID]);
    expect(M, "source record is preserved and marked merged into the target", sourceMerged !== undefined && sourceMerged.mergedIntoProfileId === MERGE_TARGET_ID && sourceMerged.mergedIntoKey === MERGE_TARGET_KEY && sourceMerged.mergedByOperationId === mergeOperation, sourceMerged);
    expect(M, "target absorbed the source aliases and replication order", (targetMerged.aliases as string[]).includes("wheressuede") && same(targetMerged.replicationOrder, [slugs.r5]), targetMerged);
    expect(M, "attribution retargeted to the canonical profile", (await docs(pool, "replicationIdentityAttributions", '"_id" = $1', [attributionId]))[0].poster_profile_id === MERGE_TARGET_ID);
    expect(M, "binding retargeted to the canonical profile", (await docs(pool, "replicationIdentityProfileBindings", '"_id" = $1', [bindingId]))[0].profile_key === MERGE_TARGET_KEY);
    const [targetVerification] = await docs(pool, "contributorReplicatorVerifications", '"_id" = $1', [targetVerificationId]);
    expect(M, "verification aggregated losslessly on the target with two contributions", targetVerification.status === "verified" && (targetVerification.review_contributions as unknown[]).length === 2 && targetVerification.operation_id === mergeOperation, targetVerification);
    expect(M, "source verification row survives in its own table", await before("contributorReplicatorVerifications", sourceVerificationId) === preMerge.sourceVerification);
    expect(M, "alias evidence row survives unchanged in contributorAliasEvidence", await before("contributorAliasEvidence", aliasEvidenceId) === preMerge.alias);
    expect(M, "avatar history row survives unchanged in contributorAvatarHistory", await before("contributorAvatarHistory", avatarId) === preMerge.avatar);
    expect(M, "duplicate suppression row survives unchanged", await before("replicationDuplicateReconciliations", duplicateId) === preMerge.duplicate && (await client.query(api.replications.getBySlug, { slug: slugs.r6 }))?.publication_state === "duplicate-suppressed");
    const items = await docs(pool, "contributorProfileMergeItems", '"operation_id" = $1', [mergeOperation], '"ordinal"');
    expect(M, "merge journal holds one item per change with before and after rows", items.length === applied.item_count && items.every((item, ordinal) => item.ordinal === ordinal && item.before !== null && item.after !== null), items.length);
    const receipt = await client.query(api.contributorProfileMerges.receipt, { ...mergeActor, operation_id: mergeOperation });
    expect(M, "receipt reports applied and live-matching", receipt?.operation.status === "applied" && receipt.live_matches && receipt.checked_items === applied.item_count, receipt);
    expect(M, "public read of the merged key redirects to the canonical profile", (await client.query(api.contributorProfiles.getByKey, { key: MERGE_SOURCE_KEY }))?.key === MERGE_TARGET_KEY);
    const identity = await client.query(api.publicReplicationIdentitySocial.getProfileIdentityByKey, { key: MERGE_TARGET_KEY });
    expect(M, "public identity read shows the canonical key as a verified replicator", identity?.canonical_key === MERGE_TARGET_KEY && identity.verified_replicator === true, identity);
    const publicAttribution = await client.query(api.publicReplicationIdentitySocial.getAttributionByReplicationId, { replication_id: ids.r5 });
    expect(M, "public attribution names the canonical profile key", publicAttribution?.poster.profile_key === MERGE_TARGET_KEY && publicAttribution.creator.profile_key === MERGE_TARGET_KEY, publicAttribution);
    expect(M, "adapter getPublicReplicationIdentityAttribution agrees", same(await adapter.getPublicReplicationIdentityAttribution(ids.r5), publicAttribution));
    const mergeReplay = await client.mutation(api.contributorProfileMerges.apply, { ...mergeActor, operation_id: mergeOperation, dry_run: false, input: mergeInput });
    expect(D, "merge replay under the same operation id is idempotent", mergeReplay.idempotent_replay && mergeReplay.state_digest === applied.state_digest, mergeReplay);
    const mergeCollision = await attempt(() => client.mutation(api.contributorProfileMerges.apply, { ...mergeActor, operation_id: mergeOperation, dry_run: false, input: { ...mergeInput, applied_at: mergeInput.applied_at + 1 } }));
    expect(D, "merge operation id with a different payload is refused", errorMessage(mergeCollision.error).includes("collision"), errorMessage(mergeCollision.error));
    const rolledBack = await client.mutation(api.contributorProfileMerges.rollback, { ...mergeActor, operation_id: rollbackOperation, rollback_of: mergeOperation, dry_run: false });
    expect(M, "rollback applied", !rolledBack.idempotent_replay && rolledBack.item_count === applied.item_count, rolledBack);
    expect(M, "rollback restored the source profile exactly", await before("contributorProfiles", MERGE_SOURCE_ID) === preMerge.source);
    expect(M, "rollback restored the attribution and binding exactly", await before("replicationIdentityAttributions", attributionId) === preMerge.attribution && await before("replicationIdentityProfileBindings", bindingId) === preMerge.binding);
    expect(M, "rollback history rows are retained", (await docs(pool, "contributorProfileMergeItems", '"operation_id" = $1', [mergeOperation])).length === applied.item_count && (await docs(pool, "contributorProfileMergeOperations", '"operation_id" = $1', [mergeOperation]))[0].status === "rolled-back");
    expect(M, "public read of the source key resolves to the source again", (await client.query(api.contributorProfiles.getByKey, { key: MERGE_SOURCE_KEY }))?.key === MERGE_SOURCE_KEY);
    const rollbackReplay = await client.mutation(api.contributorProfileMerges.rollback, { ...mergeActor, operation_id: rollbackOperation, rollback_of: mergeOperation, dry_run: false });
    expect(D, "rollback replay is idempotent", rollbackReplay.idempotent_replay, rollbackReplay);
    const afterRollback = await attempt(() => client.mutation(api.contributorProfileMerges.apply, { ...mergeActor, operation_id: mergeOperation, dry_run: false, input: mergeInput }));
    expect(D, "re-applying a rolled-back operation id is refused", errorMessage(afterRollback.error).includes("rolled-back replay"), errorMessage(afterRollback.error));
  } finally {
    if (!keep) {
      // Rows the handlers derived from the scratch corpus.
      const replicationIds = (await pool.query('SELECT "_id" FROM "replications" WHERE "slug" LIKE $1', [`${P12}-%`])).rows.map((row) => row._id as string);
      await scratch.derived("replicationGalleryCandidates", '"replication_id" = ANY($1)', [replicationIds]);
      await scratch.derived("replicationEditReceipts", '"target" = ANY($1)', [[...replicationIds.map((id) => `replication:${id}`), `effect:${effectSlug}`, `substance:${substanceSlug}`, `playlist:${playlistKey}`, `artist:${OWNER_KEY}`]]);
      await scratch.derived("contentRevisions", '"key" = ANY($1)', [[playlistKey, OWNER_KEY, MERGE_SOURCE_KEY, MERGE_TARGET_KEY]]);
      await scratch.derived("contributorProfileMergeOperations", '"operation_id" LIKE $1', [`${P13}-%`]);
      await scratch.derived("contributorProfileMergeItems", '"operation_id" LIKE $1', [`${P13}-%`]);
      await scratch.derived("replicationPlaylists", '"key" = $1', [playlistKey]);
      await scratch.derived("substanceGalleries", '"substance_slug" = $1', [substanceSlug]);
      await scratch.derived("contributorProfiles", '"key" = $1', [OWNER_KEY]);
      await scratch.derived("publicCachePublications", '"key" LIKE $1 OR "key" LIKE $2', [`%${P12}%`, `%${P13}%`]);
      const deleted = await scratch.cleanup();
      console.log(`cleanup: deleted ${deleted} scratch rows`);
    }
    const passed = checks.filter((c) => c.pass).length;
    const summary = {
      target: target.replace(/\/\/[^@]*@/, "//<redacted>@"),
      run: RUN,
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
    await client.end();
    await getPostgresClient().end();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
