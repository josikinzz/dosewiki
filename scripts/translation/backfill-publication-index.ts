import { createHash } from "node:crypto";
import { open, type FileHandle } from "node:fs/promises";
import { parseArgs } from "node:util";
import { Pool } from "pg";
import type { QueryCtx } from "../../lib/postgres/runtime/server.ts";
import { requireRole } from "../../server/lib/auth";
import { PostgresDatabaseReader, serialExecutor } from "../../lib/postgres/runtime/db";
import { losslessSelectList, rowToDocument } from "../../lib/postgres/documentCodec";
import { normalizePublicEffectIndexArticle } from "../../lib/data/publicData.publicationProjection";
import { POOL_ACQUISITION_TIMEOUT_MS, setTransactionTimeouts } from "../../lib/postgres/transactionTimeouts";
import { assertDataWritesNotFrozen } from "../../lib/runtime/dataWriteFreeze";
import { lockLocalizedPublicationIndexes, refreshLocalizedPublicationIndexes, readLocalizedPublicationIndex } from "../../lib/translation/publicationIndexStore";
import { LIBRARY_TRANSLATION_CORPUS, projectLocalizedPublicationIndex } from "../../lib/translation/publicationIndexProjection";
import { extractSegments } from "./segment-manifest.mjs";
import { requireAdminIntentToken } from "../lib/data-ops-run-context.mjs";
import { createProductionWriteCommand, assertProductionWriteAllowed } from "../lib/production-write-command.mjs";
import { productionWriterClassifications } from "../lib/production-writer-inventory.mjs";
import { guardTarget } from "../postgres/targetGuard";

const OPERATION = "backfill-localized-publication-index";
const SCRIPT = "scripts/translation/backfill-publication-index.ts";
const LOCALE = "zh-Hans";

async function main() {
  const { values } = parseArgs({ strict: true, options: {
    target: { type: "string" }, "allow-remote": { type: "boolean", default: false },
    "dry-run": { type: "boolean", default: false }, write: { type: "boolean", default: false },
    "confirm-write": { type: "string" }, "expected-deployment": { type: "string" },
    "confirm-plan": { type: "string" }, "actor-email": { type: "string" }, "recovery-out": { type: "string" },
  } });
  const command = createProductionWriteCommand({ operation: OPERATION, loadsEnvLocal: false });
  if (command.backend !== "postgres" || !command.targetUrl) throw new Error("Set DATA_BACKEND=postgres and an explicit --target or TARGET_POSTGRES_URL");
  const target = new URL(command.targetUrl);
  if ([...target.searchParams.keys()].some((key) => key !== "sslmode")) throw new Error("Only sslmode target URL parameters are permitted");
  guardTarget(command.targetUrl, values["allow-remote"]);
  const actorEmail = values["actor-email"]?.trim().toLowerCase();
  if (values.write) {
    assertProductionWriteAllowed(command);
    assertDataWritesNotFrozen(OPERATION);
    if (!["localhost", "127.0.0.1", "[::1]"].includes(target.hostname) &&
      !(productionWriterClassifications.productionBoundary as readonly string[]).includes(SCRIPT)) {
      throw new Error("This operation is not in the production writer allowlist. Owner approval and a separately reviewed classification change are required");
    }
    requireAdminIntentToken("editorArticleWrite", { allowLegacy: false });
    if (!actorEmail || !values["recovery-out"] || !/^[a-f0-9]{64}$/.test(values["confirm-plan"] ?? "")) {
      throw new Error("Writes require --actor-email, --recovery-out, and the reviewed --confirm-plan digest");
    }
  }
  const pool = new Pool({ connectionString: command.targetUrl, max: 1, connectionTimeoutMillis: POOL_ACQUISITION_TIMEOUT_MS });
  let journal: FileHandle | undefined;
  try {
    const client = await pool.connect();
    try {
      await client.query(values.write ? "BEGIN ISOLATION LEVEL SERIALIZABLE" : "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      await setTransactionTimeouts(client);
      await client.query("SET LOCAL search_path = public, pg_catalog");
      const database = (await client.query("SELECT current_database() AS database")).rows[0].database;
      if (database !== decodeURIComponent(target.pathname.slice(1))) throw new Error("Connected database differs from the explicit target");
      if (values.write) {
        const { token } = requireAdminIntentToken("editorArticleWrite", { allowLegacy: false });
        await client.query('SELECT "_id" FROM "memberships" WHERE "email" = $1 FOR SHARE', [actorEmail]);
        const ctx = { db: new PostgresDatabaseReader(serialExecutor(client), new Map()) } as unknown as QueryCtx;
        await requireRole(ctx, { apiKey: token, actorEmail, adminIntent: "editorArticleWrite" }, "admin");
        await lockLocalizedPublicationIndexes(client);
      }
      const sources = (await client.query(`SELECT ${losslessSelectList("effectIndexArticles")}, md5(to_jsonb(p)::text) AS source_revision
        FROM "effectIndexArticles" p WHERE "status" IS DISTINCT FROM 'draft' AND "publication_status" = 'published'
        AND "kind" IS DISTINCT FROM 'blog' ORDER BY "_creationTime", "_id"`)).rows;
      const articles = sources.map((row) => {
        const article = normalizePublicEffectIndexArticle(rowToDocument("effectIndexArticles", row));
        if (!article) throw new Error(`Invalid published article ${row._id}; refusing to certify an incomplete index`);
        return article;
      });
      const hashes = [...new Set<string>(articles.flatMap((article) => extractSegments({ items: [article] }, LIBRARY_TRANSLATION_CORPUS).segments.map((segment) => segment.hash)))];
      const translations = new Map<string, string>((await client.query(
        'SELECT "hash", "target" FROM "translationSegments" WHERE "locale" = $1 AND "hash" = ANY($2::text[])', [LOCALE, hashes],
      )).rows.map((row) => [row.hash, row.target]));
      const projections = articles.map((article) => projectLocalizedPublicationIndex(article, LOCALE, translations));
      const installed = (await client.query("SELECT to_regclass('public.\"localizedPublicationIndexes\"') AS relation")).rows[0].relation !== null;
      const before = installed ? (await client.query('SELECT * FROM "localizedPublicationIndexes" WHERE "locale" = $1 ORDER BY "publication_id"', [LOCALE])).rows : [];
      const compact = articles.map((article, index) => ({ slug: article.slug, title: projections[index].title, tags: article.tags,
        shortDescription: projections[index].shortDescription, indexDescription: projections[index].indexDescription,
        readMinutes: projections[index].readMinutes, publicationDate: article.publicationDate, kind: article.kind, bodyFormat: article.bodyFormat }));
      const plan = {
        operation: OPERATION, deployment: command.deploymentFingerprint, locale: LOCALE,
        rows: sources.map((row, index) => ({ id: row._id, slug: articles[index].slug, sourceRevision: row.source_revision, overlayRevision: projections[index].overlayRevision })),
        previousDigest: createHash("sha256").update(JSON.stringify(before)).digest("hex"),
        fullSourceBytes: Buffer.byteLength(JSON.stringify(sources)), compactProjectionBytes: Buffer.byteLength(JSON.stringify(compact)),
      };
      const planDigest = createHash("sha256").update(JSON.stringify(plan)).digest("hex");
      console.log(JSON.stringify({ mode: values.write ? "write-requested" : "dry-run", ...plan, count: sources.length, schemaInstalled: installed, planDigest }, null, 2));
      if (!values.write) { await client.query("ROLLBACK"); return; }
      if (values["confirm-plan"] !== planDigest) throw new Error("Source, translations, or existing projections changed; review a new dry-run plan");
      journal = await open(values["recovery-out"]!, "wx", 0o600);
      await journal.writeFile(`${JSON.stringify({ state: "prepared", operation: OPERATION, deployment: command.deploymentFingerprint, planDigest, before })}\n`);
      await journal.sync();
      await client.query(`INSERT INTO "localizedPublicationIndexes" ("locale", "publication_id", "source_revision", "dirty")
        SELECT $1, p."_id", md5(to_jsonb(p)::text), true FROM "effectIndexArticles" p
        WHERE p."status" IS DISTINCT FROM 'draft' AND p."publication_status" = 'published' AND p."kind" IS DISTINCT FROM 'blog'
        ON CONFLICT ("locale", "publication_id") DO UPDATE SET "source_revision" = EXCLUDED."source_revision", "dirty" = true`, [LOCALE]);
      await refreshLocalizedPublicationIndexes(client, LOCALE);
      const actual = await readLocalizedPublicationIndex(client, LOCALE);
      if (JSON.stringify(actual) !== JSON.stringify(compact)) throw new Error("Materialized index differs from the reviewed projection");
      const after = (await client.query('SELECT * FROM "localizedPublicationIndexes" WHERE "locale" = $1 ORDER BY "publication_id"', [LOCALE])).rows;
      await journal.writeFile(`${JSON.stringify({ state: "written-uncommitted", after })}\n`);
      await journal.sync();
      assertProductionWriteAllowed(command);
      assertDataWritesNotFrozen(OPERATION);
      await client.query("COMMIT");
      await journal.writeFile(`${JSON.stringify({ state: "committed", count: actual.length })}\n`);
      await journal.sync();
      console.log(JSON.stringify({ committed: true, count: actual.length, planDigest }));
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally { client.release(); }
  } finally {
    await journal?.close();
    await pool.end();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message.replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, "[redacted Postgres URL]"));
  process.exitCode = 1;
});
