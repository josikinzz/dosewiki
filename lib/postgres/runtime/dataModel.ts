// GENERATED FILE. Do not edit by hand.
// Producer: scripts/postgres/generateDrizzleSchema.ts (npm run generate:postgres-schema)
import type schema from "../../../server/schema";
import type { Id as DocumentId } from "./values";

export type TableNames = keyof typeof schema.tables;
export type Id<Table extends TableNames | "_storage" | "_scheduled_functions"> = DocumentId<Table>;
export type Doc<Table extends TableNames> = (typeof schema.tables)[Table]["validator"]["type"] & { _id: Id<Table>; _creationTime: number };
type DeclaredIndexes<Table extends TableNames> = (typeof schema.tables)[Table]["indexTypes"];
export type DataModel = {
  [Table in TableNames]: {
    document: Doc<Table>;
    fieldPaths: (typeof schema.tables)[Table]["validator"]["fieldPaths"] | "_id" | "_creationTime";
    indexes: { [Name in keyof DeclaredIndexes<Table>]: readonly [...Extract<DeclaredIndexes<Table>[Name], readonly string[]>, "_creationTime"] } & { by_id: readonly ["_id"]; by_creation_time: readonly ["_creationTime"] };
    searchIndexes: {};
    vectorIndexes: {};
  };
};
