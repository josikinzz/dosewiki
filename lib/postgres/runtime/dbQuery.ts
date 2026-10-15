import { decodeDocumentValue, encodeDocumentValue, losslessSelectList } from "../documentCodec";
import { tableIndexes, type TableName } from "../schema.generated";
import { evaluate, filterBuilder, lit, readPath, type Expr } from "./dbFilter";
import { boundToSql, columnExpr, IndexRange, SQL_TYPE, sqlParam, type Fetch } from "./dbIndexRange";
import { fromRow, quote, type Doc, type SqlExecutor } from "./dbRows";

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

  private async *rows(startAfter?: Doc, wanted?: number): AsyncGenerator<Doc> {
    const fetch: Fetch = { where: [], params: [] };
    for (const bound of this.range?.bounds ?? []) boundToSql(this.table, bound, fetch);
    const direction = this.orderDirection === "asc" ? "ASC" : "DESC";
    const keys = this.orderKeys();
    if (startAfter) {
      const values = keys.map((key) => startAfter[key]);
      if (values.every((value) => value !== undefined && value !== null)) {
        const columns = keys.map((key) => columnExpr(this.table, key));
        const placeholders = columns.map((column, index) => {
          const value = column.nested && typeof values[index] !== "string" ? JSON.stringify(encodeDocumentValue(values[index])) : values[index];
          fetch.params.push(sqlParam({ kind: column.kind, optional: true }, value));
          return `$${fetch.params.length}::${SQL_TYPE[column.kind]}`;
        });
        const tuple = `(${columns.map((column) => column.sql).join(", ")}) ${this.orderDirection === "asc" ? ">" : "<"} (${placeholders.join(", ")})`;
        const nullBranches = columns.slice(0, -1).map((column, index) =>
          `(${columns.slice(0, index).map((prior, priorIndex) => `${prior.sql} = ${placeholders[priorIndex]}`).concat(`${column.sql} IS NULL`).join(" AND ")})`);
        fetch.where.push(this.orderDirection === "asc" ? `(${tuple} OR ${nullBranches.join(" OR ")})` : tuple);
      } else {
        const terms: string[] = [];
        const equal: string[] = [];
        for (const key of keys) {
          const column = columnExpr(this.table, key);
          const value = startAfter[key];
          const missing = value === undefined || value === null;
          if (missing) {
            if (this.orderDirection === "desc") terms.push([...equal, `${column.sql} IS NOT NULL`].join(" AND "));
            equal.push(`${column.sql} IS NULL`);
            continue;
          }
          const encoded = column.nested && typeof value !== "string" ? JSON.stringify(encodeDocumentValue(value)) : value;
          fetch.params.push(sqlParam({ kind: column.kind, optional: true }, encoded));
          const param = `$${fetch.params.length}::${SQL_TYPE[column.kind]}`;
          const after = this.orderDirection === "asc"
            ? `(${column.sql} > ${param} OR ${column.sql} IS NULL)`
            : `${column.sql} < ${param}`;
          terms.push([...equal, after].join(" AND "));
          equal.push(`${column.sql} = ${param}`);
        }
        fetch.where.push(`(${terms.map((term) => `(${term})`).join(" OR ")})`);
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
    let startAfter: Doc | undefined;
    if (options.cursor) {
      try {
        const decoded = decodeDocumentValue(JSON.parse(options.cursor)) as Record<string, unknown>;
        if (!decoded || typeof decoded !== "object" || Array.isArray(decoded) ||
            typeof decoded._id !== "string" || !/^[a-z0-9]{32}$/.test(decoded._id) ||
            typeof decoded._creationTime !== "number" || !Number.isFinite(decoded._creationTime)) {
          throw new Error("Invalid pagination cursor");
        }
        startAfter = decoded as Doc;
      } catch { throw new Error("Invalid pagination cursor"); }
    }
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

export class QueryInitializer extends Query {
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
