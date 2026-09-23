/**
 * Transaction executor and document row conversion shared by the runtime
 * reader, writer, and query builder in `db.ts`.
 */

import type { PoolClient } from "pg";
import { decodeDocumentValue, encodeDocumentValue, documentToRow, rowToDocument, type DataDocument } from "../documentCodec";
import { tableNames, type TableName } from "../schema.generated";

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

export const quote = (name: string) => `"${name.replace(/"/g, '""')}"`;

export function isTableName(value: string): value is TableName {
  return (tableNames as readonly string[]).includes(value);
}

export function assertTable(value: string): TableName {
  if (!isTableName(value)) throw new Error(`Unknown table ${value}`);
  return value;
}

/** Native document -> persisted JSON encoding -> row. `undefined` fields are dropped on write. */
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
