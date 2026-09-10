/**
 * Reads the composed Convex schema as validator JSON. `SchemaDefinition.export()`
 * is what `npx convex` itself serialises for deployment; Convex marks it
 * internal in the type declarations, so it is accessed through one narrowed
 * boundary here.
 */

import schema from "../../convex/schema";

export type ValidatorJson =
  | { type: "string" | "number" | "boolean" | "null" | "any" | "bytes" | "int64" | "undefined" }
  | { type: "literal"; value: string | number | boolean }
  | { type: "id"; tableName: string }
  | { type: "array"; value: ValidatorJson }
  | { type: "union"; value: ValidatorJson[] }
  | { type: "record"; keys: ValidatorJson; values: ValidatorJson }
  | { type: "object"; value: ObjectFields };

export type ObjectFields = Record<string, { fieldType: ValidatorJson; optional: boolean }>;

export type ExportedTable = {
  tableName: string;
  indexes: { indexDescriptor: string; fields: string[] }[];
  searchIndexes: unknown[];
  vectorIndexes: unknown[];
  documentType: ValidatorJson;
};

export function exportConvexTables(): ExportedTable[] {
  // Internal Convex API: present at runtime on every SchemaDefinition, absent from the public typings.
  const exportable: { export(): string } = schema as unknown as { export(): string };
  const parsed = JSON.parse(exportable.export()) as { tables: ExportedTable[] };
  return parsed.tables;
}

/** Narrow a table's document validator to its object fields or fail loudly. */
export function objectFieldsOf(table: ExportedTable): ObjectFields {
  if (table.documentType.type !== "object") {
    throw new Error(`Table ${table.tableName} has a non-object document type; extend the Postgres generator`);
  }
  return table.documentType.value;
}
