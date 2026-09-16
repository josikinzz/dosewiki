/** Owned callable validators preserve omitted optional fields and opaque stored IDs. */
export type ValidatorJson =
  | { type: "string" | "number" | "boolean" | "null" | "any" | "bytes" | "int64" }
  | { type: "literal"; value: string | number | boolean | bigint }
  | { type: "id"; tableName: string }
  | { type: "array"; value: ValidatorJson }
  | { type: "union"; value: ValidatorJson[] }
  | { type: "record"; keys: ValidatorJson; values: { fieldType: ValidatorJson; optional: boolean } }
  | { type: "object"; value: Record<string, { fieldType: ValidatorJson; optional: boolean }> };

export class ArgumentValidationError extends Error {
  constructor(message: string) { super(message); this.name = "ArgumentValidationError"; }
}
export class ReturnValidationError extends Error {
  constructor(message: string) { super(message); this.name = "ReturnValidationError"; }
}
export interface IdValidation { id: string; table: string; where: string }
export interface ValidationOptions {
  /** Known identity only, not an existence check. Deleted/unknown IDs remain representable. */
  ids?: IdValidation[];
  idTable?: (id: string) => string | undefined;
}
function describe(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (value instanceof ArrayBuffer) return "bytes";
  return typeof value;
}
function plainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/** v.any is a supported application value, not a bypass for functions/cycles/undefined. */
function validateSerializable(value: unknown, where: string, ancestors: Set<object>): void {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value instanceof ArrayBuffer) return;
  if (typeof value === "bigint") {
    if (value < -(1n << 63n) || value >= (1n << 63n)) throw new ArgumentValidationError(`${where}: int64 is out of range`);
    return;
  }
  if (typeof value !== "object" || (!Array.isArray(value) && !plainObject(value))) throw new ArgumentValidationError(`${where}: unsupported application value ${describe(value)}`);
  if (ancestors.has(value)) throw new ArgumentValidationError(`${where}: cyclic application value`);
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i += 1) validateSerializable(value[i], `${where}[${i}]`, ancestors);
    } else {
      if (Object.getOwnPropertySymbols(value).length) throw new ArgumentValidationError(`${where}: symbol fields are not supported`);
      for (const [key, field] of Object.entries(value)) {
        if (field !== undefined) validateSerializable(field, `${where}.${key}`, ancestors);
      }
    }
  } finally { ancestors.delete(value); }
}

export function validateValue(validator: ValidatorJson, value: unknown, where: string, options: ValidationOptions = {}): void {
  // Validate the value graph once before descending through the declared shape.
  validateSerializable(value, where, new Set());
  validateShape(validator, value, where, options);
}
function validateShape(validator: ValidatorJson, value: unknown, where: string, options: ValidationOptions): void {
  switch (validator.type) {
    case "any": return;
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
    case "id": {
      if (typeof value !== "string" || !/^[a-z0-9]{32}$/.test(value)) throw new ArgumentValidationError(`${where}: expected an opaque document id for ${validator.tableName}`);
      const knownTable = options.idTable?.(value);
      if (knownTable !== undefined && knownTable !== validator.tableName) throw new ArgumentValidationError(`${where}: id belongs to ${knownTable}, expected ${validator.tableName}`);
      options.ids?.push({ id: value, table: validator.tableName, where });
      return;
    }
    case "literal":
      if (!Object.is(value, validator.value)) throw new ArgumentValidationError(`${where}: expected literal ${String(validator.value)}`);
      return;
    case "array":
      if (!Array.isArray(value)) throw new ArgumentValidationError(`${where}: expected array, got ${describe(value)}`);
      for (let i = 0; i < value.length; i += 1) validateShape(validator.value, value[i], `${where}[${i}]`, options);
      return;
    case "union": {
      for (const member of validator.value) {
        const idCount = options.ids?.length ?? 0;
        try { validateShape(member, value, where, options); return; }
        catch (error) {
          if (options.ids) options.ids.length = idCount;
          if (!(error instanceof ArgumentValidationError)) throw error;
        }
      }
      throw new ArgumentValidationError(`${where}: no union member matched`);
    }
    case "record":
      if (!plainObject(value)) throw new ArgumentValidationError(`${where}: expected record, got ${describe(value)}`);
      for (const [key, item] of Object.entries(value)) {
        validateShape(validator.keys, key, `${where} key`, options);
        if (item === undefined) throw new ArgumentValidationError(`${where}.${key}: undefined record value`);
        validateShape(validator.values.fieldType, item, `${where}.${key}`, options);
      }
      return;
    case "object":
      if (!plainObject(value)) throw new ArgumentValidationError(`${where}: expected object, got ${describe(value)}`);
      for (const key of Object.keys(value)) {
        if (value[key] !== undefined && !Object.prototype.hasOwnProperty.call(validator.value, key)) throw new ArgumentValidationError(`${where}: unexpected field ${key}`);
      }
      for (const [key, field] of Object.entries(validator.value)) {
        const item = Object.prototype.hasOwnProperty.call(value, key) ? value[key] : undefined;
        if (item === undefined) {
          if (!field.optional) throw new ArgumentValidationError(`${where}: missing required field ${key}`);
        } else validateShape(field.fieldType, item, `${where}.${key}`, options);
      }
      return;
    default: throw new ArgumentValidationError(`${where}: unsupported validator type`);
  }
}

/** Handler fallthrough is the established null result, not an undefined wire value. */
export function validateReturn(validator: ValidatorJson, value: unknown, where: string, options?: ValidationOptions): unknown {
  const result = value === undefined ? null : value;
  try { validateValue(validator, result, where, options); }
  catch (error) {
    if (error instanceof ArgumentValidationError) throw new ReturnValidationError(error.message);
    throw error;
  }
  return result;
}
