/**
 * Document-shaped access to Postgres tables.
 *
 * Reads go through `losslessSelectList` / `rowToDocument` so a document read
 * back from SQL preserves the persisted document encoding; writes go through
 * `documentToRow` so every column is encoded exactly once. New rows mint an
 * `_id` of 32 lowercase alphanumeric characters and `_creationTime` in
 * milliseconds, keeping imported and Postgres-born rows in one id namespace.
 */

import { randomBytes } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { documentToRow, encodeField, losslessSelectList, rowToDocument, type DataDocument } from "./documentCodec";
import { tableColumns, type TableName } from "./schema.generated";
import { setTransactionTimeouts } from "./transactionTimeouts";
import { lockLocalizedPublicationIndexes, refreshLocalizedPublicationIndexes } from "../translation/publicationIndexStore";
import { isDataWriteFreezeActive } from "../runtime/dataWriteFreeze";

export type SqlClient = Pick<PoolClient, "query">;

const ID_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

export function mintDocumentId(): string {
  const bytes = randomBytes(32);
  let id = "";
  for (let i = 0; i < 32; i += 1) id += ID_ALPHABET[bytes[i] % ID_ALPHABET.length];
  return id;
}

export function quoteIdentifier(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

function placeholder(table: TableName, column: string, index: number): string {
  const spec = tableColumns[table][column as keyof (typeof tableColumns)[typeof table]] as { kind: string } | undefined;
  if (!spec) throw new Error(`Column ${table}.${column} is not declared in the schema`);
  return spec.kind === "jsonb" ? `$${index}::jsonb` : `$${index}`;
}

export type SelectOptions = {
  /** SQL after WHERE, using $1.. for `params`. */
  where?: string;
  params?: unknown[];
  orderBy?: string;
  limit?: number;
  /** Row-level lock for a read-then-write critical section. */
  forUpdate?: boolean;
};

export async function selectDocuments(client: SqlClient, table: TableName, options: SelectOptions = {}): Promise<DataDocument[]> {
  if (table === "effectIndexArticles" && options.forUpdate) {
    await lockLocalizedPublicationIndexes(client);
  }
  const clauses = [`SELECT ${losslessSelectList(table)} FROM ${quoteIdentifier(table)}`];
  if (options.where) clauses.push(`WHERE ${options.where}`);
  if (options.orderBy) clauses.push(`ORDER BY ${options.orderBy}`);
  if (options.limit !== undefined) clauses.push(`LIMIT ${Math.trunc(options.limit)}`);
  if (options.forUpdate) clauses.push("FOR UPDATE");
  const result = await client.query(clauses.join(" "), options.params ?? []);
  return result.rows.map((row) => rowToDocument(table, row));
}

export async function selectDocumentById(client: SqlClient, table: TableName, id: string, forUpdate = false): Promise<DataDocument | null> {
  const [document] = await selectDocuments(client, table, { where: '"_id" = $1', params: [id], limit: 1, forUpdate });
  return document ?? null;
}

/** Insert a document, minting `_id` and `_creationTime` unless supplied. Returns the id. */
export async function insertDocument(client: SqlClient, table: TableName, value: DataDocument): Promise<string> {
  const document = { _id: mintDocumentId(), _creationTime: Date.now(), ...value };
  const encoded = documentToRow(table, document);
  if (encoded.unknownFields.length) {
    throw new Error(`Cannot insert ${table}: undeclared fields ${encoded.unknownFields.join(", ")}`);
  }
  const columns = Object.keys(encoded.row);
  const sql = `INSERT INTO ${quoteIdentifier(table)} (${columns.map(quoteIdentifier).join(", ")}) VALUES (${columns
    .map((column, index) => placeholder(table, column, index + 1))
    .join(", ")})`;
  await client.query(sql, columns.map((column) => encoded.row[column]));
  await client.query('INSERT INTO "documentIds" ("_id", "table") VALUES ($1, $2)', [document._id, table]);
  if (table === "effectIndexArticles") {
    await refreshLocalizedPublicationIndexes(client);
  }
  return document._id as string;
}

/**
 * Patch top-level fields of one document: only the named fields change,
 * `undefined` clears an optional field, and everything else is untouched.
 * Returns false when the id does not exist.
 */
export async function patchDocument(client: SqlClient, table: TableName, id: string, patch: DataDocument): Promise<boolean> {
  const fields = Object.keys(patch);
  if (fields.length === 0) return (await selectDocumentById(client, table, id)) !== null;
  const specs = tableColumns[table] as Record<string, { kind: string; optional: boolean }>;
  const assignments: string[] = [];
  const params: unknown[] = [];
  for (const field of fields) {
    const spec = specs[field];
    if (!spec) throw new Error(`Cannot patch ${table}.${field}: undeclared field`);
    if (field === "_id" || field === "_creationTime") throw new Error(`Cannot patch ${table}.${field}`);
    const value = patch[field];
    if (value === undefined) {
      if (!spec.optional) throw new Error(`Cannot clear required field ${table}.${field}`);
      assignments.push(`${quoteIdentifier(field)} = NULL`);
      continue;
    }
    params.push(encodeField(table, field, value));
    assignments.push(`${quoteIdentifier(field)} = ${placeholder(table, field, params.length)}`);
  }
  params.push(id);
  const result = await client.query(`UPDATE ${quoteIdentifier(table)} SET ${assignments.join(", ")} WHERE "_id" = $${params.length}`, params);
  if (table === "effectIndexArticles" && result.rowCount) {
    await refreshLocalizedPublicationIndexes(client);
  }
  return (result.rowCount ?? 0) === 1;
}

export async function deleteDocument(client: SqlClient, table: TableName, id: string): Promise<boolean> {
  const result = await client.query(`DELETE FROM ${quoteIdentifier(table)} WHERE "_id" = $1`, [id]);
  await client.query('DELETE FROM "documentIds" WHERE "_id" = $1', [id]);
  return (result.rowCount ?? 0) === 1;
}

/** Run `fn` in one transaction; any throw rolls back and is rethrown. */
export async function withTransaction<T>(pool: Pool, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query(isDataWriteFreezeActive() ? "BEGIN READ ONLY" : "BEGIN");
    try {
      await setTransactionTimeouts(client);
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  } finally {
    client.release();
  }
}
