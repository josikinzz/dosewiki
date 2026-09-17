/**
 * Rehearse a protected snapshot import.
 *
 * Loads a document snapshot ZIP (or its extracted directory) into Postgres through
 * the generated Drizzle schema, then reconciles counts, content hashes,
 * duplicate IDs, and reference edges. Resumable: rows upsert by `_id`, so a
 * rerun converges instead of duplicating.
 *
 *   bun scripts/postgres/import-document-snapshot.ts --export <zip|dir> [--target <url>]
 *       [--tables a,b] [--truncate] [--dry-run] [--skip-verify] [--allow-remote]
 *
 * Target defaults to the project-local cluster. Any non-localhost host is
 * refused unless `--allow-remote` is present AND POSTGRES_IMPORT_CONFIRM equals
 * that hostname, so a stray env var cannot point a rehearsal at PlanetScale.
 * The report lands in runs/postgres-import/<timestamp>/ (gitignored).
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { PoolClient } from "pg";
import { tableColumns, tableNames, tableReferences, type TableName } from "../../lib/postgres/schema.generated";
import { documentHash, documentToRow, losslessSelectList, rowToDocument, type DataDocument } from "../../lib/postgres/documentCodec";
import { guardTarget, resolveTarget } from "./targetGuard";
import { Connection, resilientPool } from "./resilientConnection";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const BATCH_ROWS = 500;
// Each batch is one statement and one replay unit; keep it small so a dropped
// upload loses little and articleSources documents (up to ~1 MB) fit alone.
const BATCH_BYTES = 1024 * 1024;

type Args = {
  exportPath: string;
  target: string;
  tables: TableName[];
  truncate: boolean;
  dryRun: boolean;
  verify: boolean;
  allowRemote: boolean;
};

type TableReport = {
  table: TableName;
  presentInExport: boolean;
  exportedRows: number;
  importedRows: number;
  rejectedRows: number;
  duplicateIds: number;
  unknownFields: Record<string, number>;
  storedRows: number | null;
  hashMismatches: number;
  elapsedMs: number;
};

type ReferenceReport = { table: string; column: string; references: string; dangling: number };

function parseArgs(argv: string[]): Args {
  const flag = (name: string) => argv.includes(`--${name}`);
  const value = (name: string) => {
    const index = argv.indexOf(`--${name}`);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const exportPath = value("export");
  if (!exportPath) throw new Error("--export <zip|dir> is required");
  const requested = value("tables")?.split(",").map((t) => t.trim()).filter(Boolean) ?? [];
  const tables = requested.length ? requested : [...tableNames];
  for (const table of tables) {
    if (!(table in tableColumns)) throw new Error(`Unknown table ${table}`);
  }
  return {
    exportPath: path.resolve(exportPath),
    target: resolveTarget(argv),
    tables: tables as TableName[],
    truncate: flag("truncate"),
    dryRun: flag("dry-run"),
    verify: !flag("skip-verify"),
    allowRemote: flag("allow-remote"),
  };
}

function resolveExportDirectory(exportPath: string): string {
  if (fs.statSync(exportPath).isDirectory()) return exportPath;
  const extracted = fs.mkdtempSync(path.join(os.tmpdir(), "document-snapshot-"));
  const result = spawnSync("unzip", ["-o", "-q", exportPath, "-d", extracted], { stdio: "inherit" });
  if (result.status !== 0) throw new Error(`unzip failed for ${exportPath}`);
  return extracted;
}

async function* readDocuments(file: string): AsyncGenerator<{ line: number; bytes: number; document: DataDocument }> {
  const reader = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
  let line = 0;
  for await (const text of reader) {
    line += 1;
    if (!text.trim()) continue;
    yield { line, bytes: text.length, document: JSON.parse(text) as DataDocument };
  }
}

function quoteIdentifier(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

async function flushBatch(conn: Connection | null, table: TableName, columns: string[], rows: unknown[][]): Promise<number> {
  if (rows.length === 0) return 0;
  if (!conn) return rows.length;
  const columnList = columns.map(quoteIdentifier).join(", ");
  const placeholders = rows
    .map((row, r) => `(${row.map((_, c) => `$${r * columns.length + c + 1}${tableColumns[table][columns[c]].kind === "jsonb" ? "::jsonb" : ""}`).join(", ")})`)
    .join(", ");
  const updates = columns.filter((c) => c !== "_id").map((c) => `${quoteIdentifier(c)} = EXCLUDED.${quoteIdentifier(c)}`).join(", ");
  const sql = `INSERT INTO ${quoteIdentifier(table)} (${columnList}) VALUES ${placeholders} ON CONFLICT ("_id") DO UPDATE SET ${updates}`;
  // `pg` stringifies numbers with String(), which turns -0 into "0"; Postgres float8 accepts the literal "-0".
  const parameters = rows.flat().map((value) => (typeof value === "number" && Object.is(value, -0) ? "-0" : value));
  const result = await conn.run(`${table} batch`, (client) => client.query(sql, parameters));
  return result.rowCount ?? 0;
}

async function importTable(
  conn: Connection | null,
  table: TableName,
  exportDirectory: string,
  rejects: fs.WriteStream,
  hashes: Map<string, string>,
): Promise<TableReport> {
  const started = performance.now();
  const file = path.join(exportDirectory, table, "documents.jsonl");
  const report: TableReport = {
    table,
    presentInExport: fs.existsSync(file),
    exportedRows: 0,
    importedRows: 0,
    rejectedRows: 0,
    duplicateIds: 0,
    unknownFields: {},
    storedRows: null,
    hashMismatches: 0,
    elapsedMs: 0,
  };
  if (!report.presentInExport) return report;

  const columns = Object.keys(tableColumns[table]);
  const seenIds = new Set<string>();
  let batch: unknown[][] = [];
  let batchBytes = 0;
  for await (const { line, bytes, document } of readDocuments(file)) {
    report.exportedRows += 1;
    const id = document._id;
    if (typeof id !== "string") {
      report.rejectedRows += 1;
      rejects.write(`${JSON.stringify({ table, line, reason: "missing _id" })}\n`);
      continue;
    }
    if (seenIds.has(id)) {
      report.duplicateIds += 1;
      rejects.write(`${JSON.stringify({ table, line, id, reason: "duplicate _id" })}\n`);
      continue;
    }
    seenIds.add(id);
    let encoded;
    try {
      encoded = documentToRow(table, document);
    } catch (error) {
      report.rejectedRows += 1;
      rejects.write(`${JSON.stringify({ table, line, id, reason: error instanceof Error ? error.message : String(error) })}\n`);
      continue;
    }
    for (const field of encoded.unknownFields) report.unknownFields[field] = (report.unknownFields[field] ?? 0) + 1;
    if (encoded.unknownFields.length) {
      report.rejectedRows += 1;
      rejects.write(`${JSON.stringify({ table, line, id, reason: `unknown fields: ${encoded.unknownFields.join(",")}` })}\n`);
      continue;
    }
    hashes.set(id, documentHash(document));
    batch.push(columns.map((column) => encoded.row[column]));
    batchBytes += bytes;
    if (batch.length >= BATCH_ROWS || batchBytes >= BATCH_BYTES) {
      report.importedRows += await flushBatch(conn, table, columns, batch);
      batch = [];
      batchBytes = 0;
    }
  }
  report.importedRows += await flushBatch(conn, table, columns, batch);
  // The runtime resolves `db.get(id)` through `documentIds`; an import that
  // skipped it would leave every imported row unreachable by bare id.
  if (conn) {
    await conn.run("documentIds", (client) =>
      client.query(
        `INSERT INTO "documentIds" ("_id", "table") SELECT "_id", $1 FROM ${quoteIdentifier(table)} ON CONFLICT ("_id") DO UPDATE SET "table" = EXCLUDED."table"`,
        [table],
      ),
    );
  }
  report.elapsedMs = Math.round(performance.now() - started);
  return report;
}

async function verifyTable(client: PoolClient, table: TableName, hashes: Map<string, string>, mismatches: fs.WriteStream): Promise<{ stored: number; mismatched: number }> {
  const count = await client.query(`SELECT count(*)::int AS n FROM ${quoteIdentifier(table)}`);
  const stored: number = count.rows[0].n;
  let mismatched = 0;
  const cursor = await client.query(`SELECT ${losslessSelectList(table)} FROM ${quoteIdentifier(table)}`);
  for (const row of cursor.rows) {
    const id = String(row._id);
    const expected = hashes.get(id);
    if (expected === undefined) continue;
    const actual = documentHash(rowToDocument(table, row));
    if (actual !== expected) {
      mismatched += 1;
      mismatches.write(`${JSON.stringify({ table, id, expected, actual })}\n`);
    }
  }
  return { stored, mismatched };
}

async function checkReferences(client: PoolClient, tables: Set<string>): Promise<ReferenceReport[]> {
  const reports: ReferenceReport[] = [];
  for (const [table, edges] of Object.entries(tableReferences)) {
    if (!tables.has(table)) continue;
    for (const [column, referenced] of Object.entries(edges)) {
      if (referenced === "_storage" || !tables.has(referenced)) continue;
      const result = await client.query(
        `SELECT count(*)::int AS n FROM ${quoteIdentifier(table)} s LEFT JOIN ${quoteIdentifier(referenced)} r ON r."_id" = s.${quoteIdentifier(column)} WHERE s.${quoteIdentifier(column)} IS NOT NULL AND r."_id" IS NULL`,
      );
      reports.push({ table, column, references: referenced, dangling: result.rows[0].n });
    }
  }
  return reports;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  guardTarget(args.target, args.allowRemote);
  const exportDirectory = resolveExportDirectory(args.exportPath);
  const runDirectory = path.join(ROOT, "runs/postgres-import", new Date().toISOString().replace(/[:.]/g, "-"));
  fs.mkdirSync(runDirectory, { recursive: true });
  const rejects = fs.createWriteStream(path.join(runDirectory, "rejects.jsonl"));
  const mismatches = fs.createWriteStream(path.join(runDirectory, "hash-mismatches.jsonl"));

  const pool = args.dryRun ? null : resilientPool(args.target);
  const conn = pool ? new Connection(pool) : null;
  const started = performance.now();
  const reports: TableReport[] = [];
  try {
    for (const table of args.tables) {
      const hashes = new Map<string, string>();
      if (conn && args.truncate) await conn.run(`${table} truncate`, (client) => client.query(`TRUNCATE ${quoteIdentifier(table)}`));
      const report = await importTable(conn, table, exportDirectory, rejects, hashes);
      if (conn && args.verify && report.presentInExport) {
        const verified = await conn.run(`${table} verify`, (client) => verifyTable(client, table, hashes, mismatches));
        report.storedRows = verified.stored;
        report.hashMismatches = verified.mismatched;
      }
      reports.push(report);
      console.log(
        `${table.padEnd(44)} export=${report.exportedRows} imported=${report.importedRows} rejected=${report.rejectedRows} stored=${report.storedRows ?? "-"} mismatches=${report.hashMismatches} ${report.elapsedMs}ms`,
      );
    }
    const references = conn ? await conn.run("references", (client) => checkReferences(client, new Set(args.tables))) : [];
    const summary = {
      target: args.target.replace(/\/\/[^@]*@/, "//<redacted>@"),
      exportPath: args.exportPath,
      dryRun: args.dryRun,
      truncate: args.truncate,
      elapsedMs: Math.round(performance.now() - started),
      tables: reports,
      absentTables: reports.filter((r) => !r.presentInExport).map((r) => r.table),
      totals: {
        exported: reports.reduce((n, r) => n + r.exportedRows, 0),
        imported: reports.reduce((n, r) => n + r.importedRows, 0),
        rejected: reports.reduce((n, r) => n + r.rejectedRows, 0),
        duplicateIds: reports.reduce((n, r) => n + r.duplicateIds, 0),
        hashMismatches: reports.reduce((n, r) => n + r.hashMismatches, 0),
        danglingReferences: references.reduce((n, r) => n + r.dangling, 0),
      },
      references,
    };
    fs.writeFileSync(path.join(runDirectory, "report.json"), JSON.stringify(summary, null, 2));
    console.log(`\nReport: ${path.relative(ROOT, runDirectory)}/report.json`);
    console.log(JSON.stringify(summary.totals));
    const clean = summary.totals.rejected === 0 && summary.totals.duplicateIds === 0 && summary.totals.hashMismatches === 0 && summary.totals.danglingReferences === 0;
    process.exitCode = clean ? 0 : 1;
  } finally {
    rejects.end();
    mismatches.end();
    conn?.release();
    await pool?.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
