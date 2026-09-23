/**
 * Localization release preflight. Read-only checks that a runtime Postgres
 * credential and a staged build environment match what the release needs.
 *
 *   DOSEWIKI_BUILD_SURFACE=editor|public npm run deploy:localization-preflight -- \
 *     --target <runtime-postgres-url> [--allow-remote]
 *
 * The target is the runtime credential under review and must be named with
 * `--target` or TARGET_POSTGRES_URL; the package entry loads no env file, so
 * the app URLs never select it. Non-loopback hosts need `--allow-remote` and
 * POSTGRES_IMPORT_CONFIRM=<hostname>. Every statement runs inside one
 * READ ONLY transaction that is rolled back; nothing is written.
 *
 * Checks, each derived from its owner rather than restated here:
 *   environment  `lib/postgres/runtime/deploymentEnv.ts` (required, writer, and
 *                intent token variables per surface)
 *   migrations   the migration journal: every journal entry is applied with
 *                its SQL hash when the ledger is readable, and every table and
 *                column of the latest snapshot exists
 *   privileges   the runtime schema (`schema.generated.ts` + `schema.runtime.ts`):
 *                the editor holds a reviewed grant on every table; the public
 *                reader holds its create-only intake grants
 *
 * Output is one JSON line per check; connection errors are reduced to a
 * label and SQLSTATE so no credential or host reaches the log.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getTableName, isTable } from "drizzle-orm";
import pg from "pg";
import * as generatedSchema from "../../lib/postgres/schema.generated";
import * as runtimeSchema from "../../lib/postgres/schema.runtime";
import { adminIntentEnvVars, inspectDeploymentEnv } from "../../lib/postgres/runtime/deploymentEnv";
import { replicationMediaBaseUrl } from "../../server/lib/replicationUrls";
import { getAdminIntentEnvVar } from "../../server/lib/adminIntentTokens";
import { guardTarget, resolveTarget } from "../postgres/targetGuard";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const MIGRATIONS = path.join(ROOT, "lib", "postgres", "migrations");

export type Surface = "editor" | "public";
type Privilege = "SELECT" | "INSERT" | "UPDATE" | "DELETE";
type Env = Record<string, string | undefined>;

const TABLE_PRIVILEGES = ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"] as const;
const FULL_DML: Privilege[] = ["SELECT", "INSERT", "UPDATE", "DELETE"];

/** Every table the application runtime reads or writes. */
export function runtimeTableNames(): string[] {
  const names = new Set<string>();
  for (const value of [...Object.values(generatedSchema), ...Object.values(runtimeSchema)]) {
    if (isTable(value)) names.add(getTableName(value));
  }
  return [...names].sort();
}

/**
 * Editor grants narrower than full DML. Everything else in the runtime schema
 * gets SELECT, INSERT, UPDATE, and DELETE. The editor matrix is exact: an
 * unexpected grant fails, which keeps the append-only tables append-only.
 */
const EDITOR_EXCEPTIONS: Record<string, Privilege[]> = {
  translationGlossary: ["SELECT", "INSERT", "UPDATE"],
  translationGlossaryTerms: ["SELECT", "INSERT", "UPDATE"],
  translationSegments: ["SELECT", "INSERT", "UPDATE"],
  translationJobs: ["SELECT", "INSERT", "UPDATE"],
  // Review and segment history are append-only; feedback is triaged, never deleted.
  translationReviewEntries: ["SELECT", "INSERT", "UPDATE"],
  translationReviewHistory: ["SELECT", "INSERT"],
  translationSegmentHistory: ["SELECT", "INSERT"],
  glossaryFeedback: ["SELECT", "INSERT", "UPDATE"],
  glossaryReactionEvents: ["SELECT", "INSERT"],
  localizedPublicationIndexState: ["SELECT", "UPDATE"],
  publicCachePublications: ["SELECT", "INSERT", "UPDATE"],
  // Document deletion also removes its ID mapping; mappings never change.
  documentIds: ["SELECT", "INSERT", "DELETE"],
};

/** Public reader grants required for create-only intake, glossary reads and glossary feedback; other grants are not checked. */
const PUBLIC_GRANTS: Record<string, Privilege[]> = {
  articleFeedback: ["SELECT", "INSERT"],
  siteFeedback: ["SELECT", "INSERT"],
  tripReportSubmissions: ["SELECT", "INSERT"],
  mailingListSubscribers: ["SELECT", "INSERT"],
  subscribeRateLimitBuckets: FULL_DML,
  translationGlossary: ["SELECT"],
  translationGlossaryTerms: ["SELECT"],
  translationReviewEntries: ["SELECT"],
  glossaryFeedback: ["SELECT", "INSERT"],
  glossaryReactionEvents: ["SELECT", "INSERT"],
  documentIds: ["SELECT", "INSERT"],
};

export function privilegeMatrix(surface: Surface): Record<string, Privilege[]> {
  if (surface === "public") return { ...PUBLIC_GRANTS };
  return Object.fromEntries(runtimeTableNames().map((table) => [table, EDITOR_EXCEPTIONS[table] ?? FULL_DML]));
}

type JournalEntry = { idx: number; tag: string; when: number };

function journalEntries(): JournalEntry[] {
  return (JSON.parse(fs.readFileSync(path.join(MIGRATIONS, "meta", "_journal.json"), "utf8")) as { entries: JournalEntry[] }).entries;
}

/** What drizzle-kit records per applied migration: the SQL file's SHA-256 and the journal timestamp. */
export function migrationLedger(): Array<{ tag: string; when: number; hash: string }> {
  return journalEntries().map(({ tag, when }) => ({
    tag,
    when,
    hash: createHash("sha256").update(fs.readFileSync(path.join(MIGRATIONS, `${tag}.sql`), "utf8")).digest("hex"),
  }));
}

/** Tables and columns of the latest migration snapshot, keyed by table name. */
export function snapshotColumns(): Record<string, string[]> {
  const latest = journalEntries().reduce((last, entry) => (entry.idx > last.idx ? entry : last));
  const snapshot = JSON.parse(
    fs.readFileSync(path.join(MIGRATIONS, "meta", `${String(latest.idx).padStart(4, "0")}_snapshot.json`), "utf8"),
  ) as { tables: Record<string, { name: string; schema: string; columns: Record<string, { name: string }> }> };
  return Object.fromEntries(
    Object.values(snapshot.tables)
      .filter((table) => table.schema === "public" || table.schema === "")
      .map((table) => [table.name, Object.values(table.columns).map((column) => column.name)]),
  );
}

/** Deployment env contract failures for one surface. Values are never echoed. */
export function environmentFailures(surface: Surface, env: Env): string[] {
  const failures: string[] = [];
  if (env.DATA_BACKEND !== "postgres") failures.push("DATA_BACKEND must be postgres");
  const contract = inspectDeploymentEnv(env);
  if (contract.missingRequired.length) failures.push(`Missing required deployment variables: ${contract.missingRequired.join(", ")}`);
  else if (replicationMediaBaseUrl(env) === null) failures.push("REPLICATION_MEDIA_BASE_URL must be an HTTPS origin");
  if (surface === "editor" && contract.missingWrite.length) {
    failures.push(`Missing editor writer variables: ${contract.missingWrite.join(", ")}`);
  }
  if (surface === "public") {
    // Public DoseWiki may hold only the create-only intake token. Unregistered
    // scoped token names are refused too, so a new intent cannot slip through.
    const intake = getAdminIntentEnvVar("publicIntakeCreate");
    const scoped = Object.keys(env).filter((name) => name.startsWith("DATA_ADMIN_TOKEN_"));
    const forbidden = new Set(["DATA_ADMIN_KEY", ...adminIntentEnvVars(), ...scoped]);
    forbidden.delete(intake ?? "");
    for (const name of [...forbidden].sort()) {
      if (env[name]?.trim()) failures.push(`Public environment carries forbidden credential variable ${name}`);
    }
  }
  return failures;
}

function surfaceFrom(argv: string[], env: Env): Surface {
  const index = argv.indexOf("--surface");
  const surface = index >= 0 ? argv[index + 1] : env.DOSEWIKI_BUILD_SURFACE;
  if (surface !== "editor" && surface !== "public") throw new Error("PREFLIGHT_SURFACE_REQUIRED");
  return surface;
}

const report = (value: unknown) => console.log(JSON.stringify(value));

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  // Target first: the explicit-target refusal names its missing input.
  const target = resolveTarget(argv);
  guardTarget(target, argv.includes("--allow-remote"));
  const surface = surfaceFrom(argv, process.env);
  const failures = environmentFailures(surface, process.env);
  const client = new pg.Client({ connectionString: target, connectionTimeoutMillis: 15_000 });
  let began = false;
  try {
    await client.connect();
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    began = true;
    await client.query("SET LOCAL statement_timeout = '20s'");
    const identity = (await client.query("SELECT current_user, session_user, current_database() AS database")).rows[0];
    if (identity.database !== decodeURIComponent(new URL(target).pathname.slice(1))) failures.push("Connected database differs from the explicit target");
    report({ check: "language-runtime-identity", surface, ...identity });

    const roles = (await client.query("SELECT pg_has_role(current_user, 'pg_write_all_data', 'MEMBER') AS write_all")).rows[0];
    if (roles.write_all) failures.push("Unexpected pg_write_all_data membership");
    const schema = (await client.query("SELECT has_schema_privilege(current_user, 'public', 'USAGE') AS usage, has_schema_privilege(current_user, 'public', 'CREATE') AS create")).rows[0];
    if (!schema.usage || schema.create) failures.push("Runtime schema privilege mismatch");

    // Migrations: the latest snapshot's structure, then the applied ledger when this credential can read it.
    const structure: Array<{ table: string; missing: string[] }> = [];
    for (const [table, expected] of Object.entries(snapshotColumns())) {
      const actual = new Set((await client.query(
        "SELECT a.attname FROM pg_attribute a WHERE a.attrelid = to_regclass($1) AND a.attnum > 0 AND NOT a.attisdropped",
        [`public."${table}"`],
      )).rows.map((row) => row.attname as string));
      const missing = expected.filter((column) => !actual.has(column));
      if (missing.length) failures.push(`Schema lacks ${table} columns from the latest migration snapshot: ${missing.join(", ")}`);
      structure.push({ table, missing });
    }
    const ledger = migrationLedger();
    const readable = (await client.query(
      "SELECT coalesce((SELECT has_schema_privilege(current_user, oid, 'USAGE') FROM pg_namespace WHERE nspname = 'drizzle'), false) AS usage",
    )).rows[0].usage && (await client.query(
      "SELECT coalesce(has_table_privilege(current_user, to_regclass('drizzle.__drizzle_migrations'), 'SELECT'), false) AS allowed",
    )).rows[0].allowed;
    let applied: { unapplied: string[]; unknown: number } | null = null;
    if (readable) {
      const hashes = new Set((await client.query("SELECT hash FROM drizzle.__drizzle_migrations")).rows.map((row) => row.hash as string));
      const known = new Set(ledger.map(({ hash }) => hash));
      applied = {
        unapplied: ledger.filter(({ hash }) => !hashes.has(hash)).map(({ tag }) => tag),
        unknown: [...hashes].filter((hash) => !known.has(hash)).length,
      };
      if (applied.unapplied.length) failures.push(`Unapplied migrations: ${applied.unapplied.join(", ")}`);
      if (applied.unknown) failures.push(`${applied.unknown} applied migrations are absent from the repository journal`);
    }
    report({
      check: "language-migrations",
      journalEntries: ledger.length,
      structure: structure.filter(({ missing }) => missing.length),
      ledger: applied ?? "not readable by this credential; structure verified from the latest snapshot",
    });

    const matrix = privilegeMatrix(surface);
    const checks: Array<{ table: string; privileges: Record<string, boolean> }> = [];
    for (const [table, required] of Object.entries(matrix)) {
      const exists = (await client.query("SELECT to_regclass($1) IS NOT NULL AS present", [`public."${table}"`])).rows[0].present;
      if (!exists) {
        failures.push(`Missing relation ${table}`);
        continue;
      }
      const privileges: Record<string, boolean> = {};
      for (const privilege of TABLE_PRIVILEGES) {
        const allowed = (await client.query("SELECT has_table_privilege(current_user, $1, $2) AS allowed", [`public."${table}"`, privilege])).rows[0].allowed as boolean;
        privileges[privilege] = allowed;
        const expected = (required as readonly string[]).includes(privilege);
        if (expected && !allowed) failures.push(`Missing ${table} ${privilege}`);
        if (surface === "editor" && !expected && allowed) failures.push(`Unexpected ${table} ${privilege}`);
      }
      checks.push({ table, privileges });
    }
    report({ check: "language-runtime-table-privileges", checks });

    await client.query("ROLLBACK");
    began = false;
    report({ check: "language-runtime-preflight", ok: failures.length === 0, surface, failures });
    if (failures.length) process.exitCode = 1;
  } finally {
    if (began) await client.query("ROLLBACK").catch(() => {});
    await client.end().catch(() => {});
  }
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    // Connection and provider error messages can contain credentials or hosts;
    // only this script's own refusals are printed in full.
    const message = error instanceof Error ? error.message : "";
    const own = /^(?:PREFLIGHT_[A-Z_]+|Postgres target is required|--target requires|Refusing non-local target|POSTGRES_IMPORT_CONFIRM must equal)/.test(message);
    const code = (error as { code?: unknown } | null)?.code;
    report({
      check: "language-runtime-preflight",
      ok: false,
      label: own ? message : "PREFLIGHT_QUERY_FAILED",
      code: typeof code === "string" && /^[A-Z0-9_]{1,40}$/.test(code) ? code : undefined,
    });
    process.exitCode = 1;
  });
}
