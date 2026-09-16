/**
 * Document database reads and writes over one Postgres transaction.
 *
 * Handlers in `server/` use keyset SQL over the application tables. Documents
 * round-trip through `rowToDocument` / `documentToRow` and
 * `decodeDocumentValue` / `encodeDocumentValue`, preserving NaN, int64, and
 * bytes. `db.get(id)` resolves the table through the `documentIds` map.
 *
 * Queries run at REPEATABLE READ READ ONLY; mutations run at SERIALIZABLE
 * and retry the complete transaction on serialization or deadlock failure.
 */

import { createHash, randomInt } from "node:crypto";
import type { PoolClient } from "pg";
import { decodeDocumentValue, encodeDocumentValue, documentToRow, losslessSelectList, rowToDocument, type DataDocument } from "../documentCodec";
import { tableColumns, tableIndexes, tableNames, type ColumnSpec, type TableName } from "../schema.generated";
import { lockLocalizedPublicationIndexes, refreshLocalizedPublicationIndexes } from "../../translation/publicationIndexStore";
import type { CitationQueueSummary } from "../../../server/lib/citationQueueFilter";

export type Doc = Record<string, unknown> & { _id: string; _creationTime: number };

/**
 * Handlers fan out reads with `Promise.all`; one Postgres connection executes
 * one statement at a time, so statements are chained rather than queued by pg.
 */
export type SqlExecutor = {
  query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }>;
  /** Statements issued so far; the client reports it per function call when tracing. */
  readonly statements: number;
};

export function serialExecutor(client: PoolClient): SqlExecutor {
  let tail: Promise<unknown> = Promise.resolve();
  let statements = 0;
  return {
    get statements() {
      return statements;
    },
    query(sql, params) {
      statements += 1;
      const run = tail.then(() => client.query(sql, params));
      tail = run.catch(() => undefined);
      return run as Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }>;
    },
  };
}

const ID_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

/**
 * Ids minted here start with a 4-character table tag so `normalizeId` can
 * resolve them synchronously without a lookup. Imported ids carry no runtime
 * tag and resolve through the id map loaded from `documentIds`.
 */
const TABLE_TAGS = new Map<string, TableName>();
function tableTag(table: TableName): string {
  return createHash("sha1").update(table).digest("hex").replace(/[^a-z0-9]/g, "").slice(0, 4);
}
for (const table of tableNames) {
  const tag = tableTag(table);
  const existing = TABLE_TAGS.get(tag);
  if (existing && existing !== table) throw new Error(`Table tag collision: ${existing} and ${table} both hash to ${tag}`);
  TABLE_TAGS.set(tag, table);
}

export function mintDataId(table: TableName): string {
  let id = tableTag(table);
  while (id.length < 32) id += ID_ALPHABET[randomInt(ID_ALPHABET.length)];
  return id;
}

/** Process-wide `_id -> table` map for ids that predate this runtime. */
export type IdTableMap = Map<string, TableName>;

export async function loadIdTableMap(executor: SqlExecutor): Promise<IdTableMap> {
  const result = await executor.query('SELECT "_id", "table" FROM "documentIds"');
  const map: IdTableMap = new Map();
  for (const row of result.rows) {
    const table = row.table as string;
    if (isTableName(table)) map.set(row._id as string, table);
  }
  return map;
}

const quote = (name: string) => `"${name.replace(/"/g, '""')}"`;

function isTableName(value: string): value is TableName {
  return (tableNames as readonly string[]).includes(value);
}

function assertTable(value: string): TableName {
  if (!isTableName(value)) throw new Error(`Unknown table ${value}`);
  return value;
}

/** Native document -> persisted JSON encoding -> row. `undefined` fields are dropped on write. */
function toRow(table: TableName, doc: Doc) {
  const json = encodeDocumentValue(doc) as DataDocument;
  const encoded = documentToRow(table, json);
  if (encoded.unknownFields.length) {
    throw new Error(`Document for ${table} carries fields the schema does not declare: ${encoded.unknownFields.join(", ")}`);
  }
  return encoded.row;
}

function fromRow(table: TableName, row: Record<string, unknown>): Doc {
  return decodeDocumentValue(rowToDocument(table, row)) as Doc;
}

// ---------------------------------------------------------------------------
// Filter expressions (`q.eq(q.field("x"), 1)` etc.) evaluated in process.
// ---------------------------------------------------------------------------

type Expr =
  | { kind: "field"; path: string }
  | { kind: "literal"; value: unknown }
  | { kind: "op"; op: string; args: Expr[] };

const lit = (value: unknown): Expr =>
  value !== null && typeof value === "object" && "kind" in (value as object) && (value as Expr).kind
    ? (value as Expr)
    : { kind: "literal", value };

const filterBuilder = {
  field: (path: string): Expr => ({ kind: "field", path }),
  eq: (a: unknown, b: unknown): Expr => ({ kind: "op", op: "eq", args: [lit(a), lit(b)] }),
  neq: (a: unknown, b: unknown): Expr => ({ kind: "op", op: "neq", args: [lit(a), lit(b)] }),
  lt: (a: unknown, b: unknown): Expr => ({ kind: "op", op: "lt", args: [lit(a), lit(b)] }),
  lte: (a: unknown, b: unknown): Expr => ({ kind: "op", op: "lte", args: [lit(a), lit(b)] }),
  gt: (a: unknown, b: unknown): Expr => ({ kind: "op", op: "gt", args: [lit(a), lit(b)] }),
  gte: (a: unknown, b: unknown): Expr => ({ kind: "op", op: "gte", args: [lit(a), lit(b)] }),
  add: (a: unknown, b: unknown): Expr => ({ kind: "op", op: "add", args: [lit(a), lit(b)] }),
  sub: (a: unknown, b: unknown): Expr => ({ kind: "op", op: "sub", args: [lit(a), lit(b)] }),
  mul: (a: unknown, b: unknown): Expr => ({ kind: "op", op: "mul", args: [lit(a), lit(b)] }),
  div: (a: unknown, b: unknown): Expr => ({ kind: "op", op: "div", args: [lit(a), lit(b)] }),
  mod: (a: unknown, b: unknown): Expr => ({ kind: "op", op: "mod", args: [lit(a), lit(b)] }),
  neg: (a: unknown): Expr => ({ kind: "op", op: "neg", args: [lit(a)] }),
  and: (...args: unknown[]): Expr => ({ kind: "op", op: "and", args: args.map(lit) }),
  or: (...args: unknown[]): Expr => ({ kind: "op", op: "or", args: args.map(lit) }),
  not: (a: unknown): Expr => ({ kind: "op", op: "not", args: [lit(a)] }),
};

/** Document value order: undefined < null < bigint < number < boolean < string < bytes < array < object. */
function typeRank(value: unknown): number {
  if (value === undefined) return 0;
  if (value === null) return 1;
  if (typeof value === "bigint") return 2;
  if (typeof value === "number") return 3;
  if (typeof value === "boolean") return 4;
  if (typeof value === "string") return 5;
  if (value instanceof ArrayBuffer) return 6;
  if (Array.isArray(value)) return 7;
  return 8;
}

function compareValues(a: unknown, b: unknown): number {
  const ra = typeRank(a);
  const rb = typeRank(b);
  if (ra !== rb) return ra - rb;
  switch (ra) {
    case 2:
    case 3:
    case 4:
      return (a as number) < (b as number) ? -1 : (a as number) > (b as number) ? 1 : 0;
    case 5:
      return (a as string) < (b as string) ? -1 : (a as string) > (b as string) ? 1 : 0;
    case 7: {
      const x = a as unknown[];
      const y = b as unknown[];
      for (let i = 0; i < Math.min(x.length, y.length); i += 1) {
        const c = compareValues(x[i], y[i]);
        if (c !== 0) return c;
      }
      return x.length - y.length;
    }
    default: {
      const x = JSON.stringify(encodeDocumentValue(a));
      const y = JSON.stringify(encodeDocumentValue(b));
      return x < y ? -1 : x > y ? 1 : 0;
    }
  }
}

function readPath(doc: Doc, path: string): unknown {
  let current: unknown = doc;
  for (const part of path.split(".")) {
    if (current === null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function evaluate(expr: Expr, doc: Doc): unknown {
  switch (expr.kind) {
    case "field":
      return readPath(doc, expr.path);
    case "literal":
      return expr.value;
    case "op": {
      const [a, b] = expr.args;
      const ev = (e: Expr) => evaluate(e, doc);
      switch (expr.op) {
        case "eq":
          return compareValues(ev(a), ev(b)) === 0;
        case "neq":
          return compareValues(ev(a), ev(b)) !== 0;
        case "lt":
          return compareValues(ev(a), ev(b)) < 0;
        case "lte":
          return compareValues(ev(a), ev(b)) <= 0;
        case "gt":
          return compareValues(ev(a), ev(b)) > 0;
        case "gte":
          return compareValues(ev(a), ev(b)) >= 0;
        case "add":
          return (ev(a) as number) + (ev(b) as number);
        case "sub":
          return (ev(a) as number) - (ev(b) as number);
        case "mul":
          return (ev(a) as number) * (ev(b) as number);
        case "div":
          return (ev(a) as number) / (ev(b) as number);
        case "mod":
          return (ev(a) as number) % (ev(b) as number);
        case "neg":
          return -(ev(a) as number);
        case "and":
          return expr.args.every((e) => ev(e) === true);
        case "or":
          return expr.args.some((e) => ev(e) === true);
        case "not":
          return ev(a) !== true;
        default:
          throw new Error(`Unsupported filter op ${expr.op}`);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Index ranges (`withIndex("by_x", q => q.eq("x", 1).gt("y", 2))`) as SQL.
// ---------------------------------------------------------------------------

type Bound = { field: string; op: "=" | ">" | ">=" | "<" | "<="; value: unknown };

class IndexRange {
  readonly bounds: Bound[] = [];
  constructor(private readonly fields: readonly string[]) {}
  private push(op: Bound["op"], field: string, value: unknown) {
    if (!this.fields.includes(field)) throw new Error(`Field ${field} is not part of this index (${this.fields.join(", ")})`);
    this.bounds.push({ field, op, value });
    return this;
  }
  eq = (field: string, value: unknown) => this.push("=", field, value);
  gt = (field: string, value: unknown) => this.push(">", field, value);
  gte = (field: string, value: unknown) => this.push(">=", field, value);
  lt = (field: string, value: unknown) => this.push("<", field, value);
  lte = (field: string, value: unknown) => this.push("<=", field, value);
}

const SQL_TYPE: Record<ColumnSpec["kind"], string> = {
  text: "text",
  double: "float8",
  boolean: "boolean",
  bigint: "bigint",
  bytea: "bytea",
  jsonb: "jsonb",
};

function sqlParam(spec: ColumnSpec, value: unknown): unknown {
  switch (spec.kind) {
    case "jsonb":
      return JSON.stringify(encodeDocumentValue(value));
    case "bigint":
      return String(value);
    case "double":
      return Object.is(value, -0) ? "-0" : value;
    default:
      return value;
  }
}

type Fetch = { where: string[]; params: unknown[] };

/**
 * SQL expression and comparison type for an index field. Nested paths
 * (`subject.profile_key`) live inside jsonb and are indexed as text with
 * `->>`, matching `generateDrizzleSchema.ts`, so they compare as text.
 */
function columnExpr(table: TableName, field: string): { sql: string; kind: ColumnSpec["kind"]; nested: boolean } {
  const [head, ...rest] = field.split(".");
  const spec = (tableColumns[table] as Record<string, ColumnSpec>)[head];
  if (!spec) throw new Error(`Column ${table}.${head} is not declared`);
  // `COLLATE "C"` gives deterministic string ordering and matches the generated indexes.
  if (rest.length === 0) return { sql: spec.kind === "text" ? `${quote(head)} COLLATE "C"` : quote(head), kind: spec.kind, nested: false };
  if (spec.kind !== "jsonb") throw new Error(`Nested index field ${table}.${field} on non-jsonb column`);
  const path = rest.map((segment, i) => `${i === rest.length - 1 ? "->>" : "->"}'${segment.replace(/'/g, "''")}'`).join("");
  return { sql: `(${quote(head)}${path}) COLLATE "C"`, kind: "text", nested: true };
}

function boundToSql(table: TableName, bound: Bound, out: Fetch): void {
  const column = columnExpr(table, bound.field);
  const missing = bound.value === undefined || (bound.value === null && column.kind !== "jsonb");
  if (missing) {
    if (bound.op === "=") out.where.push(`${column.sql} IS NULL`);
    else if (bound.op === ">" || bound.op === ">=") out.where.push(bound.op === ">" ? `${column.sql} IS NOT NULL` : "TRUE");
    else out.where.push(bound.op === "<=" ? `${column.sql} IS NULL` : "FALSE");
    return;
  }
  const value = column.nested && typeof bound.value !== "string" ? JSON.stringify(encodeDocumentValue(bound.value)) : bound.value;
  out.params.push(sqlParam({ kind: column.kind, optional: true }, value));
  out.where.push(`${column.sql} ${bound.op} $${out.params.length}::${SQL_TYPE[column.kind]}`);
}

// ---------------------------------------------------------------------------
// Query builder
// ---------------------------------------------------------------------------

type Order = "asc" | "desc";
type PaginationResult = { page: Doc[]; isDone: boolean; continueCursor: string };

class Query implements AsyncIterable<Doc> {
  private orderDirection: Order = "asc";
  private filters: Expr[] = [];

  constructor(
    private readonly client: SqlExecutor,
    private readonly table: TableName,
    private readonly indexFields: readonly string[],
    private readonly range: IndexRange | null,
    private readonly onRow: (id: string, table: TableName) => void,
  ) {}

  order(direction: Order) {
    this.orderDirection = direction;
    return this;
  }

  filter(predicate: (q: typeof filterBuilder) => unknown) {
    this.filters.push(lit(predicate(filterBuilder)));
    return this;
  }

  private orderKeys(): string[] {
    const keys = [...this.indexFields];
    if (!keys.includes("_creationTime")) keys.push("_creationTime");
    keys.push("_id");
    return keys;
  }

  private matches(doc: Doc): boolean {
    return this.filters.every((f) => evaluate(f, doc) === true);
  }

  /**
   * Stream index-ordered rows in batches, applying in-process filters.
   * `wanted` bounds the first batch so `first()`/`take(n)` do not pull a page
   * of full documents across the wire; JS filters widen it since rows may drop.
   */
  private async *rows(startAfter?: Doc, wanted?: number): AsyncGenerator<Doc> {
    const fetch: Fetch = { where: [], params: [] };
    for (const bound of this.range?.bounds ?? []) boundToSql(this.table, bound, fetch);
    const direction = this.orderDirection === "asc" ? "ASC" : "DESC";
    const keys = this.orderKeys();
    if (startAfter) {
      // Keyset continuation on the full ordering key; NULL keys fall back to offset paging below.
      const values = keys.map((k) => startAfter[k]);
      if (values.every((v) => v !== undefined && v !== null)) {
        const placeholders = keys.map((k, i) => {
          const column = columnExpr(this.table, k);
          const value = column.nested && typeof values[i] !== "string" ? JSON.stringify(encodeDocumentValue(values[i])) : values[i];
          fetch.params.push(sqlParam({ kind: column.kind, optional: true }, value));
          return `$${fetch.params.length}::${SQL_TYPE[column.kind]}`;
        });
        const columns = keys.map((k) => columnExpr(this.table, k).sql);
        fetch.where.push(`(${columns.join(", ")}) ${this.orderDirection === "asc" ? ">" : "<"} (${placeholders.join(", ")})`);
      }
    }
    const orderBy = keys.map((k) => `${columnExpr(this.table, k).sql} ${direction}`).join(", ");
    const where = fetch.where.length ? `WHERE ${fetch.where.join(" AND ")}` : "";
    let offset = 0;
    let limit = wanted === undefined ? 128 : this.filters.length ? Math.max(16, wanted * 4) : wanted;
    for (;;) {
      const sql = `SELECT ${losslessSelectList(this.table)} FROM ${quote(this.table)} ${where} ORDER BY ${orderBy} LIMIT ${limit} OFFSET ${offset}`;
      const result = await this.client.query(sql, fetch.params);
      for (const row of result.rows) {
        const doc = fromRow(this.table, row as Record<string, unknown>);
        this.onRow(doc._id, this.table);
        if (this.matches(doc)) yield doc;
      }
      if (result.rows.length < limit) return;
      offset += result.rows.length;
      limit = Math.min(limit * 2, 2048);
    }
  }

  async *[Symbol.asyncIterator]() {
    yield* this.rows();
  }

  async collect(): Promise<Doc[]> {
    const out: Doc[] = [];
    for await (const doc of this.rows()) out.push(doc);
    return out;
  }

  async take(n: number): Promise<Doc[]> {
    const out: Doc[] = [];
    if (n <= 0) return out;
    for await (const doc of this.rows(undefined, n)) {
      out.push(doc);
      if (out.length >= n) break;
    }
    return out;
  }

  async first(): Promise<Doc | null> {
    const [doc] = await this.take(1);
    return doc ?? null;
  }

  async unique(): Promise<Doc | null> {
    const docs = await this.take(2);
    if (docs.length > 1) throw new Error(`unique() query returned more than one result from table ${this.table}`);
    return docs[0] ?? null;
  }

  async paginate(options: { numItems: number; cursor: string | null }): Promise<PaginationResult> {
    const numItems = Math.max(1, options.numItems);
    const startAfter = options.cursor ? (decodeDocumentValue(JSON.parse(options.cursor)) as Doc) : undefined;
    const page: Doc[] = [];
    let isDone = true;
    for await (const doc of this.rows(startAfter, numItems + 1)) {
      if (page.length >= numItems) {
        isDone = false;
        break;
      }
      page.push(doc);
    }
    const last = page[page.length - 1] ?? startAfter;
    const keys = this.orderKeys();
    const cursorDoc: Record<string, unknown> = {};
    if (last) for (const k of keys) {
      const value = k.includes(".") && !(k in last) ? readPath(last, k) : last[k];
      if (value !== undefined) cursorDoc[k] = value;
    }
    return { page, isDone, continueCursor: JSON.stringify(encodeDocumentValue(cursorDoc)) };
  }
}

class QueryInitializer extends Query {
  constructor(
    private readonly c: SqlExecutor,
    private readonly t: TableName,
    private readonly seen: (id: string, table: TableName) => void,
  ) {
    super(c, t, ["_creationTime"], null, seen);
  }

  fullTableScan() {
    return new Query(this.c, this.t, ["_creationTime"], null, this.seen);
  }

  withIndex(name: string, build?: (q: IndexRange) => IndexRange) {
    const fields = name === "by_creation_time" ? ["_creationTime"] : (tableIndexes[this.t] as Record<string, readonly string[]>)[name];
    if (!fields) throw new Error(`Index ${name} is not declared on ${this.t}`);
    const range = new IndexRange(fields);
    if (build) build(range);
    return new Query(this.c, this.t, fields, range, this.seen);
  }

  withSearchIndex(): never {
    throw new Error(`Search indexes are not supported on the Postgres runtime (${this.t})`);
  }
}

// ---------------------------------------------------------------------------
// Database reader / writer
// ---------------------------------------------------------------------------

export class PostgresDatabaseReader {
  /** Ids never change table within a transaction, so the map is safe to memoise. */
  private readonly idTables = new Map<string, TableName | null>();

  constructor(
    protected readonly client: SqlExecutor,
    private readonly knownIds: IdTableMap,
  ) {}

  /** Synchronous resolution: transaction cache, then imported-id map, then minted-id tag. */
  protected tableOfSync(id: string): TableName | null | undefined {
    const cached = this.idTables.get(id);
    if (cached !== undefined) return cached;
    const known = this.knownIds.get(id);
    if (known) return known;
    const tagged = TABLE_TAGS.get(id.slice(0, 4));
    if (tagged && /^[a-z0-9]{32}$/.test(id)) return tagged;
    return undefined;
  }

  /** `db.system` mirrors nothing yet: `_storage` and `_scheduled_functions` are not imported. */
  readonly system = {
    get: async () => null,
    query: () => {
      throw new Error("System tables are not available on the Postgres runtime");
    },
  };

  protected async tableOf(id: string): Promise<TableName | null> {
    const sync = this.tableOfSync(id);
    if (sync !== undefined) return sync;
    const result = await this.client.query('SELECT "table" FROM "documentIds" WHERE "_id" = $1', [id]);
    const table = result.rows[0]?.table as string | undefined;
    const resolved = table && isTableName(table) ? table : null;
    this.idTables.set(id, resolved);
    return resolved;
  }

  protected rememberTable(id: string, table: TableName | null): void {
    this.idTables.set(id, table);
  }

  async get(idOrTable: string, maybeId?: string): Promise<Doc | null> {
    const id = maybeId ?? idOrTable;
    const table = maybeId ? assertTable(idOrTable) : await this.tableOf(id);
    if (!table) return null;
    const result = await this.client.query(
      `SELECT ${losslessSelectList(table)} FROM ${quote(table)} WHERE "_id" = $1`,
      [id],
    );
    const row = result.rows[0] as Record<string, unknown> | undefined;
    if (row) this.idTables.set(id, table);
    return row ? fromRow(table, row) : null;
  }

  query(table: string) {
    return new QueryInitializer(this.client, assertTable(table), (id, t) => this.idTables.set(id, t));
  }

  async getPublicCopyBlocksByKeys(keys: readonly string[]): Promise<Doc[]> {
    if (keys.length === 0) return [];
    const result = await this.client.query(
      `SELECT ${losslessSelectList("copyBlocks")} FROM "copyBlocks" WHERE "key" = ANY($1::text[]) ORDER BY "_creationTime" ASC, "_id" ASC`,
      [keys],
    );
    return result.rows.map((row) => fromRow("copyBlocks", row));
  }

  async getPublicOverviewCounts(): Promise<{
    substanceCount: number;
    effectCount: number;
    reportCount: number;
    replicationCount: number;
    aboutConfigured: boolean;
    psychoactiveCategoryCount: number;
  }> {
    const result = await this.client.query(
      `SELECT
         (SELECT count(*)::int FROM "substanceIndex"
           WHERE COALESCE(to_jsonb("priority") #>> '{}', 'normal') NOT IN ('low', 'hide_for_now')) AS "substanceCount",
         (SELECT count(*)::int FROM "subjectiveEffects") AS "effectCount",
         (SELECT count(*)::int FROM "tripReports") AS "reportCount",
         (SELECT count(*)::int FROM "replications"
           WHERE COALESCE(to_jsonb("role") #>> '{}', 'replication') = 'replication'
             AND (to_jsonb("publication_state") #>> '{}') IS DISTINCT FROM 'duplicate-suppressed'
             AND (to_jsonb("replication_status") #>> '{}') IS DISTINCT FROM 'not-replication'
             AND (to_jsonb("type") #>> '{}') IN ('image', 'video', 'audio')) AS "replicationCount",
         EXISTS (
           SELECT 1 FROM "siteConfig"
           WHERE (to_jsonb("key") #>> '{}') = 'about'
             AND (length(COALESCE("aboutMarkdown", '')) > 0
               OR length(COALESCE("aboutSubtitle", '')) > 0)
         ) AS "aboutConfigured",
         COALESCE((
           SELECT jsonb_array_length(COALESCE("categories", '[]'::jsonb))
           FROM "indexLayouts"
           WHERE (to_jsonb("type") #>> '{}') = 'psychoactive'
           ORDER BY "_creationTime" ASC, "_id" COLLATE "C" ASC
           LIMIT 1
         ), 0)::int AS "psychoactiveCategoryCount"`,
    );
    const row = result.rows[0];
    return {
      substanceCount: Number(row.substanceCount),
      effectCount: Number(row.effectCount),
      reportCount: Number(row.reportCount),
      replicationCount: Number(row.replicationCount),
      aboutConfigured: row.aboutConfigured === true,
      psychoactiveCategoryCount: Number(row.psychoactiveCategoryCount),
    };
  }

  async getAboutAggregateSubstanceRows(): Promise<Doc[]> {
    const fields = [
      "_id", "_creationTime", "id", "title", "slug", "priority",
      "index_categories", "identification", "classification", "pharmacology",
    ];
    const result = await this.client.query(
      `SELECT ${losslessSelectList("substanceIndex", fields)}
       FROM "substanceIndex"
       ORDER BY "_creationTime" ASC, "_id" COLLATE "C" ASC`,
    );
    return result.rows.map((row) => fromRow("substanceIndex", row));
  }

  async getStudioReplicationTotal(): Promise<number> {
    const result = await this.client.query(
      'SELECT count(*)::int AS "totalCount" FROM "replications"',
    );
    return Number(result.rows[0]?.totalCount ?? 0);
  }

  /**
   * Targeted public projection for the artist taxonomy batch. This deliberately
   * bypasses the document-shaped query path so a public credit lookup transports
   * neither unrelated artists nor private taxonomy evidence.
   */
  async getPublicArtistTaxonomyByKeys(
    keys: readonly string[],
  ): Promise<Array<{ key: string; primary_type: unknown; artist_type_tags: unknown }>> {
    if (keys.length === 0) return [];
    const result = await this.client.query(
      'SELECT "key", "primary_type", "artist_type_tags" FROM "replicationArtistTaxonomy" WHERE "key" = ANY($1::text[])',
      [keys],
    );
    return result.rows.map((row) => ({
      key: row.key as string,
      primary_type: row.primary_type,
      artist_type_tags: row.artist_type_tags,
    }));
  }

  async getPublicContributorIdentities(lookupKeys?: readonly string[]): Promise<Doc[]> {
    if (lookupKeys?.length === 0) return [];
    const normalizedKeys = lookupKeys?.map((key) => key.trim().toUpperCase()).filter(Boolean);
    const where = normalizedKeys
      ? `WHERE "mergedIntoProfileId" IS NULL AND (
          upper(btrim("key")) = ANY($1::text[])
          OR EXISTS (
            SELECT 1 FROM jsonb_array_elements_text(COALESCE("aliases", '[]'::jsonb)) AS alias(value)
            WHERE upper(btrim(alias.value)) = ANY($1::text[])
          )
        )`
      : `WHERE "mergedIntoProfileId" IS NULL`;
    const result = await this.client.query(
      `SELECT ${losslessSelectList("contributorProfiles", ["_id", "_creationTime", "key", "displayName", "aliases", "avatarUrl", "avatarR2Key", "avatarStorageId", "exclude_from_gallery", "approved_replicator", "archival"])} FROM "contributorProfiles" ${where} ORDER BY "_creationTime" ASC, "_id" ASC`,
      normalizedKeys ? [normalizedKeys] : [],
    );
    return result.rows.map((row) => fromRow("contributorProfiles", row));
  }

  async getPublicEffectProjection(
    projection: "preview" | "index" | "summary" | "slugs" | "audio" | "credits",
    slugs?: readonly string[],
  ): Promise<Doc[]> {
    if (slugs?.length === 0) return [];
    const fields = {
      preview: ["_id", "_creationTime", "slug", "name", "tags", "featured", "summary"],
      index: ["_id", "_creationTime", "slug", "name", "tags", "featured"],
      summary: ["_id", "_creationTime", "slug", "name", "long_summary_raw", "long_summary_ast", "citations", "subarticles"],
      slugs: ["_id", "_creationTime", "slug", "name"],
      audio: ["_id", "_creationTime", "slug", "name", "audio_replications"],
      credits: ["_id", "_creationTime", "slug", "name", "contributors"],
    }[projection];
    const predicates = [
      ...(slugs ? ['"slug" = ANY($1::text[])'] : []),
      ...(projection === "audio"
        ? [`jsonb_typeof("audio_replications") = 'array' AND jsonb_array_length("audio_replications") > 0`]
        : []),
    ];
    const where = predicates.length > 0 ? `WHERE ${predicates.join(" AND ")}` : "";
    const result = await this.client.query(
      `SELECT ${losslessSelectList("subjectiveEffects", fields)} FROM "subjectiveEffects" ${where} ORDER BY "_creationTime" ASC, "_id" ASC`,
      slugs ? [slugs] : [],
    );
    return result.rows.map((row) => fromRow("subjectiveEffects", row));
  }

  async getPublicTripReportBrowseRows(): Promise<Doc[]> {
    const fields = [
      "_id", "_creationTime", "slug", "title", "featured", "subject",
      "substances", "attribution_review",
    ];
    const result = await this.client.query(
      `SELECT ${losslessSelectList("tripReports", fields)}
       FROM "tripReports"
       ORDER BY "_creationTime" ASC, "_id" COLLATE "C" ASC`,
    );
    return result.rows.map((row) => fromRow("tripReports", row));
  }

  async getPublicSubstanceMechanismRows(): Promise<Doc[]> {
    const fields = [
      "_id", "_creationTime", "title", "slug", "priority",
      "index_categories", "identification", "pharmacology",
    ];
    const result = await this.client.query(
      `SELECT ${losslessSelectList("substanceIndex", fields)}
       FROM "substanceIndex"
       ORDER BY "_creationTime" ASC, "_id" COLLATE "C" ASC`,
    );
    return result.rows.map((row) => fromRow("substanceIndex", row));
  }

  async getPublicAboutPreviewRows(limit: number): Promise<Doc[]> {
    const bounded = Math.min(Math.max(Math.floor(limit), 1), 12);
    const result = await this.client.query(
      `SELECT ${losslessSelectList("substanceIndex")}
       FROM "substanceIndex"
       WHERE COALESCE(to_jsonb("priority") #>> '{}', 'normal') NOT IN ('low', 'hide_for_now')
       ORDER BY "_creationTime" ASC, "_id" COLLATE "C" ASC
       LIMIT $1`,
      [bounded],
    );
    return result.rows.map((row) => fromRow("substanceIndex", row));
  }

  async getEditorLibraryPage(args: { numItems: number; cursor: string | null }) {
    const after = args.cursor
      ? decodeDocumentValue(JSON.parse(args.cursor)) as { _creationTime: number; _id: string }
      : null;
    const limit = Math.min(Math.max(Math.floor(args.numItems), 1), 200);
    const params: unknown[] = [];
    const continuation = after
      ? (params.push(after._creationTime, after._id), 'WHERE (s."_creationTime", s."_id" COLLATE "C") > ($1, $2::text COLLATE "C")')
      : "";
    params.push(limit + 1);
    const result = await this.client.query(
      `SELECT ${losslessSelectList("substanceIndex", [
        "_id", "_creationTime", "id", "slug", "title", "priority", "index_categories",
        "identification", "classification", "pharmacology", "subjective_effects", "editorial_review",
      ])}, (
        CASE WHEN jsonb_typeof(s."references") = 'array' THEN jsonb_array_length(s."references") ELSE 0 END
        + CASE WHEN jsonb_typeof(s."source_citations") = 'array' THEN jsonb_array_length(s."source_citations") ELSE 0 END
        + CASE WHEN jsonb_typeof(s."citations") = 'array' THEN jsonb_array_length(s."citations") ELSE 0 END
      )::int AS "referenceCount"
       FROM "substanceIndex" s ${continuation}
       ORDER BY s."_creationTime" ASC, s."_id" COLLATE "C" ASC
       LIMIT $${params.length}`,
      params,
    );
    const rows = result.rows.slice(0, limit);
    const last = rows[rows.length - 1];
    return {
      page: rows.map((row) => ({
        article: fromRow("substanceIndex", row),
        referenceCount: Number(row.referenceCount),
      })),
      continueCursor: last
        ? JSON.stringify(encodeDocumentValue({ _creationTime: last._creationTime, _id: last._id }))
        : (args.cursor ?? ""),
      isDone: result.rows.length <= limit,
    };
  }

  async getMoleculePickerPage(args: { numItems: number; cursor: string | null }) {
    const after = args.cursor
      ? decodeDocumentValue(JSON.parse(args.cursor)) as { _creationTime: number; _id: string }
      : null;
    const limit = Math.min(Math.max(Math.floor(args.numItems), 1), 200);
    const params: unknown[] = [];
    const continuation = after
      ? (params.push(after._creationTime, after._id), 'WHERE (s."_creationTime", s."_id" COLLATE "C") > ($1, $2::text COLLATE "C")')
      : "";
    params.push(limit + 1);
    const result = await this.client.query(
      `SELECT ${losslessSelectList("substanceIndex", [
        "_id", "_creationTime", "slug", "title", "priority", "index_categories", "classification",
      ])}, EXISTS (
         SELECT 1 FROM "moleculeOverrides" m
         WHERE m."slug" COLLATE "C" = s."slug" COLLATE "C"
       ) AS "hasOverride"
       FROM "substanceIndex" s ${continuation}
       ORDER BY s."_creationTime" ASC, s."_id" COLLATE "C" ASC
       LIMIT $${params.length}`,
      params,
    );
    const rows = result.rows.slice(0, limit);
    const last = rows[rows.length - 1];
    return {
      page: rows.map((row) => ({
        article: fromRow("substanceIndex", row),
        hasOverride: row.hasOverride === true,
      })),
      continueCursor: last
        ? JSON.stringify(encodeDocumentValue({ _creationTime: last._creationTime, _id: last._id }))
        : (args.cursor ?? ""),
      isDone: result.rows.length <= limit,
    };
  }

  async getMoleculeSourceBySlug(slug: string): Promise<Doc | null> {
    const result = await this.client.query(
      `SELECT ${losslessSelectList("substanceIndex", [
        "_id", "_creationTime", "slug", "title", "identification",
      ])}
       FROM "substanceIndex"
       WHERE "slug" COLLATE "C" = $1::text COLLATE "C"
       ORDER BY "_creationTime" ASC, "_id" COLLATE "C" ASC
       LIMIT 2`,
      [slug],
    );
    if (result.rows.length !== 1) return null;
    return fromRow("substanceIndex", result.rows[0]);
  }

  async getMoleculeEditSourceBySlug(slug: string): Promise<Doc | null> {
    const result = await this.client.query(
      `SELECT ${losslessSelectList("moleculeOverrides", [
        "_id", "_creationTime", "slug", "molblock", "boldBonds", "source", "updatedAt",
      ])}
       FROM "moleculeOverrides"
       WHERE "slug" COLLATE "C" = $1::text COLLATE "C"
       ORDER BY "_creationTime" ASC, "_id" COLLATE "C" ASC
       LIMIT 2`,
      [slug],
    );
    if (result.rows.length !== 1) return null;
    return fromRow("moleculeOverrides", result.rows[0]);
  }

  /**
   * Complete storage-ordered gallery membership projection. Publication and
   * contributor policy remain in the handler so this SQL transports only the
   * fields those shared policies and the browse index consume.
   */
  async getPublicGalleryMembershipRows(): Promise<Doc[]> {
    const fields = [
      "_id", "_creationTime", "slug", "title", "artist", "artist_url",
      "type", "format", "effect_slug", "effect_tags", "viewing_mode_tags",
      "title_drugs", "drug_classes", "content_family", "storage_id", "r2_key",
      "url", "has_audio", "created_at", "date_info", "role",
      "publication_state", "replication_status",
    ];
    const result = await this.client.query(
      `SELECT ${losslessSelectList("replications", fields)}
       FROM "replications"
       ORDER BY "_creationTime" ASC, "_id" ASC`,
    );
    return result.rows.map((row) => fromRow("replications", row));
  }

  async getReplicationsBySlugs(slugs: readonly string[]): Promise<Doc[]> {
    if (slugs.length === 0) return [];
    const result = await this.client.query(
      `SELECT DISTINCT ON ("slug" COLLATE "C") ${losslessSelectList("replications")}
       FROM "replications" WHERE "slug" COLLATE "C" = ANY($1::text[])
       ORDER BY "slug" COLLATE "C", "_creationTime" ASC, "_id" COLLATE "C" ASC`,
      [slugs],
    );
    return result.rows.map((row) => fromRow("replications", row));
  }

  async getPublicEffectGalleryOrders(slugs: readonly string[]): Promise<Doc[]> {
    if (slugs.length === 0) return [];
    const result = await this.client.query(
      `SELECT DISTINCT ON ("slug" COLLATE "C") ${losslessSelectList("subjectiveEffects", ["_id", "_creationTime", "slug", "gallery_order"])}
       FROM "subjectiveEffects" WHERE "slug" COLLATE "C" = ANY($1::text[])
       ORDER BY "slug" COLLATE "C", "_creationTime" ASC, "_id" COLLATE "C" ASC`,
      [slugs],
    );
    return result.rows.map((row) => fromRow("subjectiveEffects", row));
  }

  async getPublicEffectReplicationPage(args: { effectSlug: string; cursor?: string; limit: number }) {
    const prefix = "effect-replications:";
    let after: { effectSlug: string; _creationTime: number; _id: string } | null = null;
    if (args.cursor) {
      try {
        if (!args.cursor.startsWith(prefix)) throw new Error();
        after = JSON.parse(args.cursor.slice(prefix.length));
        if (!after || after.effectSlug !== args.effectSlug ||
          typeof after._creationTime !== "number" || !Number.isFinite(after._creationTime) ||
          typeof after._id !== "string" || after._id.length === 0) throw new Error();
      } catch {
        throw new Error("Invalid effect replication cursor.");
      }
    }
    const limit = Number.isFinite(args.limit) ? Math.min(Math.max(Math.floor(args.limit), 1), 64) : 64;
    const params: unknown[] = [args.effectSlug];
    const continuation = after
      ? (params.push(after._creationTime, after._id), 'AND ("_creationTime", "_id" COLLATE "C") > ($2, $3::text COLLATE "C")')
      : "";
    params.push(limit + 1);
    const result = await this.client.query(
      `SELECT ${losslessSelectList("replications")} FROM "replications"
       WHERE ("effect_slug" COLLATE "C" = $1::text COLLATE "C" OR "effect_tags" @> jsonb_build_array($1::text))
       ${continuation}
       ORDER BY "_creationTime" ASC, "_id" COLLATE "C" ASC LIMIT $${params.length}`,
      params,
    );
    const page = result.rows.slice(0, limit);
    const last = page[page.length - 1];
    return {
      page: page.map((row) => fromRow("replications", row)),
      continueCursor: last
        ? prefix + JSON.stringify({ effectSlug: args.effectSlug, _creationTime: last._creationTime, _id: last._id })
        : (args.cursor ?? ""),
      isDone: result.rows.length <= limit,
    };
  }

  async getPublicEffectCreditsByNames(names: readonly string[]): Promise<Doc[]> {
    if (names.length === 0) return [];
    const result = await this.client.query(
      `SELECT ${losslessSelectList("subjectiveEffects", ["_id", "_creationTime", "slug", "name", "contributors"])} FROM "subjectiveEffects"
       WHERE EXISTS (SELECT 1 FROM jsonb_array_elements_text(COALESCE("contributors", '[]'::jsonb)) AS credit(name)
         WHERE lower(btrim(credit.name)) = ANY($1::text[]))
       ORDER BY "_creationTime" ASC, "_id" ASC`,
      [names],
    );
    return result.rows.map((row) => fromRow("subjectiveEffects", row));
  }

  async getPublicArtistCreditRows(): Promise<Doc[]> {
    const result = await this.client.query(
      `SELECT ${losslessSelectList("replications", ["_id", "_creationTime", "artist", "artist_url", "effect_slug", "storage_id", "r2_key", "url"])} FROM "replications"
       WHERE COALESCE(to_jsonb("role") #>> '{}', 'replication') = 'replication'
         AND (to_jsonb("publication_state") #>> '{}') IS DISTINCT FROM 'duplicate-suppressed'
         AND (to_jsonb("replication_status") #>> '{}') IS DISTINCT FROM 'not-replication'
         AND (to_jsonb("type") #>> '{}') IN ('image', 'video', 'audio')
       ORDER BY "_creationTime" ASC, "_id" ASC`,
    );
    return result.rows.map((row) => fromRow("replications", row));
  }

  async getPublicTripReportsByContributor(profileKey: string, authorNames: readonly string[]): Promise<Doc[]> {
    const result = await this.client.query(
      `SELECT ${losslessSelectList("tripReports", ["_id", "_creationTime", "slug", "title", "featured", "subject", "substances", "introduction", "onset", "peak", "offset", "conclusion", "tags", "license", "attribution_review"])} FROM "tripReports"
       WHERE upper(btrim("subject"->>'profile_key')) = $1
          OR ("attribution_review" IS NULL AND lower(btrim("subject"->>'name')) = ANY($2::text[]))
       ORDER BY "_creationTime" ASC, "_id" ASC`,
      [profileKey.trim().toUpperCase(), authorNames.map((name) => name.trim().toLowerCase()).filter(Boolean)],
    );
    return result.rows.map((row) => fromRow("tripReports", row));
  }

  async getPublishedPublicationIndex(kind: "article" | "blog") {
    const kindPredicate = kind === "blog"
      ? `"kind" = 'blog'`
      : `"kind" IS DISTINCT FROM 'blog'`;
    const result = kind === "blog"
      ? await this.client.query(String.raw`
          SELECT "slug", "title", "publication_status", "publicationDate", "kind",
            "teaser", "coverImageUrl",
            CASE WHEN btrim(COALESCE("teaser", '')) <> '' THEN NULL ELSE left(
              btrim(regexp_replace(regexp_replace(regexp_replace(
                COALESCE((SELECT block FROM regexp_split_to_table("body_raw", '\n{2,}') WITH ORDINALITY AS b(block, position)
                  WHERE block !~ '^\s*$' ORDER BY position LIMIT 1), ''),
                '\[([^\]]+)\]\([^)]*\)', '\1', 'g'), '[*_` + "`" + String.raw`#>]', '', 'g'), '\s+', ' ', 'g')),
              256
            ) END AS excerpt_source
          FROM "effectIndexArticles"
          WHERE "status" IS DISTINCT FROM 'draft' AND "publication_status" = 'published'
            AND ${kindPredicate}
          ORDER BY "_creationTime" ASC, "_id" ASC
        `)
      : await this.client.query(String.raw`
          WITH published AS (
            SELECT * FROM "effectIndexArticles"
            WHERE "status" IS DISTINCT FROM 'draft' AND "publication_status" = 'published'
              AND ${kindPredicate}
          ), prose AS (
            SELECT p.*,
              btrim(regexp_replace(regexp_replace("body_raw", '\[[^\]]*\]', ' ', 'g'), '\s+', ' ', 'g')) AS reading_prose,
              CASE WHEN btrim(COALESCE("shortDescription", '')) <> '' THEN NULL ELSE
                btrim(regexp_replace(regexp_replace(
                  regexp_replace("body_raw", '\[h[1-6]\][\s\S]*?\[/h[1-6]\]|^#{1,6}\s.*$', ' ', 'gn'),
                  '\[[^\]]*\]', ' ', 'g'), '\s+', ' ', 'g'))
              END AS description_prose
            FROM published p
          )
          SELECT "slug", "title", "tags", "publication_status", "featured", "shortDescription",
            "publicationDate", "kind", "bodyFormat",
            left(description_prose, 256) AS description_source,
            CASE WHEN reading_prose = '' THEN NULL
              ELSE greatest(1, floor(array_length(string_to_array(reading_prose, ' '), 1) / 220.0 + 0.5))::integer END AS "readMinutes"
          FROM prose ORDER BY "_creationTime" ASC, "_id" ASC
        `);
    return result.rows;
  }
  async getPublicSubstanceLookupPage(cursor: string | undefined, limit: number) {
    const after = cursor ? (decodeDocumentValue(JSON.parse(cursor)) as { _creationTime: number; _id: string }) : null;
    const params: unknown[] = [];
    const where = after
      ? (params.push(after._creationTime, after._id), 'WHERE ("_creationTime", "_id") > ($1, $2)')
      : "";
    params.push(limit + 1);
    const result = await this.client.query(
      `SELECT "_id", "_creationTime", "title", "slug", "priority" FROM "substanceIndex" ${where} ORDER BY "_creationTime" ASC, "_id" ASC LIMIT $${params.length}`,
      params,
    );
    const page = result.rows.slice(0, limit);
    const last = page[page.length - 1];
    return {
      rows: page.map((row) => ({ title: row.title, slug: row.slug ?? undefined, priority: row.priority })),
      cursor: last
        ? JSON.stringify(encodeDocumentValue({ _creationTime: last._creationTime, _id: last._id }))
        : (cursor ?? ""),
      isDone: result.rows.length <= limit,
    };
  }

  async getPublicSubstancePreviewsPage(cursor: string | undefined, limit: number) {
    const after = cursor ? (decodeDocumentValue(JSON.parse(cursor)) as { _creationTime: number; _id: string }) : null;
    const params: unknown[] = [];
    const where = after
      ? (params.push(after._creationTime, after._id), 'WHERE ("_creationTime", "_id") > ($1, $2)')
      : "";
    params.push(limit + 1);
    const result = await this.client.query(
      `SELECT "_id", "_creationTime", "title", "slug", "summary", "priority", "index_categories" FROM "substanceIndex" ${where} ORDER BY "_creationTime" ASC, "_id" ASC LIMIT $${params.length}`,
      params,
    );
    const page = result.rows.slice(0, limit);
    const last = page[page.length - 1];
    return {
      rows: page.map((row) => ({
        title: row.title,
        slug: row.slug ?? undefined,
        summary: row.summary,
        priority: row.priority,
        index_categories: row.index_categories,
      })),
      cursor: last
        ? JSON.stringify(encodeDocumentValue({ _creationTime: last._creationTime, _id: last._id }))
        : (cursor ?? ""),
      isDone: result.rows.length <= limit,
    };
  }

  async getPublicSubstanceEffectMembershipPage(cursor: string | undefined, limit: number) {
    const decoded = cursor ? (decodeDocumentValue(JSON.parse(cursor)) as { _creationTime?: number; _id?: string }) : null;
    // Generic paginate emits "{}" for an empty initial page; retain its cursor contract.
    const after = decoded?._creationTime != null && decoded._id != null ? decoded : null;
    const params: unknown[] = [];
    const where = after
      ? (params.push(after._creationTime, after._id), 'WHERE ("_creationTime", "_id" COLLATE "C") > ($1, $2::text COLLATE "C")')
      : "";
    params.push(limit + 1);
    // Keep nested effect groups intact, but never fetch article prose or provenance.
    // JSONB must be selected as text so the document codec preserves nulls and wrappers.
    const result = await this.client.query(
      `SELECT ${losslessSelectList("substanceIndex", [
        "_id", "_creationTime", "id", "title", "slug", "priority",
        "index_categories", "identification", "classification", "subjective_effects",
      ])} FROM "substanceIndex" ${where} ORDER BY "_creationTime" ASC, "_id" COLLATE "C" ASC LIMIT $${params.length}`,
      params,
    );
    const page = result.rows.slice(0, limit);
    const last = page[page.length - 1];
    return {
      rows: page.map((row) => fromRow("substanceIndex", row)),
      cursor: last
        ? JSON.stringify(encodeDocumentValue({ _creationTime: last._creationTime, _id: last._id }))
        : (cursor || "{}"),
      isDone: result.rows.length <= limit,
    };
  }

  async getPublicSubstanceSlugsPage(cursor: string | undefined, limit: number) {
    const unstored = cursor
      ? []
      : (await this.client.query(
          'SELECT "title", "slug" FROM "substanceIndex" WHERE "slug" IS NULL ORDER BY "_creationTime" ASC, "_id" ASC',
        )).rows;
    const params: unknown[] = [];
    const where = cursor ? (params.push(cursor), 'WHERE "slug" > $1') : 'WHERE "slug" IS NOT NULL';
    params.push(limit + 1);
    const stored = await this.client.query(
      `SELECT "title", "slug" FROM "substanceIndex" ${where} ORDER BY "slug" ASC, "_creationTime" ASC, "_id" ASC LIMIT $${params.length}`,
      params,
    );
    const storedPage = stored.rows.slice(0, limit);
    return {
      rows: [...unstored, ...storedPage].map((row) => ({
        title: row.title,
        slug: row.slug ?? undefined,
      })),
      cursor: stored.rows.length <= limit ? "" : storedPage[storedPage.length - 1]?.slug as string,
      isDone: stored.rows.length <= limit,
    };
  }

  async getPublicSubstanceSlugsByCandidates(candidates: readonly string[]): Promise<Doc[]> {
    if (candidates.length === 0) return [];
    const result = await this.client.query(
      `SELECT ${losslessSelectList("substanceIndex", ["_id", "_creationTime", "title", "slug"])}
       FROM "substanceIndex"
       WHERE "slug" = ANY($1::text[]) OR "slug" IS NULL OR "slug" = ''
       ORDER BY "_creationTime" ASC, "_id" ASC`,
      [candidates],
    );
    return result.rows.map((row) => fromRow("substanceIndex", row));
  }

  async getPublicSubstanceCoveragePage(cursor: string | undefined, limit: number) {
    const after = cursor ? (decodeDocumentValue(JSON.parse(cursor)) as { _creationTime: number; _id: string }) : null;
    const params: unknown[] = [];
    const where = after
      ? (params.push(after._creationTime, after._id), 'WHERE ("_creationTime", "_id" COLLATE "C") > ($1, $2::text COLLATE "C")')
      : "";
    params.push(limit + 1);
    const result = await this.client.query(
      `SELECT ${losslessSelectList("substanceIndex", [
        "_id", "_creationTime", "title", "slug", "priority", "index_categories",
        "dosage", "duration", "subjective_effects", "pharmacology", "interactions",
        "tolerance", "harm_potential", "history_culture", "legality",
        "references", "source_citations", "citations", "editorial_review",
      ])} FROM "substanceIndex" ${where}
       ORDER BY "_creationTime" ASC, "_id" COLLATE "C" ASC LIMIT $${params.length}`,
      params,
    );
    const page = result.rows.slice(0, limit);
    const last = page[page.length - 1];
    return {
      rows: page.map((row) => fromRow("substanceIndex", row)),
      cursor: last
        ? JSON.stringify(encodeDocumentValue({ _creationTime: last._creationTime, _id: last._id }))
        : (cursor ?? ""),
      isDone: result.rows.length <= limit,
    };
  }

  async getFeedbackCountByStatuses(
    table: "articleFeedback" | "siteFeedback",
    statuses: readonly string[],
  ): Promise<number> {
    if (statuses.length === 0) return 0;
    const result = await this.client.query(
      `SELECT count(*)::text AS "count" FROM ${quote(table)} WHERE (to_jsonb("status") #>> '{}') = ANY($1::text[])`,
      [statuses],
    );
    return Number(result.rows[0]?.count ?? 0);
  }

  async getCitationEvidenceReviewRows(slug: string) {
    const fields = [
      "_id", "_creationTime", "slug", "section", "claimKey", "claimText", "fieldPath",
      "referenceIds", "status", "statusReason", "severity", "confidence",
      "supportingSnippet", "supportRationale", "supports", "diagnostics", "updatedAt",
    ] as const;
    const result = await this.client.query(
      `SELECT ${losslessSelectList("citationEvidence", fields)}
       FROM "citationEvidence"
       WHERE "slug" = $1
       ORDER BY "section" COLLATE "C" ASC, "claimKey" COLLATE "C" ASC, "_creationTime" ASC`,
      [slug],
    );
    return result.rows.map((row) => {
      const decoded = fromRow("citationEvidence", row);
      return Object.fromEntries(
        fields
          .filter((field) => field !== "_id" && field !== "_creationTime")
          .filter((field) => decoded[field] !== undefined)
          .map((field) => [field, decoded[field]]),
      );
    });
  }

  async getCitationQueueSummaries(): Promise<CitationQueueSummary[]> {
    const result = await this.client.query(
      `WITH ordered AS (
         SELECT e."_id", e."_creationTime", e.slug, e."articleId", e.section,
                e.status, e.severity, e.diagnostics, e."updatedAt",
                floor((row_number() OVER (
                  ORDER BY e."_creationTime" ASC, e."_id" COLLATE "C" ASC
                ) - 1) / 1000)::bigint AS page_number
         FROM "citationEvidence" e
       ),
       page_first AS (
         SELECT DISTINCT ON (slug COLLATE "C", page_number)
                slug, page_number, to_jsonb("articleId") #>> '{}' AS article_id
         FROM ordered
         ORDER BY slug COLLATE "C" ASC, page_number ASC, "_creationTime" ASC, "_id" COLLATE "C" ASC
       ),
       selected_article AS (
         SELECT DISTINCT ON (slug COLLATE "C") slug, article_id
         FROM page_first
         WHERE article_id IS NOT NULL
         ORDER BY slug COLLATE "C" ASC, page_number ASC
       )
       SELECT e.slug,
              a.article_id,
              count(*)::text AS total_rows,
              count(*) FILTER (WHERE to_jsonb(e.status) #>> '{}' = 'supported')::text AS supported_count,
              count(*) FILTER (WHERE to_jsonb(e.status) #>> '{}' = 'needs_source')::text AS needs_source_count,
              count(*) FILTER (WHERE to_jsonb(e.status) #>> '{}' = 'needs_review')::text AS needs_review_count,
              count(*) FILTER (WHERE to_jsonb(e.status) #>> '{}' = 'approved')::text AS approved_count,
              count(*) FILTER (WHERE to_jsonb(e.status) #>> '{}' = 'rejected')::text AS rejected_count,
              count(*) FILTER (WHERE to_jsonb(e.severity) #>> '{}' = 'blocking')::text AS blocking_count,
              count(*) FILTER (WHERE to_jsonb(e.severity) #>> '{}' = 'blocking' AND to_jsonb(e.status) #>> '{}' = 'needs_source')::text AS blocking_needs_source_count,
              count(*) FILTER (WHERE to_jsonb(e.severity) #>> '{}' = 'blocking' AND to_jsonb(e.status) #>> '{}' = 'needs_review')::text AS blocking_needs_review_count,
              count(*) FILTER (WHERE to_jsonb(e.severity) #>> '{}' = 'blocking' AND to_jsonb(e.status) #>> '{}' = 'supported')::text AS blocking_supported_count,
              count(*) FILTER (WHERE to_jsonb(e.severity) #>> '{}' = 'blocking' AND to_jsonb(e.status) #>> '{}' = 'rejected')::text AS blocking_rejected_count,
              coalesce(sum((
                SELECT count(*) FROM jsonb_array_elements(
                  CASE WHEN jsonb_typeof(e.diagnostics) = 'array' THEN e.diagnostics ELSE '[]'::jsonb END
                ) diagnostic WHERE diagnostic ->> 'severity' = 'error'
              )), 0)::text AS diagnostic_error_count,
              coalesce(sum((
                SELECT count(*) FROM jsonb_array_elements(
                  CASE WHEN jsonb_typeof(e.diagnostics) = 'array' THEN e.diagnostics ELSE '[]'::jsonb END
                ) diagnostic WHERE diagnostic ->> 'severity' IS DISTINCT FROM 'error'
              )), 0)::text AS diagnostic_warning_count,
              array_agg(DISTINCT e.section) AS section_ids,
              max(e."updatedAt") AS updated_at
       FROM ordered e
       LEFT JOIN selected_article a ON a.slug = e.slug
       GROUP BY e.slug, a.article_id`,
    );
    const count = (value: unknown) => Number(value ?? 0);
    return result.rows.map((row) => ({
      slug: row.slug as string,
      articleId: row.article_id == null ? null : Number(row.article_id),
      totalRows: count(row.total_rows),
      supportedCount: count(row.supported_count),
      needsSourceCount: count(row.needs_source_count),
      needsReviewCount: count(row.needs_review_count),
      approvedCount: count(row.approved_count),
      rejectedCount: count(row.rejected_count),
      blockingCount: count(row.blocking_count),
      blockingNeedsSourceCount: count(row.blocking_needs_source_count),
      blockingNeedsReviewCount: count(row.blocking_needs_review_count),
      blockingSupportedCount: count(row.blocking_supported_count),
      blockingRejectedCount: count(row.blocking_rejected_count),
      diagnosticErrorCount: count(row.diagnostic_error_count),
      diagnosticWarningCount: count(row.diagnostic_warning_count),
      sectionIds: row.section_ids as string[],
      updatedAt: row.updated_at as string | null,
    }));
  }

  async getReplicationPlaylistSummaryRows(ownerEmail?: string) {
    const params: unknown[] = [];
    const ownerFilter = ownerEmail === undefined
      ? ""
      : (params.push(ownerEmail), 'AND "owner_email" = $1');
    const result = await this.client.query(
      `SELECT "key", "title", jsonb_array_length("replication_slugs") AS "work_count",
              "updated_at", "updated_by", "owner_email"
       FROM "replicationPlaylists"
       WHERE coalesce("archived_at", '') = '' ${ownerFilter}`,
      params,
    );
    return result.rows as Array<{
      key: string;
      title: string;
      work_count: number;
      updated_at: string;
      updated_by: string | null;
      owner_email: string | null;
    }>;
  }


  /**
   * Compact related-report cards for article startup. The ready index uses a
   * targeted join. Before backfill readiness, Postgres scans the same compact
   * projection and applies the legacy case-insensitive membership test without
   * transporting narrative bodies.
   */
  async getPublicTripReportPreviewsBySubstanceNames(
    names: readonly string[],
  ): Promise<Doc[]> {
    if (names.length === 0) return [];
    const lowerNames = new Set(names.map((name) => name.toLowerCase()));
    const state = await this.client.query(
      'SELECT "version", "ready" FROM "publicReadIndexState" WHERE "name" = $1 ORDER BY "_creationTime" ASC LIMIT 2',
      ["tripReports"],
    );
    const indexReady =
      state.rows.length === 1 &&
      state.rows[0]?.version === 1 &&
      state.rows[0]?.ready === true;
    const result = indexReady
      ? await this.client.query(
          'SELECT r."_id", r."_creationTime", r."slug", r."title", r."featured", r."subject", r."substances", r."attribution_review" FROM "tripReports" r WHERE EXISTS (SELECT 1 FROM "tripReportSubstances" s WHERE s."report_id" = r."_id" AND s."name_lower" = ANY($1::text[])) ORDER BY r."_creationTime" ASC, r."_id" ASC',
          [[...lowerNames]],
        )
      : await this.client.query(
          'SELECT "_id", "_creationTime", "slug", "title", "featured", "subject", "substances", "attribution_review" FROM "tripReports" ORDER BY "_creationTime" ASC, "_id" ASC',
        );
    const rows = result.rows as Doc[];
    return indexReady
      ? rows
      : rows.filter((report) =>
          (report.substances as Array<{ name: string }>).some((substance) =>
            lowerNames.has(substance.name.toLowerCase()),
          ),
        );
  }

  /** Synchronous: `indexedMutation` reads it without awaiting. Unknown ids resolve to null. */
  normalizeId(table: string, id: string): string | null {
    if (typeof id !== "string" || !/^[a-z0-9]{32}$/.test(id)) return null;
    return this.tableOfSync(id) === assertTable(table) ? id : null;
  }
}

export class PostgresDatabaseWriter extends PostgresDatabaseReader {
  async insert(table: string, value: Record<string, unknown>): Promise<string> {
    const name = assertTable(table);
    const doc: Doc = { ...value, _id: mintDataId(name), _creationTime: Date.now() };
    await this.write(name, doc, "insert");
    await this.client.query('INSERT INTO "documentIds" ("_id", "table") VALUES ($1, $2)', [doc._id, name]);
    this.rememberTable(doc._id, name);
    return doc._id;
  }

  async patch(idOrTable: string, idOrValue: string | Record<string, unknown>, maybeValue?: Record<string, unknown>): Promise<void> {
    const id = typeof idOrValue === "string" ? idOrValue : idOrTable;
    const value = (typeof idOrValue === "string" ? maybeValue : idOrValue) ?? {};
    const table = typeof idOrValue === "string" ? assertTable(idOrTable) : await this.tableOf(id);
    if (!table) throw new Error(`Cannot patch missing document ${id}`);
    const current = await this.lockedGet(table, id);
    const next: Doc = { ...current };
    for (const [key, field] of Object.entries(value)) {
      if (key === "_id" || key === "_creationTime") continue;
      if (field === undefined) delete next[key];
      else next[key] = field;
    }
    await this.write(table, next, "update");
  }

  async replace(idOrTable: string, idOrValue: string | Record<string, unknown>, maybeValue?: Record<string, unknown>): Promise<void> {
    const id = typeof idOrValue === "string" ? idOrValue : idOrTable;
    const value = (typeof idOrValue === "string" ? maybeValue : idOrValue) ?? {};
    const table = typeof idOrValue === "string" ? assertTable(idOrTable) : await this.tableOf(id);
    if (!table) throw new Error(`Cannot replace missing document ${id}`);
    const current = await this.lockedGet(table, id);
    const next: Doc = { ...value, _id: current._id, _creationTime: current._creationTime };
    await this.write(table, next, "update");
  }

  async delete(idOrTable: string, maybeId?: string): Promise<void> {
    const id = maybeId ?? idOrTable;
    const table = maybeId ? assertTable(idOrTable) : await this.tableOf(id);
    if (!table) throw new Error(`Cannot delete missing document ${id}`);
    await this.client.query(`DELETE FROM ${quote(table)} WHERE "_id" = $1`, [id]);
    await this.client.query('DELETE FROM "documentIds" WHERE "_id" = $1', [id]);
    this.rememberTable(id, null);
  }

  private async lockedGet(table: TableName, id: string): Promise<Doc> {
    if (table === "effectIndexArticles") {
      await lockLocalizedPublicationIndexes(this.client);
    }
    const result = await this.client.query(
      `SELECT ${losslessSelectList(table)} FROM ${quote(table)} WHERE "_id" = $1 FOR UPDATE`,
      [id],
    );
    const row = result.rows[0] as Record<string, unknown> | undefined;
    if (!row) throw new Error(`Document ${id} does not exist in ${table}`);
    return fromRow(table, row);
  }

  private async write(table: TableName, doc: Doc, mode: "insert" | "update"): Promise<void> {
    const row = toRow(table, doc);
    const columns = Object.keys(row);
    const params = columns.map((c) => {
      const v = row[c];
      return typeof v === "number" && Object.is(v, -0) ? "-0" : v;
    });
    if (mode === "insert") {
      const placeholders = columns.map((c, i) => `$${i + 1}${(tableColumns[table] as Record<string, ColumnSpec>)[c].kind === "jsonb" ? "::jsonb" : ""}`);
      await this.client.query(
        `INSERT INTO ${quote(table)} (${columns.map(quote).join(", ")}) VALUES (${placeholders.join(", ")})`,
        params,
      );
      if (table === "effectIndexArticles") {
        await refreshLocalizedPublicationIndexes(this.client);
      }
      return;
    }
    const assignments = columns
      .filter((c) => c !== "_id")
      .map((c) => `${quote(c)} = $${columns.indexOf(c) + 1}${(tableColumns[table] as Record<string, ColumnSpec>)[c].kind === "jsonb" ? "::jsonb" : ""}`);
    await this.client.query(
      `UPDATE ${quote(table)} SET ${assignments.join(", ")} WHERE "_id" = $${columns.indexOf("_id") + 1}`,
      params,
    );
    if (table === "effectIndexArticles") {
      await refreshLocalizedPublicationIndexes(this.client);
    }
  }
}
