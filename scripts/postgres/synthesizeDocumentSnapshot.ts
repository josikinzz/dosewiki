/**
 * Builds a sanitized document snapshot fixture directly from the composed
 * server schema, so import rehearsal needs no private production data.
 *
 *   bun scripts/postgres/synthesizeDocumentSnapshot.ts --out <dir> [--rows 200] [--seed 1]
 *
 * Output: `<table>/documents.jsonl` per table, using the persisted value encoding.
 * The generator is deterministic for a seed, honours every validator kind,
 * emits `$float` wrappers for NaN, infinities, and -0 both at the top level
 * and nested, and keeps `v.id()` references pointing at generated IDs so the
 * reference reconciliation has something real to check.
 */

import fs from "node:fs";
import path from "node:path";
import { encodeDocumentValue, encodeFloat } from "../../lib/postgres/documentCodec";
import { tableUniqueKeys } from "../../lib/postgres/schema.generated";
import { exportSchemaTables, objectFieldsOf, type ObjectFields, type ValidatorJson } from "./schemaExport";

const argv = process.argv.slice(2);
const argValue = (name: string) => {
  const index = argv.indexOf(`--${name}`);
  return index >= 0 ? argv[index + 1] : undefined;
};
const outDirectory = argValue("out");
if (!outDirectory) throw new Error("--out <dir> is required");
const rowsPerTable = Number(argValue("rows") ?? 200);
let seed = Number(argValue("seed") ?? 1) >>> 0;

function random(): number {
  // mulberry32
  seed = (seed + 0x6d2b79f5) >>> 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)];

const ID_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
function documentId(): string {
  let id = "";
  for (let i = 0; i < 32; i += 1) id += ID_ALPHABET[Math.floor(random() * ID_ALPHABET.length)];
  return id;
}

const SPECIAL_FLOATS = [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -0];
function numberValue(): unknown {
  const roll = random();
  if (roll < 0.05) return { $float: encodeFloat(pick(SPECIAL_FLOATS)) };
  if (roll < 0.5) return Math.floor(random() * 100000);
  return Math.round((random() - 0.5) * 1e6) / 1000;
}

const idsByTable: Record<string, string[]> = {};

function value(v: ValidatorJson, depth: number): unknown {
  switch (v.type) {
    case "string":
      return `s_${Math.floor(random() * 1e9).toString(36)}`;
    case "number":
      return numberValue();
    case "boolean":
      return random() < 0.5;
    case "null":
      return null;
    case "literal":
      return encodeDocumentValue(v.value);
    case "id": {
      const pool = idsByTable[v.tableName] ?? [];
      return pool.length ? pick(pool) : documentId();
    }
    case "int64":
      return { $integer: Buffer.from(new BigInt64Array([BigInt(Math.floor(random() * 1e12))]).buffer).toString("base64") };
    case "bytes":
      return { $bytes: Buffer.from([1, 2, 3, Math.floor(random() * 255)]).toString("base64") };
    case "any":
      return depth > 2 ? pick(["x", 1, true, null]) : { nested: [1, "two", { three: numberValue() }] };
    case "array": {
      const length = Math.floor(random() * 4);
      return Array.from({ length }, () => value(v.value, depth + 1));
    }
    case "union":
      return value(pick(v.value), depth);
    case "record": {
      const record: Record<string, unknown> = {};
      for (let i = 0; i < 2; i += 1) record[`k${i}`] = value(v.values.fieldType, depth + 1);
      return record;
    }
    case "object":
      return objectValue(v.value, depth + 1);
  }
}

function objectValue(fields: ObjectFields, depth: number): Record<string, unknown> {
  const document: Record<string, unknown> = {};
  for (const [name, field] of Object.entries(fields)) {
    if (field.optional && random() < 0.4) continue;
    const generated = value(field.fieldType, depth);
    if (generated !== undefined) document[name] = generated;
  }
  return document;
}

const tables = exportSchemaTables();
for (const table of tables) {
  idsByTable[table.tableName] = Array.from({ length: rowsPerTable }, () => documentId());
}

const baseCreationTime = Date.UTC(2026, 0, 1);
for (const table of tables) {
  const fields = objectFieldsOf(table);
  const directory = path.join(outDirectory, table.tableName);
  fs.mkdirSync(directory, { recursive: true });
  const uniqueKeys: readonly (readonly string[])[] = (tableUniqueKeys as Record<string, readonly (readonly string[])[]>)[table.tableName] ?? [];
  const lines = idsByTable[table.tableName].map((id, index) => {
    const document = { _id: id, _creationTime: baseCreationTime + index * 1000 + random(), ...objectValue(fields, 0) };
    // Identity keys are unique in production and enforced by SQL; a random pick would collide.
    for (const key of uniqueKeys) for (const field of key) {
      const validator = fields[field]?.fieldType;
      if (!validator || !(field in document)) continue;
      document[field] = validator.type === "id" ? idsByTable[validator.tableName][index] : `${field}_${index}`;
    }
    return JSON.stringify(document);
  });
  fs.writeFileSync(path.join(directory, "documents.jsonl"), `${lines.join("\n")}\n`);
}
console.log(`Wrote ${tables.length} tables x ${rowsPerTable} rows to ${outDirectory} (seed ${argValue("seed") ?? 1})`);
