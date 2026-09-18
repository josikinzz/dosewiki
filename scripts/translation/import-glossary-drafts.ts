#!/usr/bin/env bun
/**
 * Import local model glossary artifacts into the editor review queue only.
 * No-write is the default. This never approves, replaces, or enqueues anything.
 *
 * DATA_BACKEND=postgres npm run translate:glossary:import-drafts -- \
 *   --locales ar,cs,de,es,fr,hi,ja,ko,nl,pl,pt,ru --target "$TARGET_POSTGRES_URL" --dry-run
 *
 * Review the JSON plan, then repeat the same target/locales with --write,
 * --confirm-write=import-glossary-drafts, --expected-deployment=<host/database>,
 * --confirm-plan=<planDigest>, --actor-email=<registered-admin>, and
 * --recovery-out=<new-file.jsonl>. Remote reads and writes also require
 * --allow-remote and POSTGRES_IMPORT_CONFIRM=<host>. Writes require the scoped
 * DATA_ADMIN_TOKEN_EDITOR_ARTICLE_WRITE; the legacy master key is not accepted.
 * Import confirmation is not linguistic review: all reviewer fields stay null.
 */
import { createHash } from "node:crypto";
import { open, readFile, type FileHandle } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { Pool, type PoolClient } from "pg";
import { z } from "zod";

import type { QueryCtx } from "../../lib/postgres/runtime/server.ts";
import { requireRole } from "../../server/lib/auth";
import { PostgresDatabaseReader, serialExecutor } from "../../lib/postgres/runtime/db";
import { POOL_ACQUISITION_TIMEOUT_MS, setTransactionTimeouts } from "../../lib/postgres/transactionTimeouts";
import { assertDataWritesNotFrozen } from "../../lib/runtime/dataWriteFreeze";
import { requireAdminIntentToken } from "../lib/data-ops-run-context.mjs";
import { createProductionWriteCommand, assertProductionWriteAllowed } from "../lib/production-write-command.mjs";
import { guardTarget } from "../postgres/targetGuard";
import { glossaryPath, resolveLocale } from "./locales.mjs";

const OPERATION = "import-glossary-drafts";
const INTENT = "editorArticleWrite";
const text = (max: number) => z.string().min(1).max(max).refine(
  (value) => value === value.trim() && !/[\u0000-\u001f\u007f\uD800-\uDFFF]/u.test(value),
  "Must be trimmed text without controls or unpaired surrogates",
);
const draftSchema = z.strictObject({
  target: text(400),
  kind: text(100),
  status: z.literal("draft"),
  source: z.literal("model"),
});
const artifactSchema = z.strictObject({
  locale: text(32),
  note: z.string().optional(),
  counts: z.strictObject({ approved: z.literal(0), draft: z.number().int().positive() }),
  terms: z.record(text(200), draftSchema),
}).refine((value) => Object.keys(value.terms).length === value.counts.draft, "Draft count must equal the number of terms");

type Draft = z.infer<typeof draftSchema> & { locale: string; term: string };
type Stored = Omit<Draft, "status" | "source"> & {
  status: "draft" | "approved";
  source: "model" | "human";
  reviewed_at: string | null;
  reviewed_by: string | null;
  retranslated_at: string | null;
  updated_at: string;
};
const columns = '"locale", "term", "target", "kind", "status", "source", "reviewed_at", "reviewed_by", "retranslated_at", "updated_at"';
const digest = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const key = (row: { locale: string; term: string }) => JSON.stringify([row.locale, row.term]);
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;

/** JSON.parse alone silently discards duplicate keys, including provenance fields. */
function parseArtifactJson(raw: string): unknown {
  const parsed: unknown = JSON.parse(raw);
  const objects: Array<Set<string> | null> = [];
  for (const token of raw.matchAll(/("(?:[^"\\]|\\.)*")(\s*:)?|[{}\[\]]/gs)) {
    if (token[0] === "{") objects.push(new Set());
    else if (token[0] === "[") objects.push(null);
    else if (token[0] === "}" || token[0] === "]") objects.pop();
    else if (token[2]) {
      const keys = objects.at(-1);
      const name = JSON.parse(token[1]) as string;
      if (keys?.has(name)) throw new Error(`Duplicate JSON key: ${name}`);
      keys?.add(name);
    }
  }
  return parsed;
}

async function loadInputs(locales: string[]) {
  return await Promise.all(locales.map(async (locale) => {
    const filename = glossaryPath(locale);
    const bytes = await readFile(filename);
    const document = artifactSchema.parse(parseArtifactJson(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
    if (document.locale !== locale) throw new Error(`${filename}: locale does not match ${locale}`);
    const rows: Draft[] = Object.entries(document.terms)
      .sort(([a], [b]) => compare(a, b))
      .map(([term, row]) => ({ locale, term, ...row }));
    return { locale, file: path.relative(process.cwd(), filename), sha256: digest(bytes), rows };
  }));
}

async function authorize(client: PoolClient, actorEmail: string) {
  const { token } = requireAdminIntentToken(INTENT, { allowLegacy: false });
  // Keep the membership and its ban/role state fixed through this transaction.
  await client.query('SELECT "_id" FROM "public"."memberships" WHERE "email" = $1 FOR SHARE', [actorEmail]);
  const ctx = { db: new PostgresDatabaseReader(serialExecutor(client), new Map()) } as unknown as QueryCtx;
  await requireRole(ctx, { apiKey: token, actorEmail, adminIntent: INTENT }, "admin");
}

async function appendJournal(file: FileHandle, record: unknown) {
  await file.writeFile(`${JSON.stringify(record)}\n`);
  await file.sync();
}

async function main() {
  const { values } = parseArgs({
    strict: true,
    options: {
      locales: { type: "string" },
      target: { type: "string" },
      "allow-remote": { type: "boolean", default: false },
      "dry-run": { type: "boolean", default: false },
      write: { type: "boolean", default: false },
      "confirm-write": { type: "string" },
      "expected-deployment": { type: "string" },
      "confirm-plan": { type: "string" },
      "actor-email": { type: "string" },
      "recovery-out": { type: "string" },
      help: { type: "boolean", default: false },
    },
  });
  if (values.help) {
    console.log(`Usage: translate:glossary:import-drafts --locales ar,cs,de,es,fr,hi,ja,ko,nl,pl,pt,ru --target <postgres-url> [--dry-run]\nWrites additionally require --write --confirm-write=${OPERATION} --expected-deployment=<host/database> --confirm-plan=<dry-run-planDigest> --actor-email=<registered-admin> --recovery-out=<new-file.jsonl>.\nSet DATA_BACKEND=postgres. Remote reads/writes need --allow-remote and POSTGRES_IMPORT_CONFIRM=<host>. Writes need DATA_ADMIN_TOKEN_EDITOR_ARTICLE_WRITE and an open DATA_WRITES_FROZEN gate. No legacy token fallback. Target may instead be supplied by TARGET_POSTGRES_URL.`);
    return;
  }
  const command = createProductionWriteCommand({ operation: OPERATION, loadsEnvLocal: false });
  if (command.backend !== "postgres") throw new Error("Set DATA_BACKEND=postgres explicitly");
  if (!command.targetUrl) throw new Error("Pass --target <postgres-url> or set TARGET_POSTGRES_URL");
  if (values.write && values["dry-run"]) throw new Error("--write and --dry-run cannot be combined");
  const target = new URL(command.targetUrl);
  // pg accepts connection overrides in URL parameters. Do not let them change
  // the host/database or search path after the explicit-target gate inspected it.
  if ([...target.searchParams.keys()].some((name) => name !== "sslmode")) {
    throw new Error("Only sslmode is permitted in target URL query parameters");
  }
  guardTarget(command.targetUrl, values["allow-remote"]);
  const locales = values.locales?.split(",").map((code) => code.trim()).sort(compare);
  if (!locales?.length || locales.some((code) => !code) || new Set(locales).size !== locales.length) {
    throw new Error("Pass a non-empty, duplicate-free --locales <code,code,...> list");
  }
  for (const code of locales) {
    const locale = resolveLocale(code);
    if (locale.code !== code || code === "zh-Hans" || code === "en") {
      throw new Error(`This draft import does not accept locale ${code}`);
    }
  }
  const inputs = await loadInputs(locales);
  const actorEmail = values["actor-email"]?.trim().toLowerCase();
  if (values.write) {
    assertProductionWriteAllowed(command);
    assertDataWritesNotFrozen(OPERATION);
    requireAdminIntentToken(INTENT, { allowLegacy: false });
    if (!actorEmail || !values["recovery-out"] || !/^[a-f0-9]{64}$/.test(values["confirm-plan"] ?? "")) {
      throw new Error("Writes require --actor-email, --recovery-out, and the dry-run --confirm-plan digest");
    }
  }
  const pool = new Pool({ connectionString: command.targetUrl, max: 1, connectionTimeoutMillis: POOL_ACQUISITION_TIMEOUT_MS });
  let journal: FileHandle | undefined;
  let commitStarted = false;
  let committed = false;
  try {
    const client = await pool.connect();
    try {
      await client.query(values.write ? "BEGIN ISOLATION LEVEL SERIALIZABLE" : "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      await setTransactionTimeouts(client);
      await client.query("SET LOCAL search_path = public, pg_catalog");
      const identity = (await client.query<{ database: string }>("SELECT current_database() AS database")).rows[0];
      const endpoint = { host: target.hostname, port: target.port || "5432", database: decodeURIComponent(target.pathname.slice(1)) };
      if (identity.database !== endpoint.database) throw new Error("Connected database does not match explicit target");
      if (values.write) await authorize(client, actorEmail!);
      const existing = (await client.query<Stored>(`SELECT ${columns} FROM "public"."translationGlossary" WHERE "locale" = ANY($1::text[])`, [locales])).rows
        .sort((a, b) => compare(key(a), key(b)));
      const existingKeys = new Set(existing.map(key));
      const missing = inputs.flatMap((input) => input.rows.filter((row) => !existingKeys.has(key(row))));
      const counts = inputs.map((input) => {
        const preserved = input.rows.filter((row) => existingKeys.has(key(row))).length;
        return { locale: input.locale, input: input.rows.length, existing: existing.filter((row) => row.locale === input.locale).length, preserved, insert: input.rows.length - preserved };
      });
      const plan = {
        operation: OPERATION,
        target: endpoint,
        deployment: command.deploymentFingerprint,
        files: inputs.map(({ locale, file, sha256, rows }) => ({ locale, file, sha256, count: rows.length })),
        existingDigest: digest(JSON.stringify(existing)),
        insertKeysDigest: digest(JSON.stringify(missing.map(key))),
        counts,
        totals: { input: inputs.reduce((sum, input) => sum + input.rows.length, 0), preserved: counts.reduce((sum, row) => sum + row.preserved, 0), insert: missing.length, update: 0, approve: 0, enqueue: 0 },
      };
      const planDigest = digest(JSON.stringify(plan));
      console.log(JSON.stringify({ mode: values.write ? "write-requested" : "dry-run", ...plan, planDigest }, null, 2));
      if (!values.write) {
        await client.query("ROLLBACK");
        return;
      }
      if (values["confirm-plan"] !== planDigest) throw new Error("Plan changed or was not reviewed. Run dry-run and review the new digest");
      journal = await open(values["recovery-out"]!, "wx", 0o600);
      const updatedAt = Date.now();
      // Persist candidate keys and exact postimages before any INSERT. A crash or
      // ambiguous COMMIT can then be reconciled without deleting later reviews.
      await appendJournal(journal, { state: "prepared", planDigest, plan, actorEmail, updatedAt, candidates: missing });
      const directory = await open(path.dirname(path.resolve(values["recovery-out"]!)), "r");
      try { await directory.sync(); } finally { await directory.close(); }
      assertProductionWriteAllowed(command);
      guardTarget(command.targetUrl, values["allow-remote"]);
      assertDataWritesNotFrozen(OPERATION);
      const inserted = missing.length === 0 ? [] : (await client.query<Stored>(
        `INSERT INTO "public"."translationGlossary" (${columns})
         SELECT locale, term, target, kind, 'draft', 'model', NULL, NULL, NULL, $5
         FROM UNNEST($1::text[], $2::text[], $3::text[], $4::text[]) AS draft(locale, term, target, kind)
         ON CONFLICT ("locale", "term") DO NOTHING
         RETURNING ${columns}`,
        [missing.map((row) => row.locale), missing.map((row) => row.term), missing.map((row) => row.target), missing.map((row) => row.kind), updatedAt],
      )).rows;
      if (inserted.length !== missing.length) throw new Error("Concurrent glossary insert changed the reviewed count; rolling back the entire import");
      await appendJournal(journal, { state: "inserted-uncommitted", rows: inserted });
      assertDataWritesNotFrozen(OPERATION);
      commitStarted = true;
      await client.query("COMMIT");
      committed = true;
      await appendJournal(journal, { state: "committed", inserted: inserted.length });
      console.log(JSON.stringify({ state: "committed", inserted: inserted.length, recoveryFile: path.resolve(values["recovery-out"]!), insertedKeys: inserted.map(({ locale, term }) => ({ locale, term })) }));
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      if (journal) {
        await appendJournal(journal, { state: committed ? "committed-report-failed" : commitStarted ? "commit-unknown" : "rolled-back" }).catch(() => {});
      }
      throw error;
    } finally {
      client.release();
    }
  } finally {
    await journal?.close();
    await pool.end();
  }
}

main().catch((error: unknown) => {
  // Connection errors may contain credentials supplied by the operator.
  const message = error instanceof Error ? error.message : String(error);
  console.error(message.replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, "[redacted Postgres URL]"));
  process.exitCode = 1;
});
