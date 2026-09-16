/**
 * Reads the application's owned document validators and ordered index metadata.
 */

import schema from "../../server/schema";

import type { ValidatorJson } from "../../lib/postgres/runtime/validate";

export type { ValidatorJson } from "../../lib/postgres/runtime/validate";

export type ObjectFields = Record<string, { fieldType: ValidatorJson; optional: boolean }>;

export type ExportedTable = {
  tableName: string;
  indexes: { indexDescriptor: string; fields: string[] }[];
  searchIndexes: unknown[];
  vectorIndexes: unknown[];
  documentType: ValidatorJson;
};

export function exportSchemaTables(): ExportedTable[] {
  return Object.entries(schema.tables).map(([tableName, table]) => ({
    tableName,
    indexes: table.indexes,
    searchIndexes: [],
    vectorIndexes: [],
    documentType: table.validator.json,
  }));
}

/** Narrow a table's document validator to its object fields or fail loudly. */
export function objectFieldsOf(table: ExportedTable): ObjectFields {
  if (table.documentType.type !== "object") {
    throw new Error(`Table ${table.tableName} has a non-object document type; extend the Postgres generator`);
  }
  return table.documentType.value;
}
