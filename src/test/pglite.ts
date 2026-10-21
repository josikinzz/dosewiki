import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import type { Pool } from "pg";
import type { Mock } from "vitest";

const MIGRATIONS = "lib/postgres/migrations";

export async function migratedPGlite() {
  const database = new PGlite();
  for (const file of readdirSync(MIGRATIONS).filter((name) => name.endsWith(".sql")).sort())
    await database.exec(readFileSync(`${MIGRATIONS}/${file}`, "utf8"));
  return database;
}

export function routeTransportToPGlite(transport: { sql: Mock; sqlTransaction: Mock }, database: PGlite) {
  transport.sql.mockImplementation(async (query: string, params: unknown[] = []) => (await database.query(query, params)).rows);
  transport.sqlTransaction.mockImplementation((operation: (tx: { query: typeof database.query }) => Promise<unknown>) =>
    database.transaction((tx) => operation({ query: tx.query.bind(tx) as typeof database.query })));
}

export function pglitePool(database: PGlite) {
  const connection = {
    query: async (sql: string, params?: unknown[]) => {
      if (!params?.length && sql.includes(";")) {
        const results = await database.exec(sql);
        const result = results[results.length - 1];
        return { rows: result?.rows ?? [], rowCount: result?.affectedRows ?? 0 };
      }
      const result = await database.query(sql, params);
      return { rows: result.rows, rowCount: result.affectedRows ?? 0 };
    },
    release() {},
  };
  return { on() {}, connect: async () => connection } as unknown as Pool;
}
