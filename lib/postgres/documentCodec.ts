import { createHash } from "node:crypto";
import { tableColumns, type ColumnSpec, type TableName } from "./schema.generated";
import type { Value } from "./runtime/values";

export type DocumentJson = null | boolean | number | string | DocumentJson[] | { [key: string]: DocumentJson };

export type DataDocument = Record<string, unknown>;
export type SqlRow = Record<string, unknown>;

export type RowEncoding = {
  row: SqlRow;
  unknownFields: string[];
};

function isWrapper(value: unknown, key: "$float" | "$integer" | "$bytes"): value is Record<typeof key, string> {
  return (
    typeof value === "object" &&
    value !== null &&
    key in value &&
    Object.keys(value).length === 1 &&
    typeof (value as Record<string, unknown>)[key] === "string"
  );
}

export function decodeFloat(encoded: string): number {
  const bytes = Buffer.from(encoded, "base64");
  if (bytes.length !== 8) throw new Error(`$float payload must be 8 bytes, got ${bytes.length}`);
  return bytes.readDoubleLE(0);
}

export function encodeFloat(value: number): string {
  const bytes = Buffer.alloc(8);
  bytes.writeDoubleLE(value, 0);
  return bytes.toString("base64");
}

export function decodeInteger(encoded: string): bigint {
  const bytes = Buffer.from(encoded, "base64");
  if (bytes.length !== 8) throw new Error(`$integer payload must be 8 bytes, got ${bytes.length}`);
  return bytes.readBigInt64LE(0);
}

function encodeInteger(value: bigint): string {
  const bytes = Buffer.alloc(8);
  bytes.writeBigInt64LE(value, 0);
  return bytes.toString("base64");
}

function needsFloatWrapper(value: number): boolean {
  return !Number.isFinite(value) || Object.is(value, -0);
}

function validateDocumentField(field: string): void {
  if (field.length > 1024 || field.startsWith("$") || /[^\x20-\x7e]/.test(field)) {
    throw new Error(`Invalid document field ${JSON.stringify(field)}`);
  }
}

export function encodeDocumentValue(value: unknown): DocumentJson {
  if (value === null) return null;
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return needsFloatWrapper(value) ? { $float: encodeFloat(value) } : value;
  if (typeof value === "bigint") return { $integer: encodeInteger(value) };
  if (value instanceof ArrayBuffer) return { $bytes: Buffer.from(value).toString("base64") };
  if (Array.isArray(value)) return value.map(encodeDocumentValue);
  if (typeof value !== "object" || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) {
    throw new Error(`Unsupported document value: ${typeof value}`);
  }
  const document: Record<string, DocumentJson> = {};
  for (const field of Object.keys(value).sort()) {
    const entry = (value as Record<string, unknown>)[field];
    if (entry === undefined) continue;
    validateDocumentField(field);
    Object.defineProperty(document, field, { value: encodeDocumentValue(entry), enumerable: true, configurable: true, writable: true });
  }
  return document;
}

export function decodeDocumentValue(value: unknown): Value {
  if (value === null) return null;
  if (typeof value === "string" || typeof value === "boolean" || typeof value === "number") return value;
  if (Array.isArray(value)) return value.map(decodeDocumentValue);
  if (typeof value !== "object") throw new Error(`Unsupported document JSON: ${typeof value}`);
  if (isWrapper(value, "$integer")) return decodeInteger(value.$integer);
  if (isWrapper(value, "$float")) {
    const number = decodeFloat(value.$float);
    if (!needsFloatWrapper(number)) throw new Error("A finite nonnegative-zero float must be encoded as a JSON number");
    return number;
  }
  if (isWrapper(value, "$bytes")) {
    const bytes = Buffer.from(value.$bytes, "base64");
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  }
  const document: Record<string, Value> = {};
  for (const [field, entry] of Object.entries(value)) {
    validateDocumentField(field);
    Object.defineProperty(document, field, { value: decodeDocumentValue(entry), enumerable: true, configurable: true, writable: true });
  }
  return document;
}

function decodeScalar(spec: ColumnSpec, value: unknown, field: string): unknown {
  switch (spec.kind) {
    case "double":
      if (typeof value === "number") return value;
      if (isWrapper(value, "$float")) return decodeFloat(value.$float);
      break;
    case "bigint":
      if (isWrapper(value, "$integer")) return decodeInteger(value.$integer);
      if (typeof value === "bigint") return value;
      break;
    case "bytea":
      if (isWrapper(value, "$bytes")) return Buffer.from(value.$bytes, "base64");
      if (value instanceof Uint8Array) return value;
      break;
    case "text":
      if (typeof value === "string") return value;
      break;
    case "boolean":
      if (typeof value === "boolean") return value;
      break;
    case "jsonb":
      return JSON.stringify(value);
  }
  throw new Error(`Field ${field} expected ${spec.kind}, got ${describe(value)}`);
}

function describe(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

export function encodeField(table: TableName, field: string, value: unknown): unknown {
  const spec = (tableColumns[table] as Record<string, ColumnSpec>)[field];
  if (!spec) throw new Error(`Field ${table}.${field} is not declared in the schema`);
  if (value === null && spec.kind !== "jsonb") return null;
  return decodeScalar(spec, value, `${table}.${field}`);
}

export function documentToRow(table: TableName, document: DataDocument): RowEncoding {
  const specs: Record<string, ColumnSpec> = tableColumns[table];
  const row: SqlRow = {};
  const unknownFields: string[] = [];
  for (const [field, value] of Object.entries(document)) {
    const spec = specs[field];
    if (!spec) {
      unknownFields.push(field);
      continue;
    }
    if (value === undefined) continue;
    if (value === null && spec.kind !== "jsonb") {
      row[field] = null;
      continue;
    }
    row[field] = decodeScalar(spec, value, `${table}.${field}`);
  }
  for (const [field, spec] of Object.entries(specs)) {
    if (!(field in row)) {
      if (!spec.optional && !(field in document)) {
        throw new Error(`Field ${table}.${field} is required but absent`);
      }
      row[field] = null;
    }
  }
  return { row, unknownFields };
}

export function losslessSelectList(table: TableName, fields?: readonly string[]): string {
  const specs: Record<string, ColumnSpec> = tableColumns[table];
  return (fields ?? Object.keys(specs))
    .map((field) => {
      const spec = specs[field];
      if (!spec) throw new Error(`Unknown column ${table}.${field}`);
      const quoted = `"${field.replace(/"/g, '""')}"`;
      return spec.kind === "jsonb" ? `${quoted}::text AS ${quoted}` : quoted;
    })
    .join(", ");
}

export function rowToDocument(table: TableName, row: SqlRow): DataDocument {
  const specs: Record<string, ColumnSpec> = tableColumns[table];
  const document: DataDocument = {};
  for (const [field, spec] of Object.entries(specs)) {
    const value = row[field];
    if (value === null || value === undefined) {
      if (!spec.optional) document[field] = null;
      continue;
    }
    switch (spec.kind) {
      case "double": {
        const n = typeof value === "number" ? value : Number(value);
        document[field] = needsFloatWrapper(n) ? { $float: encodeFloat(n) } : n;
        break;
      }
      case "bigint":
        document[field] = { $integer: encodeInteger(typeof value === "bigint" ? value : BigInt(String(value))) };
        break;
      case "bytea":
        document[field] = { $bytes: Buffer.from(value as Uint8Array).toString("base64") };
        break;
      case "jsonb":
        if (typeof value !== "string") throw new Error(`jsonb column ${table}.${field} must be read as text`);
        document[field] = JSON.parse(value);
        break;
      default:
        document[field] = value;
    }
  }
  return document;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      const entry = (value as Record<string, unknown>)[key];
      if (entry !== undefined) sorted[key] = canonicalize(entry);
    }
    return sorted;
  }
  return value;
}

export function documentHash(document: DataDocument): string {
  return createHash("sha256").update(JSON.stringify(canonicalize(document))).digest("hex");
}
