import { encodeDocumentValue } from "../documentCodec";
import { tableColumns, type ColumnSpec, type TableName } from "../schema.generated";
import { quote } from "./dbRows";

// ---------------------------------------------------------------------------
// Index ranges (`withIndex("by_x", q => q.eq("x", 1).gt("y", 2))`) as SQL.
// ---------------------------------------------------------------------------

type Bound = { field: string; op: "=" | ">" | ">=" | "<" | "<="; value: unknown };

export class IndexRange {
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

export const SQL_TYPE: Record<ColumnSpec["kind"], string> = {
  text: "text",
  double: "float8",
  boolean: "boolean",
  bigint: "bigint",
  bytea: "bytea",
  jsonb: "jsonb",
};

export function sqlParam(spec: ColumnSpec, value: unknown): unknown {
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

export type Fetch = { where: string[]; params: unknown[] };

/**
 * SQL expression and comparison type for an index field. Nested paths
 * (`subject.profile_key`) live inside jsonb and are indexed as text with
 * `->>`, matching `generateDrizzleSchema.ts`, so they compare as text.
 */
export function columnExpr(table: TableName, field: string): { sql: string; kind: ColumnSpec["kind"]; nested: boolean } {
  const [head, ...rest] = field.split(".");
  const spec = (tableColumns[table] as Record<string, ColumnSpec>)[head];
  if (!spec) throw new Error(`Column ${table}.${head} is not declared`);
  // `COLLATE "C"` gives deterministic string ordering and matches the generated indexes.
  if (rest.length === 0) return { sql: spec.kind === "text" ? `${quote(head)} COLLATE "C"` : quote(head), kind: spec.kind, nested: false };
  if (spec.kind !== "jsonb") throw new Error(`Nested index field ${table}.${field} on non-jsonb column`);
  const path = rest.map((segment, i) => `${i === rest.length - 1 ? "->>" : "->"}'${segment.replace(/'/g, "''")}'`).join("");
  return { sql: `(${quote(head)}${path}) COLLATE "C"`, kind: "text", nested: true };
}

export function boundToSql(table: TableName, bound: Bound, out: Fetch): void {
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
