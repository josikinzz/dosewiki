/**
 * Executes owned callables inside Postgres transactions.
 * Queries use REPEATABLE READ READ ONLY. Mutations use SERIALIZABLE and retry
 * the complete handler on serialization/deadlock failure. External effects
 * belong to the post-commit publication delivery worker, never these handlers.
 */

import { getFunctionName, type ArgsAndOptions, type FunctionReference, type FunctionReturnType, type OptionalRestArgs, type HttpMutationOptions, type FunctionKind } from "./api";
import type { RegisteredFunction, QueryCtx, MutationCtx } from "./server";
import { Pool } from "pg";
import { assertDeploymentEnv } from "./deploymentEnv";
import { loadIdTableMap, PostgresDatabaseReader, PostgresDatabaseWriter, serialExecutor, type IdTableMap, type SqlExecutor } from "./db";
import { validateValue, validateReturn, type IdValidation } from "./validate";
import { POOL_ACQUISITION_TIMEOUT_MS, setTransactionTimeouts } from "../transactionTimeouts";
import { withTransaction, type SqlClient } from "../documentStore";
import { parsePostgresTarget } from "./target";
import { assertDataWritesNotFrozen, isDataWriteFreezeActive } from "../../runtime/dataWriteFreeze";

type Registered = RegisteredFunction;

/** Load the server-only module graph only when a callable is invoked. */
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
  const module = modules[modulePath ?? ""];
  const fn = module && Object.prototype.hasOwnProperty.call(module, exportName ?? "") ? module[exportName ?? ""] as Registered | undefined : undefined;
  if (name.split(":").length !== 2 || !fn || (fn.kind !== "query" && fn.kind !== "mutation") || typeof fn._handler !== "function" || !fn.args || !fn.returns) throw new Error(`Postgres function ${name} is not registered`);
  return { name, fn };
}

const MAX_SERIALIZATION_RETRIES = 6;

function isSerializationFailure(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  return code === "40001" || code === "40P01";
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** `POSTGRES_RUNTIME_TRACE=1` logs one line per function call: name, statements, elapsed. Feeds the release rehearsal's latency measurements. */
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
  };
}

const auth = {
  /** No identity provider is configured on this handler context; handlers authenticate with API keys. */
  async getUserIdentity() {
    return null;
  },
};


/** Bind receipts to this pool's configured destination, never an ambient target. */
function poolTargetIdentity(pool: Pool): string | undefined {
  const options = pool.options;
  if (!options || options.stream || options.Client) return undefined;
  if (options.connectionString) return parsePostgresTarget(options.connectionString).identity;
  if (!options.host || !options.database || /[/@?#]/.test(options.host)) return undefined;
  const host = options.host.includes(":") && !options.host.startsWith("[") ? `[${options.host}]` : options.host;
  return parsePostgresTarget(`postgres://${host}/${encodeURIComponent(options.database)}`).identity;
}

export class PostgresClient {
  private idMap: Promise<IdTableMap> | null = null;
  private readonly targetIdentity: string | undefined;

  constructor(private readonly pool: Pool) {
    this.targetIdentity = poolTargetIdentity(pool);
    // The server closing an idle client (pooler idle timeout, failover) surfaces
    // here after pg has already evicted it; unhandled, the event ends the process.
    pool.on("error", (error) => {
      console.error(`postgres: idle client closed: ${error.message}`);
    });
  }

  /** Imported ids carry no table tag; load their map once per process so `normalizeId` stays synchronous. */
  private ensureIdMap(): Promise<IdTableMap> {
    if (!this.idMap) {
      this.idMap = (async () => {
        const client = await this.pool.connect();
        try {
          await client.query("BEGIN READ ONLY");
          try {
            await setTransactionTimeouts(client);
            const map = await loadIdTableMap(serialExecutor(client));
            await client.query("COMMIT");
            return map;
          } catch (error) {
            await client.query("ROLLBACK").catch(() => {});
            throw error;
          }
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

  static fromUrl(connectionString: string, max = 4): PostgresClient {
    assertDeploymentEnv();
    return new PostgresClient(new Pool({ connectionString, max, connectionTimeoutMillis: POOL_ACQUISITION_TIMEOUT_MS }));
  }

  async end(): Promise<void> {
    await this.pool.end();
  }

  /**
   * One parameterized statement outside the callable surface, for the
   * runtime-owned tables in `schema.runtime.ts` that no handler knows about.
   * The bounded transaction preserves the statement's result and atomicity.
   */
  async sql<Row extends Record<string, unknown>>(text: string, values: unknown[] = []): Promise<Row[]> {
    const client = await this.pool.connect();
    try {
      await client.query(isDataWriteFreezeActive() ? "BEGIN READ ONLY" : "BEGIN");
      try {
        await setTransactionTimeouts(client);
        const result = await client.query<Row>(text, values);
        await client.query("COMMIT");
        return result.rows;
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
      }
    } finally {
      client.release();
    }
  }

  /** Runtime-owned producers must publish their derived metadata atomically. */
  async sqlTransaction<T>(operation: (client: SqlClient) => Promise<T>): Promise<T> {
    return withTransaction(this.pool, operation);
  }

  private async prepareArguments(name: string, fn: Registered, args: Record<string, unknown>): Promise<IdTableMap> {
    const ids: IdValidation[] = [];
    validateValue(fn.args, args, `${name} args`, { ids });
    const idMap = await this.ensureIdMap();
    if (ids.length) validateValue(fn.args, args, `${name} args`, { idTable: (id) => idMap.get(id) });
    return idMap;
  }

  async query<Query extends FunctionReference<"query">>(reference: Query, ...rest: OptionalRestArgs<Query>): Promise<FunctionReturnType<Query>> {
    const args = (rest[0] ?? {}) as Record<string, unknown>;
    const { name, fn } = await resolveFunction(reference);
    if (!fn.isQuery) throw new Error(`${name} is not a query`);
    const idMap = await this.prepareArguments(name, fn, args);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      try {
        await setTransactionTimeouts(client);
        const executor = serialExecutor(client);
        const startedAt = performance.now();
        const result = await this.runQueryOn(executor, idMap, name, fn, args);
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
    // Refuse new writes; transactions admitted before a freeze still drain to completion.
    assertDataWritesNotFrozen(getFunctionName(reference));
    const args = (rest[0] ?? {}) as Record<string, unknown>;
    const { name, fn } = await resolveFunction(reference);
    if (!fn.isMutation) throw new Error(`${name} is not a mutation`);
    const idMap = await this.prepareArguments(name, fn, args);
    for (let attempt = 1; ; attempt += 1) {
      const client = await this.pool.connect();
      try {
        await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
        try {
          await setTransactionTimeouts(client);
          const executor = serialExecutor(client);
          const startedAt = performance.now();
          const result = await this.runMutationOn(executor, idMap, name, fn, args);
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
    throw new Error(`${getFunctionName(reference)}: actions cannot run inside the Postgres callable executor`);
  }

  private async runQueryOn(client: SqlExecutor, idMap: IdTableMap, name: string, fn: Registered, args: Record<string, unknown>): Promise<unknown> {
    const ctx = {
      targetIdentity: this.targetIdentity,
      db: new PostgresDatabaseReader(client, idMap),
      auth,
      storage: storageFor(client),
      runQuery: async (reference: FunctionReference<"query"> | string, nested: Record<string, unknown> = {}) => {
        const target = await resolveFunction(reference);
        if (!target.fn.isQuery) throw new Error(`${target.name} is not a query`);
        validateValue(target.fn.args, nested, `${target.name} args`, { idTable: (id) => idMap.get(id) });
        return this.runQueryOn(client, idMap, target.name, target.fn, nested);
      },
    };
    const result = await fn._handler(ctx as unknown as QueryCtx, args);
    return validateReturn(fn.returns, result, `${name} return`, { idTable: (id) => idMap.get(id) });
  }

  private async runMutationOn(client: SqlExecutor, idMap: IdTableMap, name: string, fn: Registered, args: Record<string, unknown>): Promise<unknown> {
    const ctx = {
      targetIdentity: this.targetIdentity,
      db: new PostgresDatabaseWriter(client, idMap),
      auth,
      storage: storageFor(client),
      runQuery: async (reference: FunctionReference<"query"> | string, nested: Record<string, unknown> = {}) => {
        const target = await resolveFunction(reference);
        if (!target.fn.isQuery) throw new Error(`${target.name} is not a query`);
        validateValue(target.fn.args, nested, `${target.name} args`, { idTable: (id) => idMap.get(id) });
        return this.runQueryOn(client, idMap, target.name, target.fn, nested);
      },
      runMutation: async (reference: FunctionReference<"mutation"> | string, nested: Record<string, unknown> = {}) => {
        const target = await resolveFunction(reference);
        if (!target.fn.isMutation) throw new Error(`${target.name} is not a mutation`);
        validateValue(target.fn.args, nested, `${target.name} args`, { idTable: (id) => idMap.get(id) });
        return this.runMutationOn(client, idMap, target.name, target.fn, nested);
      },
    };
    const result = await fn._handler(ctx as unknown as MutationCtx, args);
    return validateReturn(fn.returns, result, `${name} return`, { idTable: (id) => idMap.get(id) });
  }
}
