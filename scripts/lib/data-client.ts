/**
 * Postgres-only client factory for operator scripts. DATA_BACKEND=postgres is
 * mandatory. An explicit target is never discarded or replaced with an
 * environment fallback. Remote targets require the existing host confirmation.
 * The runtime loads on first use; construction validates configuration without
 * opening a database connection.
 */

import { getFunctionName } from "../../lib/postgres/runtime/api.ts";
import type { ArgsAndOptions, FunctionReference, FunctionReturnType, OptionalRestArgs, HttpMutationOptions } from "../../lib/postgres/runtime/api.ts";
import { assertDataWritesNotFrozen } from "../../lib/runtime/dataWriteFreeze.ts";
import type { PostgresClient } from "../../lib/postgres/runtime/client.ts";
import { assertDeploymentEnv } from "../../lib/postgres/runtime/deploymentEnv.ts";
import { POOL_ACQUISITION_TIMEOUT_MS } from "../../lib/postgres/transactionTimeouts.ts";
import { guardTarget } from "../postgres/targetGuard.ts";

import { parsePostgresTarget, requirePostgresBackend } from "../../lib/postgres/runtime/target.ts";

export type DataBackend = "postgres";
export const POSTGRES_EXPLICIT_TARGET_ENV_VAR = "TARGET_POSTGRES_URL";
export const POSTGRES_FALLBACK_TARGET_ENV_VARS: readonly string[] = Object.freeze([
  "POSTGRES_POOLED_URL",
  "POSTGRES_DIRECT_URL",
]);

/** The owned callable client surface used by operator scripts. */
export type DataClient = Pick<PostgresClient, "query" | "mutation" | "action"> & {
  end?: () => Promise<void>;
};

export type ResolvedTarget = {
  url: string | null;
  /** CLI flag or environment variable that supplied the target. */
  source: string | null;
};

export type CreateDataClientOptions = {
  target?: string | null;
  allowRemote?: boolean;
  argv?: string[];
  env?: NodeJS.ProcessEnv;
};

export type CreatedDataClient = {
  backend: DataBackend;
  client: DataClient;
  target: string;
  /** Credential-free `<host>/<database>` fingerprint used for operator confirmation. */
  fingerprint: string | null;
};

function readNonEmpty(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function flagValue(argv: string[], name: string): string | null {
  const prefix = `${name}=`;
  for (let index = 0; index < argv.length; index += 1) {
    const entry = argv[index];
    if (entry === name) return readNonEmpty(argv[index + 1]);
    if (entry.startsWith(prefix)) return readNonEmpty(entry.slice(prefix.length));
  }
  return null;
}

/** Normal operation accepts only the Postgres backend. */
export function getDataBackend(env: NodeJS.ProcessEnv = process.env): DataBackend {
  return requirePostgresBackend(env);
}

export function normalizeHostname(hostname: string): string {
  const normalized = hostname.trim().toLowerCase();
  return normalized.startsWith("[") && normalized.endsWith("]") ? normalized.slice(1, -1) : normalized;
}

export function isLoopbackHostname(hostname: string): boolean {
  return ["localhost", "127.0.0.1", "::1"].includes(normalizeHostname(hostname));
}

/**
 * The Postgres target fingerprint: `<hostname>/<database>`.
 * Loopback hosts are included on purpose; a local rehearsal spells out
 * `--expected-deployment=localhost/dosewiki` like any other target.
 */
export function postgresFingerprintFromUrl(targetUrl: string | null | undefined): string | null {
  return targetUrl ? parsePostgresTarget(targetUrl).identity : null;
}

/**
 * `--target <url>` > TARGET_POSTGRES_URL > POSTGRES_POOLED_URL > POSTGRES_DIRECT_URL.
 * `explicitOnly` drops the two fallback variables, which is what production
 * write commands use so a preview environment cannot inherit a writer.
 */
export function resolvePostgresTarget({
  argv = process.argv.slice(2),
  env = process.env,
  explicitOnly = false,
}: { argv?: string[]; env?: NodeJS.ProcessEnv; explicitOnly?: boolean } = {}): ResolvedTarget {
  const cli = flagValue(argv, "--target");
  if (argv.some((value) => value === "--target" || value.startsWith("--target="))) {
    if (!cli || cli.startsWith("--")) throw new Error("--target requires an explicit Postgres URL.");
    parsePostgresTarget(cli);
    return { url: cli, source: "--target" };
  }
  const explicit = env[POSTGRES_EXPLICIT_TARGET_ENV_VAR];
  if (explicit !== undefined) {
    parsePostgresTarget(explicit);
    return { url: explicit, source: POSTGRES_EXPLICIT_TARGET_ENV_VAR };
  }
  if (!explicitOnly) {
    for (const key of POSTGRES_FALLBACK_TARGET_ENV_VARS) {
      const value = env[key];
      if (value !== undefined) {
        parsePostgresTarget(value);
        return { url: value, source: key };
      }
    }
  }
  return { url: null, source: null };
}

/** Independent read source; an absent source uses the selected Postgres target. */
export function resolvePostgresSource({
  argv = process.argv.slice(2),
  env = process.env,
}: { argv?: string[]; env?: NodeJS.ProcessEnv } = {}): ResolvedTarget {
  const cli = flagValue(argv, "--source-url");
  if (argv.some((value) => value === "--source-url" || value.startsWith("--source-url="))) {
    if (!cli || cli.startsWith("--")) throw new Error("--source-url requires an explicit Postgres URL.");
    parsePostgresTarget(cli);
    return { url: cli, source: "--source-url" };
  }
  if (env.SOURCE_POSTGRES_URL !== undefined) {
    parsePostgresTarget(env.SOURCE_POSTGRES_URL);
    return { url: env.SOURCE_POSTGRES_URL, source: "SOURCE_POSTGRES_URL" };
  }
  return resolvePostgresTarget({ argv, env });
}

export function isPostgresTargetExplicit(source: string | null): boolean {
  return source === "--target" || source === POSTGRES_EXPLICIT_TARGET_ENV_VAR;
}


/**
 * Loads `lib/postgres/runtime/client.ts` (and with it every registered Postgres
 * module) on the first query or mutation. Construction is synchronous so the
 * factory can support constructor-based operator scripts.
 */
class LazyPostgresDataClient implements DataClient {
  readonly #url: string;
  #loading: Promise<PostgresClient> | null = null;

  constructor(url: string) {
    this.#url = url;
  }

  #load(): Promise<PostgresClient> {
    if (!this.#loading) {
      this.#loading = (async () => {
        const [{ PostgresClient }, { Pool }] = await Promise.all([
          import("../../lib/postgres/runtime/client.ts"),
          import("pg"),
        ]);
        // allowExitOnIdle: scripts that fall off the end must not wait for the pool.
        return new PostgresClient(new Pool({ connectionString: this.#url, max: 4, allowExitOnIdle: true, connectionTimeoutMillis: POOL_ACQUISITION_TIMEOUT_MS }));
      })();
    }
    return this.#loading;
  }

  async query<Query extends FunctionReference<"query">>(reference: Query, ...args: OptionalRestArgs<Query>): Promise<FunctionReturnType<Query>> {
    return (await this.#load()).query(reference, ...args);
  }

  async mutation<Mutation extends FunctionReference<"mutation">>(reference: Mutation, ...args: ArgsAndOptions<Mutation, HttpMutationOptions>): Promise<FunctionReturnType<Mutation>> {
    return (await this.#load()).mutation(reference, ...args);
  }

  async action<Action extends FunctionReference<"action">>(reference: Action, ...args: OptionalRestArgs<Action>): Promise<FunctionReturnType<Action>> {
    return (await this.#load()).action(reference, ...args);
  }

  async end(): Promise<void> {
    if (this.#loading) await (await this.#loading).end();
  }
}

function frozenReferenceName(reference: FunctionReference<"mutation" | "action">): string {
  try {
    return getFunctionName(reference);
  } catch {
    return "unnamed function reference";
  }
}

/**
 * The freeze the cutover runbook sets (`DATA_WRITES_FROZEN`) has to hold for
 * operator scripts too, not just app routes: during the window every one of the
 * 177 scripts that take their client from this factory must refuse to write on
 * either backend, while their reads keep working. Refusal carries
 * `code: "DATA_WRITES_FROZEN"` and happens before the reference reaches the
 * backend, so nothing is sent and no SQL statement runs.
 */
class FreezeGuardedDataClient implements DataClient {
  readonly #inner: DataClient;
  readonly #env: NodeJS.ProcessEnv;

  constructor(inner: DataClient, env: NodeJS.ProcessEnv) {
    this.#inner = inner;
    this.#env = env;
  }

  query<Query extends FunctionReference<"query">>(reference: Query, ...args: OptionalRestArgs<Query>): Promise<FunctionReturnType<Query>> {
    return this.#inner.query(reference, ...args);
  }

  mutation<Mutation extends FunctionReference<"mutation">>(reference: Mutation, ...args: ArgsAndOptions<Mutation, HttpMutationOptions>): Promise<FunctionReturnType<Mutation>> {
    assertDataWritesNotFrozen(frozenReferenceName(reference), this.#env);
    return this.#inner.mutation(reference, ...args);
  }

  action<Action extends FunctionReference<"action">>(reference: Action, ...args: OptionalRestArgs<Action>): Promise<FunctionReturnType<Action>> {
    assertDataWritesNotFrozen(frozenReferenceName(reference), this.#env);
    return this.#inner.action(reference, ...args);
  }

  async end(): Promise<void> {
    await this.#inner.end?.();
  }
}

/**
 * Constructor-shaped adapter for the scripts that inject a `Client` class and
 * call `new Client(url)`; tests keep passing their fakes through that seam.
 */
export const BackendClient = function BackendClient(this: unknown, url: string): DataClient {
  return createDataClient({ target: url }).client;
} as unknown as new (url: string) => DataClient;

export function createDataClient({
  target = null,
  allowRemote,
  argv = process.argv.slice(2),
  env = process.env,
}: CreateDataClientOptions = {}): CreatedDataClient {
  const backend = getDataBackend(env);

  if (argv.some((value) => value === "--target-url" || value.startsWith("--target-url="))) {
    throw new Error("Use --target with a Postgres URL; --target-url is retired.");
  }
  const resolved = target !== null
    ? { url: target, source: "argument" }
    : resolvePostgresTarget({ argv, env });
  if (!resolved.url) {
    throw new Error(
      "createDataClient: DATA_BACKEND=postgres needs --target <url>, TARGET_POSTGRES_URL, POSTGRES_POOLED_URL, or POSTGRES_DIRECT_URL.",
    );
  }
  const fingerprint = postgresFingerprintFromUrl(resolved.url);
  guardTarget(resolved.url, allowRemote ?? argv.includes("--allow-remote"), env);
  assertDeploymentEnv(env);
  return {
    backend,
    client: new FreezeGuardedDataClient(new LazyPostgresDataClient(resolved.url), env),
    target: resolved.url,
    fingerprint,
  };
}
