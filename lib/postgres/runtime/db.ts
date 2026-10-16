import { encodeDocumentValue, encodeField, losslessSelectList } from "../documentCodec";
import { tableColumns, type ColumnSpec, type TableName } from "../schema.generated";
import { lockLocalizedPublicationIndexes, refreshLocalizedPublicationIndexes } from "../../translation/publicationIndexStore";
import { EditorialProjectionReader } from "./dbEditorialReads";
import { mintDataId, taggedIdTable, type IdTableMap } from "./dbIds";
import { QueryInitializer } from "./dbQuery";
import { assertTable, fromRow, isTableName, quote, toRow, type Doc, type SqlExecutor } from "./dbRows";

export { serialExecutor, type Doc, type SqlExecutor } from "./dbRows";
export { loadIdTableMap, mintDataId, taggedIdTable, type IdTableMap } from "./dbIds";

export class PostgresDatabaseReader extends EditorialProjectionReader {
  private readonly idTables = new Map<string, TableName | null>();

  constructor(
    client: SqlExecutor,
    private readonly knownIds: IdTableMap,
  ) {
    super(client);
  }

  protected tableOfSync(id: string): TableName | null | undefined {
    const cached = this.idTables.get(id);
    if (cached !== undefined) return cached;
    const known = this.knownIds.get(id);
    if (known) return known;
    const tagged = taggedIdTable(id);
    if (tagged) return tagged;
    return undefined;
  }

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
    if (resolved) this.knownIds.set(id, resolved);
    return resolved;
  }

  protected rememberTable(id: string, table: TableName | null): void {
    this.idTables.set(id, table);
    if (table) this.knownIds.set(id, table);
    else this.knownIds.delete(id);
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
    if (row) this.rememberTable(id, table);
    return row ? fromRow(table, row) : null;
  }

  query(table: string) {
    return new QueryInitializer(this.client, assertTable(table), (id, t) => this.rememberTable(id, t));
  }

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
    const specs = tableColumns[table] as Record<string, ColumnSpec>;
    const fields = Object.keys(value).filter((key) => key !== "_id" && key !== "_creationTime");
    const unknownFields = fields.filter((field) => !specs[field]);
    if (unknownFields.length) {
      throw new Error(`Document for ${table} carries fields the schema does not declare: ${unknownFields.join(", ")}`);
    }
    const assignments: string[] = [];
    const params: unknown[] = [];
    for (const field of fields) {
      if (value[field] === undefined) {
        if (!specs[field].optional) throw new Error(`Field ${table}.${field} is required but absent`);
        assignments.push(`${quote(field)} = NULL`);
        continue;
      }
      const encoded = encodeField(table, field, encodeDocumentValue(value[field]));
      params.push(typeof encoded === "number" && Object.is(encoded, -0) ? "-0" : encoded);
      assignments.push(`${quote(field)} = $${params.length}${specs[field].kind === "jsonb" ? "::jsonb" : ""}`);
    }
    params.push(id);
    if (table === "effectIndexArticles") {
      await lockLocalizedPublicationIndexes(this.client);
    }
    const result = assignments.length
      ? await this.client.query(`UPDATE ${quote(table)} SET ${assignments.join(", ")} WHERE "_id" = $${params.length}`, params)
      : await this.client.query(`SELECT "_id" FROM ${quote(table)} WHERE "_id" = $1 FOR UPDATE`, params);
    if (!result.rowCount) throw new Error(`Document ${id} does not exist in ${table}`);
    if (assignments.length && table === "effectIndexArticles") {
      await refreshLocalizedPublicationIndexes(this.client, { publicationId: id });
    }
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
        await refreshLocalizedPublicationIndexes(this.client, { publicationId: doc._id });
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
      await refreshLocalizedPublicationIndexes(this.client, { publicationId: doc._id });
    }
  }
}
