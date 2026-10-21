import type { PoolClient } from "pg";
import { decodeDocumentValue, encodeDocumentValue, documentToRow, rowToDocument, type DataDocument } from "../documentCodec";
import { tableNames, type TableName } from "../schema.generated";
import type { Doc as TableDoc, TableNames } from "./dataModel";

export type Doc = Record<string, unknown> & { _id: string; _creationTime: number };

export type SqlExecutor = {
  query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }>;
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

export const quote = (name: string) => `"${name.replace(/"/g, '""')}"`;

export function isTableName(value: string): value is TableName {
  return (tableNames as readonly string[]).includes(value);
}

export function assertTable(value: string): TableName {
  if (!isTableName(value)) throw new Error(`Unknown table ${value}`);
  return value;
}

export function toRow(table: TableName, doc: Doc) {
  const json = encodeDocumentValue(doc) as DataDocument;
  const encoded = documentToRow(table, json);
  if (encoded.unknownFields.length) {
    throw new Error(`Document for ${table} carries fields the schema does not declare: ${encoded.unknownFields.join(", ")}`);
  }
  return encoded.row;
}

export function fromRow(table: TableName, row: Record<string, unknown>): Doc {
  return decodeDocumentValue(rowToDocument(table, row)) as Doc;
}

export function fromTableRow<Table extends TableName & TableNames>(table: Table, row: Record<string, unknown>): TableDoc<Table> {
  return fromRow(table, row) as unknown as TableDoc<Table>;
}

export function fromProjectedRow<Table extends TableName & TableNames, Column extends keyof TableDoc<Table> & string>(
  table: Table,
  columns: readonly Column[],
  row: Record<string, unknown>,
): Pick<TableDoc<Table>, Column> {
  const selected = new Set<string>(columns);
  return Object.fromEntries(
    Object.entries(fromRow(table, row)).filter(([field]) => selected.has(field)),
  ) as Pick<TableDoc<Table>, Column>;
}
