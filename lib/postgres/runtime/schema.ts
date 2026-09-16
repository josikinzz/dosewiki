import { v, type ObjectType, type PropertyValidators, type Validator } from "./values";

export type TableIndex = { indexDescriptor: string; fields: string[] };

/** Document validators and ordered index keys shared by the runtime and SQL producer. */
export class TableDefinition<Document, Indexes extends Record<string, readonly string[]> = {}> {
  readonly indexes: TableIndex[] = [];
  declare readonly indexTypes: Indexes;

  constructor(readonly validator: Validator<Document>) {}

  index<const Name extends string, const Fields extends readonly string[]>(name: Name, fields: Fields): TableDefinition<Document, Indexes & Record<Name, Fields>> {
    if (this.indexes.some((index) => index.indexDescriptor === name)) throw new Error(`Duplicate index ${name}`);
    this.indexes.push({ indexDescriptor: name, fields: [...fields] });
    return this as unknown as TableDefinition<Document, Indexes & Record<Name, Fields>>;
  }
}

export function defineTable<V extends Validator<any>>(validator: V): TableDefinition<V["type"]>;
export function defineTable<F extends PropertyValidators>(fields: F): TableDefinition<ObjectType<F>>;
export function defineTable(input: Validator<any> | PropertyValidators): TableDefinition<any> {
  const validator = "json" in input && "isOptional" in input ? input as Validator<any> : v.object(input as PropertyValidators);
  if (validator.json.type !== "object") throw new Error("A table requires an object document validator");
  return new TableDefinition(validator);
}

export function defineSchema<const Tables extends Record<string, TableDefinition<any, any>>>(tables: Tables): { readonly tables: Tables } {
  return { tables };
}
