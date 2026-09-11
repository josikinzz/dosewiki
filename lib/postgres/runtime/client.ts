/**
 * A `ConvexHttpClient`-shaped client that runs the registered Convex functions
 * in this process against Postgres.
 *
 * `query` runs the handler inside a REPEATABLE READ READ ONLY transaction.
 * `mutation` runs it SERIALIZABLE and replays the whole handler on
 * serialization failure, which is the SQL equivalent of Convex retrying a
 * mutation that lost an OCC race. Handlers are therefore re-executed from the
 * top, exactly as they are on Convex, so they must stay free of external
 * side effects (they are: no actions exist and `ctx.scheduler` is unused).
 */

import { getFunctionName, type ArgsAndOptions, type FunctionReference, type FunctionReturnType, type OptionalRestArgs } from "convex/server";
import type { HttpMutationOptions } from "convex/browser";
import { Pool } from "pg";
import { assertDeploymentEnv } from "./deploymentEnv";
import { loadIdTableMap, PostgresDatabaseReader, PostgresDatabaseWriter, serialExecutor, type IdTableMap, type SqlExecutor } from "./db";
import { validateValue, type ValidatorJson } from "./validate";

type Registered = {
  isQuery?: boolean;
  isMutation?: boolean;
  isAction?: boolean;
  isPublic?: boolean;
  isInternal?: boolean;
  exportArgs: () => string;
  _handler: (ctx: unknown, args: Record<string, unknown>) => Promise<unknown>;
};

export type FunctionKind = "query" | "mutation" | "action";

/**
 * The registry statically imports all 47 Convex modules, which in turn pull
 * `convex/_generated/server`. Loading it lazily keeps that graph out of every
 * consumer of `backend.ts` (and out of the Convex-backed server bundle).
 */
let registry: Record<string, Record<string, unknown>> | null = null;
let registryLoad: Promise<Record<string, Record<string, unknown>>> | null = null;

async function loadRegistry(): Promise<Record<string, Record<string, unknown>>> {
  if (registry) return registry;
  if (!registryLoad) {
    registryLoad = import("./functions.generated").then((module) => {
      registry = module.functionModules;
      return registry;
    });
  }
  return registryLoad;
}

export async function resolveFunction(
  reference: FunctionReference<FunctionKind> | string,
): Promise<{ name: string; fn: Registered }> {
  const name = typeof reference === "string" ? reference : getFunctionName(reference);
  const [modulePath, exportName] = name.split(":");
  const modules = await loadRegistry();
  const module = modules[modulePath?.replace(/\.js$/, "") ?? ""];
  const fn = module?.[exportName ?? ""] as Registered | undefined;
  if (!fn || typeof fn._handler !== "function") throw new Error(`Convex function ${name} is not registered`);
  return { name, fn };
}

const MAX_SERIALIZATION_RETRIES = 6;

function isSerializationFailure(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  return code === "40001" || code === "40P01";
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** `POSTGRES_RUNTIME_TRACE=1` logs one line per function call: name, statements, elapsed. Feeds ticket 22 measurements. */
const TRACE = process.env.POSTGRES_RUNTIME_TRACE === "1";
function trace(kind: string, name: string, executor: SqlExecutor, startedAt: number, attempt = 1): void {
  if (!TRACE) return;
  console.info(`[postgres-runtime] ${kind} ${name} statements=${executor.statements} ms=${Math.round(performance.now() - startedAt)}${attempt > 1 ? ` attempt=${attempt}` : ""}`);
}

/** `ctx.storage` reads the R2 manifest (migration 0002); bytes never live in Postgres. */
function storageFor(client: SqlExecutor) {
  return {
    async getUrl(storageId: string): Promise<string | null> {
      const result = await client.query('SELECT "url" FROM "storageObjects" WHERE "storage_id" = $1', [storageId]);
      return (result.rows[0]?.url as string | undefined) ?? null;
    },
    async generateUploadUrl(): Promise<string> {
      throw new Error("Convex storage uploads are unavailable on the Postgres runtime; use the R2 signed upload path");
    },
    async getMetadata() {
      return null;
    },
    async delete() {
      throw new Error("Convex storage deletes are unavailable on the Postgres runtime");
    },
  };
}

const auth = {
  /** No Convex identity provider is configured for this app; handlers authenticate with API keys. */
  async getUserIdentity() {
    return null;
  },
};

const scheduler = {
  async runAfter(): Promise<never> {
    throw new Error("ctx.scheduler is not supported on the Postgres runtime");
  },
  async runAt(): Promise<never> {
    throw new Error("ctx.scheduler is not supported on the Postgres runtime");
  },
  async cancel(): Promise<never> {
    throw new Error("ctx.scheduler is not supported on the Postgres runtime");
  },
};

export class PostgresConvexClient {
  private idMap: Promise<IdTableMap> | null = null;

  constructor(private readonly pool: Pool) {}

  /** Imported ids carry no table tag; load their map once per process so `normalizeId` stays synchronous. */
  private ensureIdMap(): Promise<IdTableMap> {
    if (!this.idMap) {
      this.idMap = (async () => {
        const client = await this.pool.connect();
        try {
          return await loadIdTableMap(serialExecutor(client));
        } finally {
          client.release();
        }
      })();
      this.idMap.catch(() => {
        this.idMap = null;
      });
    }
    return this.idMap;
  }

  static fromUrl(connectionString: string, max = 4): PostgresConvexClient {
    assertDeploymentEnv();
    return new PostgresConvexClient(new Pool({ connectionString, max }));
  }

  async end(): Promise<void> {
    await this.pool.end();
  }

  /**
   * One parameterized statement outside the Convex function surface, for the
   * runtime-owned tables in `schema.runtime.ts` that no handler knows about.
   * Autocommit: callers needing atomicity express it in the statement itself.
   */
  async sql<Row extends Record<string, unknown>>(text: string, values: unknown[] = []): Promise<Row[]> {
    const result = await this.pool.query<Row>(text, values);
    return result.rows;
  }

  async query<Query extends FunctionReference<"query">>(reference: Query, ...rest: OptionalRestArgs<Query>): Promise<FunctionReturnType<Query>> {
    const args = (rest[0] ?? {}) as Record<string, unknown>;
    const { name, fn } = await resolveFunction(reference);
    if (!fn.isQuery) throw new Error(`${name} is not a query`);
    validateValue(JSON.parse(fn.exportArgs()) as ValidatorJson, args, `${name} args`);
    const idMap = await this.ensureIdMap();
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      const executor = serialExecutor(client);
      const startedAt = performance.now();
      try {
        const result = await this.runQueryOn(executor, idMap, fn, args);
        await client.query("COMMIT");
        trace("query", name, executor, startedAt);
        return result as FunctionReturnType<Query>;
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
      }
    } finally {
      client.release();
    }
  }

  async mutation<Mutation extends FunctionReference<"mutation">>(reference: Mutation, ...rest: ArgsAndOptions<Mutation, HttpMutationOptions>): Promise<FunctionReturnType<Mutation>> {
    const args = (rest[0] ?? {}) as Record<string, unknown>;
    const { name, fn } = await resolveFunction(reference);
    if (!fn.isMutation) throw new Error(`${name} is not a mutation`);
    validateValue(JSON.parse(fn.exportArgs()) as ValidatorJson, args, `${name} args`);
    const idMap = await this.ensureIdMap();
    for (let attempt = 1; ; attempt += 1) {
      const client = await this.pool.connect();
      try {
        await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
        const executor = serialExecutor(client);
        const startedAt = performance.now();
        try {
          const result = await this.runMutationOn(executor, idMap, fn, args);
          await client.query("COMMIT");
          trace("mutation", name, executor, startedAt, attempt);
          return result as FunctionReturnType<Mutation>;
        } catch (error) {
          await client.query("ROLLBACK").catch(() => {});
          if (isSerializationFailure(error) && attempt < MAX_SERIALIZATION_RETRIES) {
            await sleep(10 * 2 ** attempt + Math.random() * 20);
            continue;
          }
          throw error;
        }
      } finally {
        client.release();
      }
    }
  }

  async action<Action extends FunctionReference<"action">>(reference: Action, ..._rest: OptionalRestArgs<Action>): Promise<FunctionReturnType<Action>> {
    throw new Error(`${getFunctionName(reference)}: no Convex actions are registered in this app`);
  }

  private async runQueryOn(client: SqlExecutor, idMap: IdTableMap, fn: Registered, args: Record<string, unknown>): Promise<unknown> {
    const ctx = {
      db: new PostgresDatabaseReader(client, idMap),
      auth,
      storage: storageFor(client),
      runQuery: async (reference: FunctionReference<"query"> | string, nested: Record<string, unknown> = {}) => {
        const target = await resolveFunction(reference);
        if (!target.fn.isQuery) throw new Error(`${target.name} is not a query`);
        validateValue(JSON.parse(target.fn.exportArgs()) as ValidatorJson, nested, `${target.name} args`);
        return this.runQueryOn(client, idMap, target.fn, nested);
      },
    };
    return fn._handler(ctx, args);
  }

  private async runMutationOn(client: SqlExecutor, idMap: IdTableMap, fn: Registered, args: Record<string, unknown>): Promise<unknown> {
    const ctx = {
      db: new PostgresDatabaseWriter(client, idMap),
      auth,
      storage: storageFor(client),
      scheduler,
      runQuery: async (reference: FunctionReference<"query"> | string, nested: Record<string, unknown> = {}) => {
        const target = await resolveFunction(reference);
        if (!target.fn.isQuery) throw new Error(`${target.name} is not a query`);
        validateValue(JSON.parse(target.fn.exportArgs()) as ValidatorJson, nested, `${target.name} args`);
        return this.runQueryOn(client, idMap, target.fn, nested);
      },
      runMutation: async (reference: FunctionReference<"mutation"> | string, nested: Record<string, unknown> = {}) => {
        const target = await resolveFunction(reference);
        if (!target.fn.isMutation) throw new Error(`${target.name} is not a mutation`);
        validateValue(JSON.parse(target.fn.exportArgs()) as ValidatorJson, nested, `${target.name} args`);
        return this.runMutationOn(client, idMap, target.fn, nested);
      },
    };
    return fn._handler(ctx, args);
  }
}
