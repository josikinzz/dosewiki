import { sha256Text } from "../generatedPublication/canonical.mjs";

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

export function contentHash(value: unknown): string {
  return sha256Text(stableStringify(value));
}
