import type { ValidatorJson } from "./validate";

/** IDs remain opaque, table-branded strings. Existing stored IDs are never reminted. */
export type Id<Table extends string> = string & { __tableName: Table };
export type Value = null | boolean | number | bigint | string | ArrayBuffer | Value[] | { [key: string]: Value | undefined };
export type PropertyValidators = Record<string, Validator<any, "required" | "optional">>;
export type Infer<V extends Validator<any, any>> = V["type"];
type OptionalKeys<F extends PropertyValidators> = { [K in keyof F]: F[K]["isOptional"] extends "optional" ? K : never }[keyof F];
export type ObjectType<F extends PropertyValidators> = { [K in Exclude<keyof F, OptionalKeys<F>>]: Infer<F[K]> } & { [K in OptionalKeys<F>]?: Infer<F[K]> };

export interface Validator<T = any, Optional extends "required" | "optional" = "required", FieldPaths extends string = string> {
  readonly type: T;
  readonly isOptional: Optional;
  readonly json: ValidatorJson;
  readonly fieldPaths: FieldPaths;
}

function validator<T>(json: ValidatorJson): Validator<T> {
  return Object.freeze({ json, isOptional: "required" }) as Validator<T>;
}

function object<F extends PropertyValidators>(fields: F): Validator<ObjectType<F>> & { fields: F } {
  const value: Extract<ValidatorJson, { type: "object" }>["value"] = Object.create(null);
  for (const [key, field] of Object.entries(fields)) value[key] = { fieldType: field.json, optional: field.isOptional === "optional" };
  return Object.freeze({ ...validator<ObjectType<F>>({ type: "object", value }), fields });
}

/** Runtime-owned validators used by both callable definitions and schema producers. */
export const v = {
  string: () => validator<string>({ type: "string" }),
  number: () => validator<number>({ type: "number" }),
  float64: () => validator<number>({ type: "number" }),
  boolean: () => validator<boolean>({ type: "boolean" }),
  null: () => validator<null>({ type: "null" }),
  any: () => validator<any>({ type: "any" }),
  bytes: () => validator<ArrayBuffer>({ type: "bytes" }),
  int64: () => validator<bigint>({ type: "int64" }),
  id: <Table extends string>(tableName: Table) => validator<Id<Table>>({ type: "id", tableName }),
  literal: <const T extends string | number | boolean | bigint>(value: T) => validator<T>({ type: "literal", value }),
  array: <T>(element: Validator<T>) => validator<T[]>({ type: "array", value: element.json }),
  union: <V extends readonly Validator<any>[]>(...members: V) => validator<Infer<V[number]>>({ type: "union", value: members.map((member) => member.json) }),
  optional: <T, O extends "required" | "optional", P extends string>(field: Validator<T, O, P>): Validator<T | undefined, "optional", P> => Object.freeze({ ...field, isOptional: "optional" }),
  object,
  record: <K extends string, T>(keys: Validator<K>, values: Validator<T>) => validator<Record<K, T>>({ type: "record", keys: keys.json, values: { fieldType: values.json, optional: false } }),
};

const POSTGRES_ERROR = Symbol.for("dosewiki.PostgresError");

/** Application errors preserve their structured data and are never retried as SQL failures. */
export class PostgresError<T = Value> extends Error {
  readonly data: T;
  readonly [POSTGRES_ERROR] = true;
  constructor(data: T) {
    const message = typeof data === "string" ? data : data && typeof data === "object" && "message" in data && typeof data.message === "string" ? data.message : JSON.stringify(data, (_key, value) => typeof value === "bigint" ? value.toString() : value);
    super(message);
    this.name = "PostgresError";
    this.data = data;
  }
}
