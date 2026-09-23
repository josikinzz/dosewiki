/**
 * Executes owned callables inside Postgres transactions.
 * Queries use REPEATABLE READ READ ONLY. Mutations use SERIALIZABLE and retry
 * the complete handler on a transient failure (`classifyPostgresError`):
 * serialization, deadlock, lock timeout, pool exhaustion. External effects
 * belong to the post-commit publication delivery worker, never these handlers.
 */

import { getFunctionName, type ArgsAndOptions, type FunctionReference, type FunctionReturnType, type OptionalRestArgs, type HttpMutationOptions, type FunctionKind } from "./api";
import type { RegisteredFunction, QueryCtx, MutationCtx } from "./server";
import { Pool } from "pg";
import { assertDeploymentEnv } from "./deploymentEnv";
import { loadIdTableMap, taggedIdTable, PostgresDatabaseReader, PostgresDatabaseWriter, serialExecutor, type IdTableMap, type SqlExecutor } from "./db";
import { validateValue, validateReturn } from "./validate";
import { POOL_ACQUISITION_TIMEOUT_MS, beginWithTimeouts } from "../transactionTimeouts";
import { withTransaction, type SqlClient } from "../documentStore";
import { parsePostgresTarget } from "./target";
import { classifyPostgresError } from "../postgresErrors";
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

const MAX_TRANSIENT_ATTEMPTS = 6;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Rerun `attempt` after a transient failure. Each attempt owns its own
 * checkout and transaction, so a rerun never sees the failed attempt's
 * writes. Frozen and permanent failures surface on the first attempt.
 */
async function retryTransient<T>(attempt: (attempt: number) => Promise<T>): Promise<T> {
  for (let count = 1; ; count += 1) {
    try {
      return await attempt(count);
    } catch (error) {
      if (classifyPostgresError(error) !== "transient" || count >= MAX_TRANSIENT_ATTEMPTS) throw error;
      await sleep(10 * 2 ** count + Math.random() * 20);
    }
  }
}

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
  private readonly targetIdentity: string | undefined;

  constructor(private readonly pool: Pool) {
    this.targetIdentity = poolTargetIdentity(pool);
    // The server closing an idle client (pooler idle timeout, failover) surfaces
    // here after pg has already evicted it; unhandled, the event ends the process.
    pool.on("error", (error) => {
      console.error(`postgres: idle client closed: ${error.message}`);
    });
  }

  /** Include opaque IDs in untyped handler arguments, since write proxies inspect them synchronously. */
  private candidateIds(value: unknown): string[] {
    const ids = new Set<string>();
    const seen = new Set<object>();
    const visit = (part: unknown): void => {
      if (typeof part === "string") {
        if (/^[a-z0-9]{32}$/.test(part)) ids.add(part);
      } else if (part && typeof part === "object" && !seen.has(part)) {
        seen.add(part);
        if (Array.isArray(part)) part.forEach(visit);
        else Object.values(part).forEach(visit);
      }
    };
    visit(value);
    return [...ids];
  }

  private async resolveArgumentIds(executor: SqlExecutor, args: Record<string, unknown>, idMap: IdTableMap): Promise<void> {
    const ids = this.candidateIds(args).filter((id) => !idMap.has(id));
    if (!ids.length) return;
    const found = await loadIdTableMap(executor, ids);
    for (const [id, table] of found) idMap.set(id, table);
  }

  private validateArgs(name: string, fn: Registered, args: Record<string, unknown>, idMap: IdTableMap): void {
    validateValue(fn.args, args, `${name} args`, { idTable: (id) => idMap.get(id) ?? taggedIdTable(id) });
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
    return retryTransient(async () => {
      const client = await this.pool.connect();
      try {
        await client.query(beginWithTimeouts(isDataWriteFreezeActive() ? "BEGIN READ ONLY" : "BEGIN"));
        try {
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
    });
  }

  /**
   * Runtime-owned producers must publish their derived metadata atomically.
   * A transient failure reruns `operation` in a fresh transaction, so it must
   * keep its effects inside the database.
   */
  async sqlTransaction<T>(operation: (client: SqlClient) => Promise<T>): Promise<T> {
    return retryTransient(() => withTransaction(this.pool, operation));
  }

  /** Resolve argument ids inside the callable's own transaction, so a call is one checkout and one snapshot. */
  private async prepareArguments(executor: SqlExecutor, name: string, fn: Registered, args: Record<string, unknown>): Promise<IdTableMap> {
    const idMap: IdTableMap = new Map();
    await this.resolveArgumentIds(executor, args, idMap);
    this.validateArgs(name, fn, args, idMap);
    return idMap;
  }

  async query<Query extends FunctionReference<"query">>(reference: Query, ...rest: OptionalRestArgs<Query>): Promise<FunctionReturnType<Query>> {
    const args = (rest[0] ?? {}) as Record<string, unknown>;
    const { name, fn } = await resolveFunction(reference);
    if (!fn.isQuery) throw new Error(`${name} is not a query`);
    validateValue(fn.args, args, `${name} args`);
    const client = await this.pool.connect();
    try {
      await client.query(beginWithTimeouts("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY"));
      try {
        const executor = serialExecutor(client);
        const startedAt = performance.now();
        const idMap = await this.prepareArguments(executor, name, fn, args);
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
    validateValue(fn.args, args, `${name} args`);
    return retryTransient(async (attempt) => {
      const client = await this.pool.connect();
      try {
        await client.query(beginWithTimeouts("BEGIN ISOLATION LEVEL SERIALIZABLE"));
        try {
          const executor = serialExecutor(client);
          const startedAt = performance.now();
          const idMap = await this.prepareArguments(executor, name, fn, args);
          const result = await this.runMutationOn(executor, idMap, name, fn, args);
          await client.query("COMMIT");
          trace("mutation", name, executor, startedAt, attempt);
          return result as FunctionReturnType<Mutation>;
        } catch (error) {
          await client.query("ROLLBACK").catch(() => {});
          throw error;
        }
      } finally {
        client.release();
      }
    });
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
        await this.resolveArgumentIds(client, nested, idMap);
        this.validateArgs(target.name, target.fn, nested, idMap);
        return this.runQueryOn(client, idMap, target.name, target.fn, nested);
      },
    };
    const result = await fn._handler(ctx as unknown as QueryCtx, args);
    return validateReturn(fn.returns, result, `${name} return`, { idTable: (id) => idMap.get(id) ?? taggedIdTable(id) });
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
        await this.resolveArgumentIds(client, nested, idMap);
        this.validateArgs(target.name, target.fn, nested, idMap);
        return this.runQueryOn(client, idMap, target.name, target.fn, nested);
      },
      runMutation: async (reference: FunctionReference<"mutation"> | string, nested: Record<string, unknown> = {}) => {
        const target = await resolveFunction(reference);
        if (!target.fn.isMutation) throw new Error(`${target.name} is not a mutation`);
        await this.resolveArgumentIds(client, nested, idMap);
        this.validateArgs(target.name, target.fn, nested, idMap);
        return this.runMutationOn(client, idMap, target.name, target.fn, nested);
      },
    };
    const result = await fn._handler(ctx as unknown as MutationCtx, args);
    return validateReturn(fn.returns, result, `${name} return`, { idTable: (id) => idMap.get(id) ?? taggedIdTable(id) });
  }
}
