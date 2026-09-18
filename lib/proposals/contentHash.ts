import { sha256Text } from "../generatedPublication/canonical.mjs";

/**
 * Content identity for change-proposal targets. A proposal records the hash of
 * each production row it was drafted against; apply recomputes the hash and
 * refuses when the row has moved on. Both sides must therefore hash the same
 * canonical text, which is why this lives in `lib/` and is imported by Postgres
 * functions and the Next server alike: no `node:crypto`, only the pure sha256
 * the generated-publication pipeline already ships.
 */

/**
 * JSON with object keys sorted at every depth and `undefined` object values
 * dropped (array holes become `null`, as `JSON.stringify` does). Two documents
 * that differ only in key order or in the presence of undefined fields
 * stringify identically. Non-finite numbers are rejected rather than silently
 * serialized as `null`.
 */
export function stableStringify(value: unknown): string {
  if (value === null || value === undefined) {
    return "null";
  }
  switch (typeof value) {
    case "string":
      return JSON.stringify(value);
    case "boolean":
      return value ? "true" : "false";
    case "number":
      if (!Number.isFinite(value)) {
        throw new TypeError("stableStringify rejects non-finite numbers.");
      }
      return Object.is(value, -0) ? "0" : JSON.stringify(value);
    case "object": {
      if (Array.isArray(value)) {
        return `[${value.map(stableStringify).join(",")}]`;
      }
      const record = value as Record<string, unknown>;
      const parts: string[] = [];
      for (const key of Object.keys(record).sort()) {
        const entry = record[key];
        if (entry === undefined) {
          continue;
        }
        parts.push(`${JSON.stringify(key)}:${stableStringify(entry)}`);
      }
      return `{${parts.join(",")}}`;
    }
    default:
      throw new TypeError(`stableStringify rejects ${typeof value} values.`);
  }
}

/** sha256 hex of `stableStringify(value)`. */
export function contentHash(value: unknown): string {
  return sha256Text(stableStringify(value));
}
