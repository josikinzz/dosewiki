import { createHash, randomInt } from "node:crypto";
import { tableNames, type TableName } from "../schema.generated";
import { isTableName, type SqlExecutor } from "./dbRows";

const ID_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

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

export type IdTableMap = Map<string, TableName>;

export function taggedIdTable(id: string): TableName | undefined {
  return /^[a-z0-9]{32}$/.test(id) ? TABLE_TAGS.get(id.slice(0, 4)) : undefined;
}

export async function loadIdTableMap(executor: SqlExecutor, ids: readonly string[]): Promise<IdTableMap> {
  const map: IdTableMap = new Map();
  for (let offset = 0; offset < ids.length; offset += 256) {
    const result = await executor.query('SELECT "_id", "table" FROM "documentIds" WHERE "_id" = ANY($1::text[])', [ids.slice(offset, offset + 256)]);
    for (const row of result.rows) {
      const table = row.table as string;
      if (isTableName(table)) map.set(row._id as string, table);
    }
  }
  return map;
}
