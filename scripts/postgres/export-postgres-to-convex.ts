/**
 * Ticket 22, post-write rollback: export a Postgres target back into a Convex
 * snapshot ZIP that `npx convex import <zip>` restores with `_id` and
 * `_creationTime` preserved. This is the reverse of
 * `import-convex-export.ts` and the instrument behind
 * `blocker:post-write-rollback`.
 *
 *   bun scripts/postgres/export-postgres-to-convex.ts [--target <url>] [--out <dir>]
 *       [--tables a,b] [--table-numbers <convex export zip|dir>] [--allow-remote] [--no-zip]
 *       [--import-into <deployment> --convex-env-file <file> [--allow-production]]
 *
 * `--import-into` runs `npx convex import --replace` on the finished ZIP with
 * the deploy key in `--convex-env-file` (`convexSnapshotImport.ts`). The
 * production deployment is refused unless `--allow-production` is present AND
 * CONVEX_REVERSE_IMPORT_CONFIRM=glad-minnow-656 (`convexTargetGuard.ts`).
 *
 * Layout written to <out>/snapshot/ and zipped to <out>/snapshot.zip, exactly
 * as `npx convex export` lays it out: README.md, `_tables/documents.jsonl`
 * (table name to table number), and per table `documents.jsonl` plus
 * `generated_schema.jsonl` containing `"uniform"` (the encoding in which
 * `$float`, `$integer` and `$bytes` wrappers travel inside the documents).
 *
 * Every row is rebuilt with `rowToDocument`, the same codec the forward
 * importer verifies against, so an imported row exports byte-for-byte.
 *
 * Ids. Convex refuses an `_id` that is not a canonical v6 id whose embedded
 * table number matches the target table (convex-backend
 * `ImportFacingModel::insert`). Imported rows carry such ids; rows minted on
 * Postgres (`documentStore.mintDocumentId`, runtime `mintConvexId`) do not.
 * The exporter therefore mints a valid replacement for every Postgres-born id
 * (table number from `_tables`) and rewrites every string equal to a replaced
 * id anywhere in any document, including nested jsonb, so references stay
 * intact. The mapping is written to id-remap.jsonl and counted per table in
 * the report; a document whose bytes changed for this reason is listed in
 * hashes.jsonl with both its source hash and its exported hash.
 *
 * Table numbers come from the data (every valid id in a table must agree) and,
 * for tables that hold no valid id, from the `--table-numbers` snapshot. A
 * non-empty table with no known number is an error, because there is no
 * number to mint ids for.
 *
 * Runtime-only tables with no Convex counterpart (`documentIds`,
 * `storageObjects`, `drizzle.__drizzle_migrations`) are skipped and named in
 * the report. There is no incremental mode: a rollback is a full re-import of
 * this snapshot with `--replace`.
 *
 * Read-only against Postgres, but guarded like the importer: a non-localhost
 * target needs `--allow-remote` and POSTGRES_IMPORT_CONFIRM=<host>.
 */

import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { tableNames, type TableName } from "../../lib/postgres/schema.generated";
import { documentHash, losslessSelectList, rowToDocument, type ConvexDocument } from "../../lib/postgres/convexDocumentCodec";
import { decodeConvexId, mintConvexIdForTable } from "../../lib/postgres/convexId";
import { guardTarget, resolveTarget } from "./targetGuard";
import { Connection, resilientPool } from "./resilientConnection";
import { guardConvexTarget } from "./convexTargetGuard";
import { importSnapshotIntoConvex } from "./convexSnapshotImport";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
/** Bytes one keyset page should move (pg_table_size average), bounded by rows. */
const PAGE_BYTES = 4 * 1024 * 1024;
const MIN_PAGE_ROWS = 10;
const MAX_PAGE_ROWS = 500;
/** Tables the Postgres runtime owns; Convex has no table for them. */
export const RUNTIME_ONLY_TABLES: ReadonlyArray<{ schema: string; table: string; role: string }> = [
  { schema: "public", table: "documentIds", role: "bare-id to table map for the runtime's db.get" },
  { schema: "public", table: "storageObjects", role: "Convex _storage identity map (ticket 11)" },
  { schema: "drizzle", table: "__drizzle_migrations", role: "drizzle-kit migration journal" },
];

const README = `# Welcome to your Convex snapshot export!

This ZIP file contains a snapshot of the tables in your Convex deployment.

Documents for each table are listed as lines of JSON in
<table_name>/documents.jsonl files.

For details on the format and how to use this snapshot with npx convex import,
check out [the docs](https://docs.convex.dev/database/import-export/export) or
ask us in [Discord](http://convex.dev/community).
`;

type Args = {
  target: string;
  out: string;
  tables: TableName[];
  tableNumbersSource: string | null;
  allowRemote: boolean;
  zip: boolean;
  importInto: { deployment: string; envFile: string; allowProduction: boolean } | null;
};

export type ExportTableReport = {
  table: TableName;
  tableNumber: number | null;
  rows: number;
  bytes: number;
  remappedIds: number;
  referencesRewritten: number;
  /** sha256 over the sorted per-document hashes; order independent, so two exports of the same content agree. */
  digest: string;
  elapsedMs: number;
};

export type ExportReport = {
  target: string;
  out: string;
  snapshotDirectory: string;
  zip: string | null;
  zipBytes: number | null;
  elapsedMs: number;
  exportMs: number;
  zipMs: number | null;
  tables: ExportTableReport[];
  tablesInSnapshotTable: number;
  totals: { rows: number; bytes: number; remappedIds: number; referencesRewritten: number };
  tableNumbers: { fromData: number; fromSource: number; source: string | null; unknown: string[] };
  skippedRuntimeTables: Array<{ schema: string; table: string; role: string; present: boolean; rows: number | null }>;
  unexportedTables: string[];
  incremental: string;
  files: { hashes: string; idRemap: string };
};

function parseArgs(argv: string[]): Args {
  const flag = (name: string) => argv.includes(`--${name}`);
  const value = (name: string) => {
    const index = argv.indexOf(`--${name}`);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const requested = value("tables")?.split(",").map((t) => t.trim()).filter(Boolean) ?? [];
  const tables = requested.length ? requested : [...tableNames];
  for (const table of tables) {
    if (!(tableNames as readonly string[]).includes(table)) throw new Error(`Unknown table ${table}`);
  }
  const source = value("table-numbers");
  const importInto = value("import-into");
  if (importInto && flag("no-zip")) throw new Error("--import-into needs the ZIP; drop --no-zip");
  if (importInto && !value("convex-env-file")) throw new Error("--import-into needs --convex-env-file <file with CONVEX_DEPLOY_KEY for that deployment>");
  return {
    target: resolveTarget(argv),
    out: path.resolve(value("out") ?? path.join(ROOT, "runs/postgres-import", `${new Date().toISOString().replace(/[:.]/g, "-")}-reverse-export`)),
    tables: [...tables].sort() as TableName[],
    tableNumbersSource: source ? path.resolve(source) : null,
    allowRemote: flag("allow-remote"),
    zip: !flag("no-zip"),
    importInto: importInto ? { deployment: importInto, envFile: path.resolve(value("convex-env-file")!), allowProduction: flag("allow-production") } : null,
  };
}

function quoteIdentifier(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

/** `_tables/documents.jsonl` of a Convex export ZIP or extracted directory: table name to table number. */
function readTableNumbers(source: string): Map<string, number> {
  let file: string;
  let cleanup: string | null = null;
  if (fs.statSync(source).isDirectory()) {
    file = path.join(source, "_tables", "documents.jsonl");
  } else {
    cleanup = fs.mkdtempSync(path.join(os.tmpdir(), "convex-tables-"));
    const result = spawnSync("unzip", ["-o", "-q", source, "_tables/documents.jsonl", "-d", cleanup], { stdio: "inherit" });
    if (result.status !== 0) throw new Error(`unzip failed for ${source}`);
    file = path.join(cleanup, "_tables", "documents.jsonl");
  }
  const numbers = new Map<string, number>();
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    if (!line.trim()) continue;
    const entry = JSON.parse(line) as { name: string; id: number };
    numbers.set(entry.name, entry.id);
  }
  if (cleanup) fs.rmSync(cleanup, { recursive: true, force: true });
  return numbers;
}

/** Replace every string value equal to a remapped id; returns the rewrite count. Keys are never ids. */
function rewriteIds(value: unknown, remap: Map<string, string>): { value: unknown; rewrites: number } {
  if (typeof value === "string") {
    const replacement = remap.get(value);
    return replacement === undefined ? { value, rewrites: 0 } : { value: replacement, rewrites: 1 };
  }
  if (Array.isArray(value)) {
    let rewrites = 0;
    const out = value.map((entry) => {
      const result = rewriteIds(entry, remap);
      rewrites += result.rewrites;
      return result.value;
    });
    return { value: out, rewrites };
  }
  if (value && typeof value === "object") {
    let rewrites = 0;
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      const result = rewriteIds(entry, remap);
      rewrites += result.rewrites;
      out[key] = result.value;
    }
    return { value: out, rewrites };
  }
  return { value, rewrites: 0 };
}

/**
 * Serialize in Convex's `export_json` encoding (`ConvexValue::from_clean_lossless`):
 * a JSON integer literal is read back as Int64, so every float64 that happens
 * to be integral is written with a trailing `.0`, as `npx convex export` does.
 * Int64 and bytes never appear as bare values here; the codec keeps them as
 * `$integer` / `$bytes` wrappers, which this encoding also accepts. Object
 * keys are sorted because Convex objects are ordered maps and a real export
 * writes them that way.
 */
export function stringifyExportDocument(value: unknown): string {
  if (value === null) return "null";
  switch (typeof value) {
    case "number": {
      if (!Number.isFinite(value)) throw new Error(`Non-finite number ${value} must travel as a $float wrapper`);
      const text = String(value);
      return /[.eE]/.test(text) ? text : `${text}.0`;
    }
    case "string":
    case "boolean":
      return JSON.stringify(value);
    case "object":
      if (Array.isArray(value)) return `[${value.map(stringifyExportDocument).join(",")}]`;
      return `{${Object.keys(value as Record<string, unknown>)
        .sort()
        .filter((key) => (value as Record<string, unknown>)[key] !== undefined)
        .map((key) => `${JSON.stringify(key)}:${stringifyExportDocument((value as Record<string, unknown>)[key])}`)
        .join(",")}}`;
    default:
      throw new Error(`Cannot export a ${typeof value}`);
  }
}

export async function exportPostgresToConvex(args: Args): Promise<ExportReport> {
  guardTarget(args.target, args.allowRemote);
  const started = performance.now();
  const snapshotDirectory = path.join(args.out, "snapshot");
  fs.rmSync(snapshotDirectory, { recursive: true, force: true });
  fs.mkdirSync(snapshotDirectory, { recursive: true });
  const hashesFile = path.join(args.out, "hashes.jsonl");
  const remapFile = path.join(args.out, "id-remap.jsonl");
  // Synchronous fd writes: under Bun a WriteStream that returns false from
  // write() does not reliably emit 'drain', which stalled a WAN export mid-table.
  const hashesFd = fs.openSync(hashesFile, "w");
  const remapFd = fs.openSync(remapFile, "w");

  // Same replay contract as the importer: keyset pages are idempotent, so a
  // dropped or stalled socket (the workstation uplink cuts sustained
  // transfers) replays the page on a fresh client.
  const pool = resilientPool(args.target);
  const conn = new Connection(pool);
  try {
    // Skipped runtime tables and anything else in the database that is not a Convex table.
    const present = await conn.run("tables", (client) =>
      client.query<{ table_schema: string; table_name: string }>(
        "SELECT table_schema, table_name FROM information_schema.tables WHERE table_type = 'BASE TABLE' AND table_schema NOT IN ('pg_catalog', 'information_schema')",
      ),
    );
    const skippedRuntimeTables = [] as ExportReport["skippedRuntimeTables"];
    for (const runtime of RUNTIME_ONLY_TABLES) {
      const isPresent = present.rows.some((row) => row.table_schema === runtime.schema && row.table_name === runtime.table);
      const rows = isPresent ? (await conn.run(`${runtime.table} count`, (client) => client.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${quoteIdentifier(runtime.schema)}.${quoteIdentifier(runtime.table)}`))).rows[0].n : null;
      skippedRuntimeTables.push({ ...runtime, present: isPresent, rows });
    }
    const unexportedTables = present.rows
      .filter((row) => !(tableNames as readonly string[]).includes(row.table_name) && !RUNTIME_ONLY_TABLES.some((r) => r.schema === row.table_schema && r.table === row.table_name))
      .map((row) => `${row.table_schema}.${row.table_name}`)
      .sort();

    // Pass 1: classify ids and learn table numbers from the data.
    const tableNumbers = new Map<string, number>();
    const knownIds = new Map<TableName, Set<string>>();
    const foreignIds = new Map<TableName, string[]>();
    for (const table of args.tables) {
      const ids = await conn.run(`${table} ids`, (client) => client.query<{ _id: string }>(`SELECT "_id" FROM ${quoteIdentifier(table)}`));
      const seen = new Set<string>();
      const foreign: string[] = [];
      for (const { _id } of ids.rows) {
        seen.add(_id);
        const decoded = decodeConvexId(_id);
        if (!decoded) {
          foreign.push(_id);
          continue;
        }
        const known = tableNumbers.get(table);
        if (known === undefined) tableNumbers.set(table, decoded.tableNumber);
        else if (known !== decoded.tableNumber) {
          throw new Error(`${table} holds Convex ids from two table numbers (${known} and ${decoded.tableNumber}); the deployment cannot import both`);
        }
      }
      knownIds.set(table, seen);
      foreignIds.set(table, foreign);
    }
    const fromData = tableNumbers.size;
    let fromSource = 0;
    if (args.tableNumbersSource) {
      for (const [table, number] of readTableNumbers(args.tableNumbersSource)) {
        if (!(tableNames as readonly string[]).includes(table)) continue;
        const known = tableNumbers.get(table);
        if (known === undefined) {
          tableNumbers.set(table, number);
          fromSource += 1;
        } else if (known !== number) {
          throw new Error(`${table}: data says table number ${known}, ${args.tableNumbersSource} says ${number}`);
        }
      }
    }
    const unknown = args.tables.filter((table) => !tableNumbers.has(table));
    const blocked = unknown.filter((table) => (knownIds.get(table)?.size ?? 0) > 0);
    if (blocked.length) {
      throw new Error(`No table number for non-empty ${blocked.join(", ")}; pass --table-numbers <convex export zip> so their ids can be minted`);
    }

    // Mint replacements for Postgres-born ids.
    const remap = new Map<string, string>();
    for (const table of args.tables) {
      const number = tableNumbers.get(table);
      const seen = knownIds.get(table)!;
      for (const foreign of foreignIds.get(table) ?? []) {
        let minted = mintConvexIdForTable(number!);
        while (seen.has(minted) || remap.has(minted)) minted = mintConvexIdForTable(number!);
        seen.add(minted);
        remap.set(foreign, minted);
        fs.writeSync(remapFd, `${JSON.stringify({ table, from: foreign, to: minted })}\n`);
      }
    }

    // Pass 2: stream every table into <table>/documents.jsonl.
    const reports: ExportTableReport[] = [];
    for (const table of args.tables) {
      const tableStarted = performance.now();
      const directory = path.join(snapshotDirectory, table);
      fs.mkdirSync(directory, { recursive: true });
      fs.writeFileSync(path.join(directory, "generated_schema.jsonl"), '"uniform"\n');
      const outFd = fs.openSync(path.join(directory, "documents.jsonl"), "w");
      const documentHashes: string[] = [];
      let rows = 0;
      let bytes = 0;
      let remappedIds = 0;
      let referencesRewritten = 0;
      // Pages are sized so one statement moves about PAGE_BYTES: articleSources
      // rows run to 1 MB, changelog rows to a few KB, and a WAN statement must
      // finish well inside QUERY_TIMEOUT_MS.
      const relation = await conn.run(`${table} size`, (client) => client.query<{ bytes: string }>(`SELECT pg_table_size($1::regclass)::text AS bytes`, [quoteIdentifier(table)]));
      const total = knownIds.get(table)!.size;
      const averageRowBytes = total ? Number(relation.rows[0].bytes) / total : 0;
      const pageRows = Math.max(MIN_PAGE_ROWS, Math.min(MAX_PAGE_ROWS, Math.floor(PAGE_BYTES / Math.max(1, averageRowBytes))));
      let cursor = "";
      for (;;) {
        const page = await conn.run(`${table} page`, (client) =>
          client.query(`SELECT ${losslessSelectList(table)} FROM ${quoteIdentifier(table)} WHERE "_id" > $1 ORDER BY "_id" LIMIT ${pageRows}`, [cursor]),
        );
        if (page.rows.length === 0) break;
        for (const row of page.rows) {
          cursor = String(row._id);
          const source = rowToDocument(table, row);
          let document = source;
          let sourceHash: string | null = null;
          if (remap.size) {
            const rewritten = rewriteIds(source, remap);
            if (rewritten.rewrites > 0) {
              sourceHash = documentHash(source);
              document = rewritten.value as ConvexDocument;
              if (remap.has(cursor)) remappedIds += 1;
              referencesRewritten += rewritten.rewrites - (remap.has(cursor) ? 1 : 0);
            }
          }
          const line = stringifyExportDocument(document);
          fs.writeSync(outFd, `${line}\n`);
          const hash = documentHash(document);
          documentHashes.push(hash);
          fs.writeSync(hashesFd, `${JSON.stringify(sourceHash ? { table, id: document._id, hash, sourceId: cursor, sourceHash } : { table, id: document._id, hash })}\n`);
          rows += 1;
          bytes += Buffer.byteLength(line) + 1;
        }
        if (page.rows.length < pageRows) break;
      }
      fs.closeSync(outFd);
      const digest = createHash("sha256").update(documentHashes.sort().join("\n")).digest("hex");
      const report: ExportTableReport = {
        table,
        tableNumber: tableNumbers.get(table) ?? null,
        rows,
        bytes,
        remappedIds,
        referencesRewritten,
        digest,
        elapsedMs: Math.round(performance.now() - tableStarted),
      };
      reports.push(report);
      console.log(`${table.padEnd(44)} rows=${rows} bytes=${bytes} remapped=${remappedIds} refs=${referencesRewritten} ${report.elapsedMs}ms`);
    }

    // `_tables/documents.jsonl` in table-number order, README as the CLI writes it.
    fs.mkdirSync(path.join(snapshotDirectory, "_tables"), { recursive: true });
    const numbered = args.tables.filter((table) => tableNumbers.has(table)).sort((a, b) => tableNumbers.get(a)! - tableNumbers.get(b)!);
    fs.writeFileSync(path.join(snapshotDirectory, "_tables", "documents.jsonl"), numbered.map((table) => `${JSON.stringify({ name: table, id: tableNumbers.get(table) })}\n`).join(""));
    fs.writeFileSync(path.join(snapshotDirectory, "README.md"), README);
    const exportMs = Math.round(performance.now() - started);

    let zip: string | null = null;
    let zipBytes: number | null = null;
    let zipMs: number | null = null;
    if (args.zip) {
      const zipStarted = performance.now();
      zip = path.join(args.out, "snapshot.zip");
      fs.rmSync(zip, { force: true });
      // -D: no directory entries, matching the CLI's own ZIPs; paths are relative to the snapshot root.
      const result = spawnSync("zip", ["-q", "-r", "-D", zip, "."], { cwd: snapshotDirectory, stdio: "inherit" });
      if (result.status !== 0) throw new Error(`zip failed with status ${result.status}`);
      zipBytes = fs.statSync(zip).size;
      zipMs = Math.round(performance.now() - zipStarted);
    }

    const report: ExportReport = {
      target: args.target.replace(/\/\/[^@]*@/, "//<redacted>@"),
      out: args.out,
      snapshotDirectory,
      zip,
      zipBytes,
      elapsedMs: Math.round(performance.now() - started),
      exportMs,
      zipMs,
      tables: reports,
      tablesInSnapshotTable: numbered.length,
      totals: {
        rows: reports.reduce((n, r) => n + r.rows, 0),
        bytes: reports.reduce((n, r) => n + r.bytes, 0),
        remappedIds: reports.reduce((n, r) => n + r.remappedIds, 0),
        referencesRewritten: reports.reduce((n, r) => n + r.referencesRewritten, 0),
      },
      tableNumbers: { fromData, fromSource, source: args.tableNumbersSource, unknown },
      skippedRuntimeTables,
      unexportedTables,
      incremental: "not implemented: a rollback is a full re-import of this snapshot with `npx convex import --replace`; Convex table replacement is atomic per import",
      files: { hashes: hashesFile, idRemap: remapFile },
    };
    fs.writeFileSync(path.join(args.out, "report.json"), JSON.stringify(report, null, 2));
    return report;
  } finally {
    fs.closeSync(hashesFd);
    fs.closeSync(remapFd);
    conn.release();
    await pool.end();
  }
}

if (import.meta.main) {
  const args = parseArgs(process.argv.slice(2));
  // The Convex gate runs before any Postgres read so a refused target costs nothing.
  if (args.importInto) guardConvexTarget(args.importInto.deployment, args.importInto.allowProduction);
  exportPostgresToConvex(args)
    .then((report) => {
      console.log(`\nReport: ${path.relative(ROOT, path.join(report.out, "report.json"))}`);
      console.log(JSON.stringify({ ...report.totals, tables: report.tables.length, zipBytes: report.zipBytes, exportMs: report.exportMs, zipMs: report.zipMs }));
      if (!args.importInto) return;
      const imported = importSnapshotIntoConvex({ zip: report.zip!, deployment: args.importInto.deployment, envFile: args.importInto.envFile, allowProduction: args.importInto.allowProduction, cwd: ROOT });
      console.log(`${imported.stdout}${imported.stderr}`.trim().split("\n").slice(-6).join("\n"));
      console.log(JSON.stringify({ convexImport: { deployment: args.importInto.deployment, status: imported.status, ms: imported.ms } }));
      fs.writeFileSync(path.join(report.out, "convex-import.json"), JSON.stringify({ deployment: args.importInto.deployment, status: imported.status, ms: imported.ms, stdout: imported.stdout, stderr: imported.stderr }, null, 2));
      if (imported.status !== 0) process.exit(1);
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    });
}
