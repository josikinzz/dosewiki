/**
 * Enforces a Convex argument validator (the JSON `exportArgs()` shape) the way
 * the Convex runtime does before invoking a handler: exact object keys, union
 * membership, literal equality, id existence in the named table is not
 * checked (Convex does not check it either).
 */

export type ValidatorJson =
  | { type: "string" | "number" | "boolean" | "null" | "any" | "bytes" | "int64" }
  | { type: "literal"; value: string | number | boolean }
  | { type: "id"; tableName: string }
  | { type: "array"; value: ValidatorJson }
  | { type: "union"; value: ValidatorJson[] }
  | { type: "record"; keys: ValidatorJson; values: { fieldType: ValidatorJson; optional: boolean } }
  | { type: "object"; value: Record<string, { fieldType: ValidatorJson; optional: boolean }> };

class ArgumentValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArgumentValidationError";
  }
}

function describe(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (value instanceof ArrayBuffer) return "bytes";
  return typeof value;
}

export function validateValue(validator: ValidatorJson, value: unknown, where: string): void {
  switch (validator.type) {
    case "any":
      return;
    case "null":
      if (value !== null) throw new ArgumentValidationError(`${where}: expected null, got ${describe(value)}`);
      return;
    case "string":
    case "number":
    case "boolean":
      if (typeof value !== validator.type) throw new ArgumentValidationError(`${where}: expected ${validator.type}, got ${describe(value)}`);
      return;
    case "int64":
      if (typeof value !== "bigint") throw new ArgumentValidationError(`${where}: expected int64, got ${describe(value)}`);
      return;
    case "bytes":
      if (!(value instanceof ArrayBuffer)) throw new ArgumentValidationError(`${where}: expected bytes, got ${describe(value)}`);
      return;
    case "id":
      if (typeof value !== "string") throw new ArgumentValidationError(`${where}: expected id, got ${describe(value)}`);
      return;
    case "literal":
      if (value !== validator.value) throw new ArgumentValidationError(`${where}: expected ${JSON.stringify(validator.value)}`);
      return;
    case "array":
      if (!Array.isArray(value)) throw new ArgumentValidationError(`${where}: expected array, got ${describe(value)}`);
      value.forEach((item, i) => validateValue(validator.value, item, `${where}[${i}]`));
      return;
    case "union": {
      const errors: string[] = [];
      for (const member of validator.value) {
        try {
          validateValue(member, value, where);
          return;
        } catch (error) {
          errors.push(error instanceof Error ? error.message : String(error));
        }
      }
      throw new ArgumentValidationError(`${where}: no union member matched (${errors.join("; ")})`);
    }
    case "record": {
      if (value === null || typeof value !== "object" || Array.isArray(value)) {
        throw new ArgumentValidationError(`${where}: expected record, got ${describe(value)}`);
      }
      for (const [key, item] of Object.entries(value)) {
        validateValue(validator.keys, key, `${where} key`);
        validateValue(validator.values.fieldType, item, `${where}.${key}`);
      }
      return;
    }
    case "object": {
      if (value === null || typeof value !== "object" || Array.isArray(value)) {
        throw new ArgumentValidationError(`${where}: expected object, got ${describe(value)}`);
      }
      const record = value as Record<string, unknown>;
      for (const key of Object.keys(record)) {
        if (record[key] === undefined) continue;
        if (!(key in validator.value)) throw new ArgumentValidationError(`${where}: unexpected field ${key}`);
      }
      for (const [key, field] of Object.entries(validator.value)) {
        const item = record[key];
        if (item === undefined) {
          if (!field.optional) throw new ArgumentValidationError(`${where}: missing required field ${key}`);
          continue;
        }
        validateValue(field.fieldType, item, `${where}.${key}`);
      }
      return;
    }
  }
}
