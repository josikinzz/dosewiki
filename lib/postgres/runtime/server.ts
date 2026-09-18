import type { Doc, Id, TableNames } from "./dataModel";
import type { FunctionReference, FunctionReturnType, FunctionVisibility, OptionalRestArgs } from "./api";
import { v, type ObjectType, type PropertyValidators, type Validator } from "./values";
import type { ValidatorJson } from "./validate";

export interface IndexRange {
  eq(field: string, value: unknown): IndexRange;
  gt(field: string, value: unknown): IndexRange;
  gte(field: string, value: unknown): IndexRange;
  lt(field: string, value: unknown): IndexRange;
  lte(field: string, value: unknown): IndexRange;
}
export interface FilterBuilder {
  field(path: string): unknown;
  eq(left: unknown, right: unknown): unknown;
  neq(left: unknown, right: unknown): unknown;
  gt(left: unknown, right: unknown): unknown;
  gte(left: unknown, right: unknown): unknown;
  lt(left: unknown, right: unknown): unknown;
  lte(left: unknown, right: unknown): unknown;
  and(...values: unknown[]): unknown;
  or(...values: unknown[]): unknown;
  not(value: unknown): unknown;
  add(left: unknown, right: unknown): unknown;
  sub(left: unknown, right: unknown): unknown;
  mul(left: unknown, right: unknown): unknown;
  div(left: unknown, right: unknown): unknown;
  mod(left: unknown, right: unknown): unknown;
  neg(value: unknown): unknown;
}
export interface PaginationOptions {
  numItems: number;
  cursor: string | null;
  endCursor?: string | null;
  id?: number;
  maximumRowsRead?: number;
  maximumBytesRead?: number;
}
export interface PaginationResult<T> { page: T[]; isDone: boolean; continueCursor: string }
export const paginationOptsValidator = v.object({
  numItems: v.number(), cursor: v.union(v.string(), v.null()),
  endCursor: v.optional(v.union(v.string(), v.null())), id: v.optional(v.number()),
  maximumRowsRead: v.optional(v.number()), maximumBytesRead: v.optional(v.number()),
});
export interface Query<T> extends AsyncIterable<T> {
  order(direction: "asc" | "desc"): Query<T>;
  filter(predicate: (q: FilterBuilder) => unknown): Query<T>;
  collect(): Promise<T[]>;
  take(count: number): Promise<T[]>;
  first(): Promise<T | null>;
  unique(): Promise<T | null>;
  paginate(options: PaginationOptions): Promise<PaginationResult<T>>;
}
export interface QueryInitializer<T> extends Query<T> {
  fullTableScan(): Query<T>;
  withIndex(name: string, range?: (q: IndexRange) => IndexRange): Query<T>;
}
export interface DatabaseReader {
  get<Table extends TableNames>(id: Id<Table>): Promise<Doc<Table> | null>;
  get<Table extends TableNames>(table: Table, id: Id<Table>): Promise<Doc<Table> | null>;
  query<Table extends TableNames>(table: Table): QueryInitializer<Doc<Table>>;
  normalizeId<Table extends TableNames>(table: Table, id: string): Id<Table> | null;
  system: { get(id: Id<"_storage"> | Id<"_scheduled_functions">): Promise<null>; query(table: string): never };
}
export interface DatabaseWriter extends DatabaseReader {
  insert<Table extends TableNames>(table: Table, value: Omit<Doc<Table>, "_id" | "_creationTime">): Promise<Id<Table>>;
  patch<Table extends TableNames>(id: Id<Table>, value: Partial<Omit<Doc<Table>, "_id" | "_creationTime">>): Promise<void>;
  patch<Table extends TableNames>(table: Table, id: Id<Table>, value: Partial<Omit<Doc<Table>, "_id" | "_creationTime">>): Promise<void>;
  replace<Table extends TableNames>(id: Id<Table>, value: Omit<Doc<Table>, "_id" | "_creationTime">): Promise<void>;
  replace<Table extends TableNames>(table: Table, id: Id<Table>, value: Omit<Doc<Table>, "_id" | "_creationTime">): Promise<void>;
  delete<Table extends TableNames>(id: Id<Table>): Promise<void>;
  delete<Table extends TableNames>(table: Table, id: Id<Table>): Promise<void>;
}
export interface UserIdentity { subject: string; tokenIdentifier: string; issuer: string; email?: string; name?: string }
export interface QueryCtx {
  /** Non-secret identity from the actual pool destination; receipt acceptance requires it. */
  readonly targetIdentity?: string;
  db: DatabaseReader;
  auth: { getUserIdentity(): Promise<UserIdentity | null> };
  storage: { getUrl(id: string): Promise<string | null> };
  runQuery<F extends FunctionReference<"query", any>>(reference: F, ...args: OptionalRestArgs<F>): Promise<FunctionReturnType<F>>;
}
export interface MutationCtx extends Omit<QueryCtx, "db"> {
  db: DatabaseWriter;
  runMutation<F extends FunctionReference<"mutation", any>>(reference: F, ...args: OptionalRestArgs<F>): Promise<FunctionReturnType<F>>;
}

export interface RegisteredFunction<Kind extends "query" | "mutation" = "query" | "mutation", Visibility extends FunctionVisibility = FunctionVisibility, Args extends Record<string, any> = any, Result = any> {
  readonly kind: Kind;
  readonly visibility: Visibility;
  readonly args: ValidatorJson;
  readonly returns: ValidatorJson;
  readonly isQuery: Kind extends "query" ? true : false;
  readonly isMutation: Kind extends "mutation" ? true : false;
  readonly isPublic: Visibility extends "public" ? true : false;
  readonly isInternal: Visibility extends "internal" ? true : false;
  _handler(ctx: Kind extends "query" ? QueryCtx : MutationCtx, args: Args): Result | Promise<Result>;
  exportArgs(): string;
  exportReturns(): string;
}
export type ReferenceFor<F> = F extends RegisteredFunction<infer K, infer V, infer A, infer R> ? FunctionReference<K, V, A, Awaited<R> extends void ? null : Awaited<R>> : never;
export type ApiFromModules<Modules extends Record<string, object>> = { [M in keyof Modules]: { [F in keyof Modules[M] as Modules[M][F] extends RegisteredFunction ? F : never]: ReferenceFor<Modules[M][F]> } };
type Context<K extends "query" | "mutation"> = K extends "query" ? QueryCtx : MutationCtx;
type Definition<K extends "query" | "mutation", Fields extends PropertyValidators, Result> = {
  args: Fields;
  returns?: Validator<any>;
  handler: (ctx: Context<K>, args: ObjectType<Fields>) => Result | Promise<Result>;
};

function builder<K extends "query" | "mutation", Visibility extends FunctionVisibility>(kind: K, visibility: Visibility) {
  return <Fields extends PropertyValidators, Result>(definition: Definition<K, Fields, Result>): RegisteredFunction<K, Visibility, ObjectType<Fields>, Result> => {
    if (!definition || typeof definition.handler !== "function" || !definition.args) throw new Error("Postgres callables require argument validators and a handler");
    const args = v.object(definition.args).json;
    // An unspecified result still has to be a serializable application value.
    const returns = definition.returns?.json ?? v.any().json;
    return Object.freeze({
      kind, visibility, args, returns,
      isQuery: kind === "query", isMutation: kind === "mutation",
      isPublic: visibility === "public", isInternal: visibility === "internal",
      _handler: definition.handler,
      exportArgs: () => JSON.stringify(args),
      exportReturns: () => JSON.stringify(returns),
    }) as RegisteredFunction<K, Visibility, ObjectType<Fields>, Result>;
  };
}

export const query = builder("query", "public");
export const internalQuery = builder("query", "internal");
/** Domain writes use the indexedMutation wrapper, which preserves journals and derived indexes. */
export const mutation = builder("mutation", "public");
export const internalMutation = builder("mutation", "internal");
