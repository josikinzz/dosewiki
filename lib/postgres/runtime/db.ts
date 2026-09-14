/**
 * Convex `DatabaseWriter` semantics over one Postgres transaction.
 *
 * Handlers in `convex/` keep running unchanged: index reads become keyset
 * SQL over the mirrored tables, documents round-trip through the export codec
 * (`rowToDocument` / `documentToRow`) plus `jsonToConvex` / `convexToJson` so
 * NaN, int64, and bytes keep their Convex types, and `db.get(id)` resolves the
 * table through `documentIds` because Convex ids do not decode to a table.
 *
 * Concurrency is the transaction's isolation level (the client runs mutations
 * SERIALIZABLE and retries on serialization failure), which stands in for
 * Convex's optimistic concurrency control.
 */

import { createHash, randomInt } from "node:crypto";
import type { PoolClient } from "pg";
import { convexToJson, jsonToConvex, type Value } from "convex/values";
import { documentToRow, losslessSelectList, rowToDocument, type ConvexDocument } from "../convexDocumentCodec";
import { tableColumns, tableIndexes, tableNames, type ColumnSpec, type TableName } from "../schema.generated";

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
 * resolve them synchronously without a lookup. Imported Convex ids carry no
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

export function mintConvexId(table: TableName): string {
  let id = tableTag(table);
  while (id.length < 32) id += ID_ALPHABET[randomInt(ID_ALPHABET.length)];
  return id;
}

/** Process-wide `_id -> table` map for ids that predate this runtime (imported from Convex). */
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

/** Native document -> export JSON -> row. `undefined` fields are dropped, as Convex does on write. */
function toRow(table: TableName, doc: Doc) {
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(doc)) if (value !== undefined) clean[key] = value;
  const json = convexToJson(clean as Value) as ConvexDocument;
  const encoded = documentToRow(table, json);
  if (encoded.unknownFields.length) {
    throw new Error(`Document for ${table} carries fields the schema does not declare: ${encoded.unknownFields.join(", ")}`);
  }
  return encoded.row;
}

function fromRow(table: TableName, row: Record<string, unknown>): Doc {
  return jsonToConvex(rowToDocument(table, row) as never) as Doc;
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

/** Convex total order across types: undefined < null < bigint < number < boolean < string < bytes < array < object. */
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
      const x = JSON.stringify(convexToJson(a as Value));
      const y = JSON.stringify(convexToJson(b as Value));
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
      return JSON.stringify(convexToJson(value as Value));
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
  // `COLLATE "C"` is Convex's code-unit string order and matches the generated indexes.
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
  const value = column.nested && typeof bound.value !== "string" ? JSON.stringify(convexToJson(bound.value as Value)) : bound.value;
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
          const value = column.nested && typeof values[i] !== "string" ? JSON.stringify(convexToJson(values[i] as Value)) : values[i];
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
    const startAfter = options.cursor ? (jsonToConvex(JSON.parse(options.cursor)) as Doc) : undefined;
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
    return { page, isDone, continueCursor: JSON.stringify(convexToJson(cursorDoc as Value)) };
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

  /** Synchronous like Convex: `indexedMutation` reads it without awaiting. Unknown ids resolve to null. */
  normalizeId(table: string, id: string): string | null {
    if (typeof id !== "string" || !/^[a-z0-9]{32}$/.test(id)) return null;
    return this.tableOfSync(id) === assertTable(table) ? id : null;
  }
}

export class PostgresDatabaseWriter extends PostgresDatabaseReader {
  async insert(table: string, value: Record<string, unknown>): Promise<string> {
    const name = assertTable(table);
    const doc: Doc = { ...value, _id: mintConvexId(name), _creationTime: Date.now() };
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
      return;
    }
    const assignments = columns
      .filter((c) => c !== "_id")
      .map((c) => `${quote(c)} = $${columns.indexOf(c) + 1}${(tableColumns[table] as Record<string, ColumnSpec>)[c].kind === "jsonb" ? "::jsonb" : ""}`);
    await this.client.query(
      `UPDATE ${quote(table)} SET ${assignments.join(", ")} WHERE "_id" = $${columns.indexOf("_id") + 1}`,
      params,
    );
  }
}
