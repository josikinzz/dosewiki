import { randomBytes } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { documentToRow, encodeField, losslessSelectList, rowToDocument, type DataDocument } from "./documentCodec";
import { tableColumns, type TableName } from "./schema.generated";
import { beginWithTimeouts } from "./transactionTimeouts";
import { lockLocalizedPublicationIndexes, refreshLocalizedPublicationIndexes } from "../translation/publicationIndexStore";
import { assertDataWritesNotFrozen, isDataWriteFreezeActive } from "../runtime/dataWriteFreeze";

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
  where?: string;
  params?: unknown[];
  orderBy?: string;
  limit?: number;
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

export async function insertDocument(client: SqlClient, table: TableName, value: DataDocument): Promise<string> {
  assertDataWritesNotFrozen(`insertDocument:${table}`);
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
    await refreshLocalizedPublicationIndexes(client, { publicationId: document._id as string });
  }
  return document._id as string;
}

export async function patchDocument(client: SqlClient, table: TableName, id: string, patch: DataDocument): Promise<boolean> {
  assertDataWritesNotFrozen(`patchDocument:${table}`);
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
    await refreshLocalizedPublicationIndexes(client, { publicationId: id });
  }
  return (result.rowCount ?? 0) === 1;
}

export async function deleteDocument(client: SqlClient, table: TableName, id: string): Promise<boolean> {
  assertDataWritesNotFrozen(`deleteDocument:${table}`);
  const result = await client.query(`DELETE FROM ${quoteIdentifier(table)} WHERE "_id" = $1`, [id]);
  await client.query('DELETE FROM "documentIds" WHERE "_id" = $1', [id]);
  return (result.rowCount ?? 0) === 1;
}

export async function withTransaction<T>(pool: Pool, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query(beginWithTimeouts(isDataWriteFreezeActive() ? "BEGIN READ ONLY" : "BEGIN"));
    try {
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
