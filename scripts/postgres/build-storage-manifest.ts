/**
 * Ticket 11: enumerate every Convex `_storage` id referenced by the rows of a
 * Postgres target and write the copy manifest that the (human-gated) R2 copy
 * would consume. Reads only; no Convex network calls; no bytes are touched.
 *
 *   bun scripts/postgres/build-storage-manifest.ts --target <postgres url> [--out <file>] [--allow-remote --read-only]
 *
 * A non-local target requires BOTH `--allow-remote` and `--read-only`
 * (the local-only gate from `targetGuard.ts`, extended for a read: no
 * `POSTGRES_IMPORT_CONFIRM` because nothing is written). `--read-only` opens
 * the pool with `-c default_transaction_read_only=on`, so even a bug in this
 * script cannot write to the target; the setting is asserted after connect.
 *
 * Fields scanned (all of them are reported in the manifest's `scanned_fields`):
 *   direct  - `tableReferences` edges into `_storage` (typed `v.id("_storage")`)
 *             plus the plain-string fields the schema documents as storage ids
 *             (`replications.*_storage_id`, `contributorProfiles.avatarStorageId`).
 *   indirect - jsonb before/after snapshots that tables.md marks "indirect":
 *             walked for the same key names. Those ids are listed but flagged
 *             `only_indirect` when no live row references them.
 * `subjectiveEffects.social_media_image` is a URL (editor validates a link),
 * not a storage id, and is reported as excluded.
 *
 * Output: `runs/postgres-import/<timestamp>-storage/manifest.json` by default.
 * `content_type`, `size`, and `sha256` stay null until
 * `scripts/postgres/verify-storage-manifest.ts --export <dir>` fills them.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { isPlaceholderStorageId, isValidR2Key } from "../../convex/lib/replicationUrls";
import { tableColumns, tableReferences, type TableName } from "../../lib/postgres/schema.generated";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const TABLES_MD = path.join(ROOT, "notes-and-plans/plans/convex-to-planetscale/inventory/tables.md");

export const R2_KEY_PREFIX = "convex-storage/";
const PAGE = 1000;
/** Convex document/storage ids: 32 lowercase base32 characters. */
const CONVEX_ID = /^[0-9a-z]{32}$/;

/**
 * Plain-string columns the schema documents as Convex storage ids, with the
 * sibling column that already holds an R2 locator and, where the resolver has
 * one (`convex/lib/replicationUrls.ts:76,90`, `contributorProfileMaterialization.ts:19`), the direct-URL fallback.
 */
const SCHEMA_STRING_FIELDS: Array<{ table: TableName; field: string; r2Field: string; urlField?: string; doc: string }> = [
  { table: "replications", field: "storage_id", r2Field: "r2_key", urlField: "url", doc: "convex/lib/effectMediaSchemaValidators.ts:154" },
  { table: "replications", field: "thumbnail_storage_id", r2Field: "thumbnail_r2_key", urlField: "thumbnail_url", doc: "convex/lib/effectMediaSchemaValidators.ts:173" },
  { table: "replications", field: "preview_storage_id", r2Field: "preview_r2_key", doc: "convex/lib/effectMediaSchemaValidators.ts:180" },
  { table: "replications", field: "motion_storage_id", r2Field: "motion_r2_key", doc: "convex/lib/effectMediaSchemaValidators.ts:186" },
  { table: "replications", field: "motion_poster_storage_id", r2Field: "motion_poster_r2_key", doc: "convex/lib/effectMediaSchemaValidators.ts:188" },
  { table: "contributorProfiles", field: "avatarStorageId", r2Field: "avatarR2Key", urlField: "avatarUrl", doc: "convex/schema.ts:197" },
];
/** `v.id("_storage")` columns carry `r2_key` and `public_url` siblings (`replicationIdentitySocialValidators.ts:85,104`). */
const TYPED_FIELD_SIBLINGS = { r2Field: "r2_key", urlField: "public_url" } as const;
/** Key names that hold storage ids inside jsonb snapshots. */
const EMBEDDED_KEYS: Record<string, true> = { storage_id: true, thumbnail_storage_id: true, preview_storage_id: true, motion_storage_id: true, motion_poster_storage_id: true, avatarStorageId: true };
const EXCLUDED_FIELDS = [
  { table: "subjectiveEffects", field: "social_media_image", reason: "URL, not a storage id (src/features/effects/editing/effectEditorModel.ts:12 validates a link)" },
];

type PrivacyClass = "public" | "editorial" | "private-personal" | "credential";
type TableMeta = { privacy: PrivacyClass; privacyNote: string; storageColumn: string };

export type ScannedField = { table: string; field: string; kind: "direct" | "indirect-jsonb"; source: string; privacy: PrivacyClass; r2Field?: string; urlField?: string };
export type ManifestReference = {
  table: string;
  field: string;
  row_id: string;
  kind: "direct" | "indirect-jsonb";
  privacy: PrivacyClass;
  existing_r2_key: string | null;
  existing_public_url: string | null;
  /** Indirect only: the jsonb column and the JSON path inside it. */
  path?: string;
};
export type ManifestEntry = {
  storage_id: string;
  r2_key: string;
  well_formed: boolean;
  privacy_classes: PrivacyClass[];
  only_indirect: boolean;
  /** Every direct reference already carries a canonical R2 key or public URL, so the copy is optional for delivery. */
  already_delivered_elsewhere: boolean;
  references: ManifestReference[];
  content_type: string | null;
  size: number | null;
  sha256: string | null;
  verify: "pending" | "computed" | "missing-in-export" | "unknown";
};
export type StorageManifest = {
  version: 1;
  generated_at: string;
  target: string;
  target_host: string;
  read_only: boolean;
  r2_key_prefix: string;
  scanned_fields: ScannedField[];
  excluded_fields: typeof EXCLUDED_FIELDS;
  placeholders_skipped: number;
  summary: {
    storage_ids: number;
    references: number;
    well_formed: number;
    malformed: number;
    only_indirect: number;
    already_delivered_elsewhere: number;
    by_table_field: Record<string, number>;
    by_privacy: Record<string, number>;
    ids_by_privacy: Record<string, number>;
  };
  entries: ManifestEntry[];
};

function arg(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

/** Local targets pass; remote targets need `--allow-remote` and `--read-only`. */
export function guardReadTarget(target: string, allowRemote: boolean, readOnly: boolean): void {
  const hostname = new URL(target).hostname;
  const local = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  if (local) return;
  if (!allowRemote || !readOnly) throw new Error(`Refusing non-local target ${hostname}; pass --allow-remote AND --read-only (this script never writes)`);
}

/** Privacy class and `_storage` column per table, from the inventory rather than a second hand-written list. */
function readTableMeta(): Map<string, TableMeta> {
  const meta = new Map<string, TableMeta>();
  for (const line of fs.readFileSync(TABLES_MD, "utf8").split("\n")) {
    if (!/^\| \d+ \| /.test(line)) continue;
    const cells = line.slice(2, line.endsWith(" |") ? -2 : undefined).split(" | ");
    if (cells.length !== 8) throw new Error(`tables.md row does not have 8 cells: ${line.slice(0, 80)}`);
    const privacyCell = cells[5].replace(/\*\*/g, "").trim();
    const privacy = /^(public|editorial|private-personal|credential)/.exec(privacyCell)?.[1] as PrivacyClass | undefined;
    if (!privacy) throw new Error(`tables.md row ${cells[1]} has no privacy class: ${privacyCell}`);
    meta.set(cells[1].trim(), { privacy, privacyNote: privacyCell, storageColumn: cells[6].replace(/\*\*/g, "").trim() });
  }
  if (meta.size !== 61) throw new Error(`tables.md parsed ${meta.size} tables, expected 61`);
  return meta;
}

function privacyOf(meta: Map<string, TableMeta>, table: string): PrivacyClass {
  const row = meta.get(table);
  if (!row) throw new Error(`${table} is not classified in tables.md`);
  return row.privacy;
}

function assertTextColumn(table: TableName, field: string): void {
  const column = tableColumns[table]?.[field];
  if (!column) throw new Error(`${table}.${field} is not a column in schema.generated.ts`);
  if (column.kind !== "text") throw new Error(`${table}.${field} is ${column.kind}, expected text`);
}

function planFields(meta: Map<string, TableMeta>): { direct: ScannedField[]; indirect: ScannedField[] } {
  const direct: ScannedField[] = [];
  for (const [table, edges] of Object.entries(tableReferences) as Array<[TableName, Record<string, string>]>) {
    for (const [field, target] of Object.entries(edges)) {
      if (target !== "_storage") continue;
      assertTextColumn(table, field);
      assertTextColumn(table, TYPED_FIELD_SIBLINGS.r2Field);
      assertTextColumn(table, TYPED_FIELD_SIBLINGS.urlField);
      direct.push({ table, field, kind: "direct", source: `tableReferences (v.id("_storage"))`, privacy: privacyOf(meta, table), ...TYPED_FIELD_SIBLINGS });
    }
  }
  for (const { table, field, r2Field, urlField, doc } of SCHEMA_STRING_FIELDS) {
    assertTextColumn(table, field);
    assertTextColumn(table, r2Field);
    if (urlField) assertTextColumn(table, urlField);
    direct.push({ table, field, kind: "direct", source: `schema string field (${doc})`, privacy: privacyOf(meta, table), r2Field, ...(urlField ? { urlField } : {}) });
  }
  const indirect: ScannedField[] = [];
  for (const [table, row] of meta) {
    if (!row.storageColumn.startsWith("indirect")) continue;
    const columns = tableColumns[table as TableName];
    if (!columns) throw new Error(`${table} from tables.md is not in schema.generated.ts`);
    for (const [column, spec] of Object.entries(columns)) {
      if (spec.kind === "jsonb") indirect.push({ table, field: column, kind: "indirect-jsonb", source: `tables.md "${row.storageColumn}"`, privacy: row.privacy });
    }
  }
  return { direct, indirect };
}

const q = (name: string) => `"${name.replace(/"/g, '""')}"`;

async function* pages(pool: Pool, table: string, columns: string[], where: string): AsyncGenerator<Record<string, unknown>[]> {
  let after = "";
  for (;;) {
    const result = await pool.query(
      `SELECT "_id", ${columns.map(q).join(", ")} FROM ${q(table)} WHERE "_id" > $1 AND (${where}) ORDER BY "_id" LIMIT ${PAGE}`,
      [after],
    );
    if (result.rows.length === 0) return;
    yield result.rows as Record<string, unknown>[];
    after = result.rows[result.rows.length - 1]._id as string;
    if (result.rows.length < PAGE) return;
  }
}

/** A direct URL counts as delivery only when it will outlive the Convex deployment. */
function deliveredOffConvex(url: string | null): boolean {
  if (!url) return false;
  try {
    const { protocol, hostname } = new URL(url);
    return protocol === "https:" && !hostname.endsWith(".convex.cloud") && !hostname.endsWith(".convex.site");
  } catch {
    return false;
  }
}

function* embeddedIds(value: unknown, at: string): Generator<{ path: string; storageId: string }> {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) yield* embeddedIds(value[index], `${at}[${index}]`);
  } else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (EMBEDDED_KEYS[key] && typeof child === "string" && child) yield { path: `${at}.${key}`, storageId: child };
      else yield* embeddedIds(child, `${at}.${key}`);
    }
  }
}

export async function buildStorageManifest(pool: Pool, target: string, readOnly: boolean): Promise<StorageManifest> {
  const meta = readTableMeta();
  const { direct, indirect } = planFields(meta);
  const entries = new Map<string, ManifestEntry>();
  let placeholders = 0;

  const reference = (storageId: string, ref: ManifestReference) => {
    if (isPlaceholderStorageId(storageId)) {
      placeholders += 1;
      return;
    }
    let entry = entries.get(storageId);
    if (!entry) {
      entry = {
        storage_id: storageId,
        r2_key: `${R2_KEY_PREFIX}${storageId}`,
        well_formed: CONVEX_ID.test(storageId),
        privacy_classes: [],
        only_indirect: true,
        already_delivered_elsewhere: false,
        references: [],
        content_type: null,
        size: null,
        sha256: null,
        verify: "pending",
      };
      entries.set(storageId, entry);
    }
    entry.references.push(ref);
  };

  const byTable = new Map<string, ScannedField[]>();
  for (const field of direct) byTable.set(field.table, [...(byTable.get(field.table) ?? []), field]);
  for (const [table, fields] of byTable) {
    const columns = [...new Set(fields.flatMap((f) => [f.field, f.r2Field, f.urlField].filter((c): c is string => Boolean(c))))];
    const where = fields.map((f) => `${q(f.field)} IS NOT NULL`).join(" OR ");
    for await (const rows of pages(pool, table, columns, where)) {
      for (const row of rows) {
        for (const field of fields) {
          const storageId = row[field.field];
          if (typeof storageId !== "string" || !storageId) continue;
          const existingKey = field.r2Field ? (row[field.r2Field] as string | null) : null;
          const existingUrl = field.urlField ? (row[field.urlField] as string | null) : null;
          reference(storageId, {
            table,
            field: field.field,
            row_id: row._id as string,
            kind: "direct",
            privacy: field.privacy,
            existing_r2_key: existingKey ?? null,
            existing_public_url: existingUrl ?? null,
          });
        }
      }
    }
  }

  const indirectByTable = new Map<string, ScannedField[]>();
  for (const field of indirect) indirectByTable.set(field.table, [...(indirectByTable.get(field.table) ?? []), field]);
  const needle = Object.keys(EMBEDDED_KEYS).map((key) => `'%"${key}"%'`);
  for (const [table, fields] of indirectByTable) {
    const columns = fields.map((f) => f.field);
    const where = columns.map((c) => needle.map((n) => `${q(c)}::text LIKE ${n}`).join(" OR ")).join(" OR ");
    for await (const rows of pages(pool, table, columns, where)) {
      for (const row of rows) {
        for (const field of fields) {
          for (const found of embeddedIds(row[field.field], "$")) {
            reference(found.storageId, {
              table,
              field: field.field,
              row_id: row._id as string,
              kind: "indirect-jsonb",
              privacy: field.privacy,
              existing_r2_key: null,
              existing_public_url: null,
              path: found.path,
            });
          }
        }
      }
    }
  }

  const byTableField: Record<string, number> = {};
  const byPrivacy: Record<string, number> = {};
  const idsByPrivacy: Record<string, number> = {};
  for (const entry of entries.values()) {
    const directRefs = entry.references.filter((ref) => ref.kind === "direct");
    entry.only_indirect = directRefs.length === 0;
    entry.already_delivered_elsewhere =
      directRefs.length > 0 && directRefs.every((ref) => isValidR2Key(ref.existing_r2_key) || deliveredOffConvex(ref.existing_public_url));
    entry.privacy_classes = [...new Set(entry.references.map((ref) => ref.privacy))].sort();
    for (const ref of entry.references) {
      const key = `${ref.table}.${ref.field}`;
      byTableField[key] = (byTableField[key] ?? 0) + 1;
      byPrivacy[ref.privacy] = (byPrivacy[ref.privacy] ?? 0) + 1;
    }
    const worst = entry.privacy_classes.includes("credential")
      ? "credential"
      : entry.privacy_classes.includes("private-personal")
        ? "private-personal"
        : entry.privacy_classes.includes("editorial")
          ? "editorial"
          : "public";
    idsByPrivacy[worst] = (idsByPrivacy[worst] ?? 0) + 1;
  }
  const sorted = [...entries.values()].sort((a, b) => (a.storage_id < b.storage_id ? -1 : 1));
  const url = new URL(target);
  return {
    version: 1,
    generated_at: new Date().toISOString(),
    target: target.replace(/\/\/[^@]*@/, "//<redacted>@"),
    target_host: url.hostname,
    read_only: readOnly,
    r2_key_prefix: R2_KEY_PREFIX,
    scanned_fields: [...direct, ...indirect],
    excluded_fields: EXCLUDED_FIELDS,
    placeholders_skipped: placeholders,
    summary: {
      storage_ids: sorted.length,
      references: sorted.reduce((n, e) => n + e.references.length, 0),
      well_formed: sorted.filter((e) => e.well_formed).length,
      malformed: sorted.filter((e) => !e.well_formed).length,
      only_indirect: sorted.filter((e) => e.only_indirect).length,
      already_delivered_elsewhere: sorted.filter((e) => e.already_delivered_elsewhere).length,
      by_table_field: byTableField,
      by_privacy: byPrivacy,
      ids_by_privacy: idsByPrivacy,
    },
    entries: sorted,
  };
}

async function main() {
  const argv = process.argv.slice(2);
  const target = arg(argv, "--target") ?? "postgres://localhost:5432/dosewiki";
  const readOnly = argv.includes("--read-only");
  guardReadTarget(target, argv.includes("--allow-remote"), readOnly);
  const out = arg(argv, "--out") ?? path.join(ROOT, "runs", "postgres-import", `${new Date().toISOString().replace(/[:.]/g, "-")}-storage`, "manifest.json");
  const pool = new Pool({ connectionString: target, max: 2, ...(readOnly ? { options: "-c default_transaction_read_only=on" } : {}) });
  const started = performance.now();
  try {
    if (readOnly) {
      const { rows } = await pool.query("SHOW default_transaction_read_only");
      if (rows[0]?.default_transaction_read_only !== "on") throw new Error("read-only session was not honoured by the server");
    }
    const manifest = await buildStorageManifest(pool, target, readOnly);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, JSON.stringify(manifest, null, 2));
    console.log(`Scanned fields: ${manifest.scanned_fields.map((f) => `${f.table}.${f.field}${f.kind === "direct" ? "" : " (jsonb)"}`).join(", ")}`);
    console.log(`Excluded: ${manifest.excluded_fields.map((f) => `${f.table}.${f.field}`).join(", ")}`);
    console.log(`Manifest: ${path.relative(ROOT, out)}`);
    console.log(JSON.stringify({ ...manifest.summary, placeholders_skipped: manifest.placeholders_skipped, read_only: readOnly, elapsedMs: Math.round(performance.now() - started) }));
  } finally {
    await pool.end();
  }
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : error);
    process.exit(1);
  });
}
