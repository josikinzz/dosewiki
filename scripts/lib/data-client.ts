import { getFunctionName } from "../../lib/postgres/runtime/api.ts";
import type { ArgsAndOptions, FunctionReference, FunctionReturnType, OptionalRestArgs, HttpMutationOptions } from "../../lib/postgres/runtime/api.ts";
import { assertDataWritesNotFrozen } from "../../lib/runtime/dataWriteFreeze.ts";
import type { PostgresClient } from "../../lib/postgres/runtime/client.ts";
import { assertDeploymentEnv } from "../../lib/postgres/runtime/deploymentEnv.ts";
import { RUNTIME_POOL_OPTIONS } from "../../lib/postgres/transactionTimeouts.ts";
import { guardTarget, resolveExplicitTarget } from "../postgres/targetGuard.ts";

import { parsePostgresTarget, requirePostgresBackend } from "../../lib/postgres/runtime/target.ts";

export type DataBackend = "postgres";
export const POSTGRES_EXPLICIT_TARGET_ENV_VAR = "TARGET_POSTGRES_URL";
export const POSTGRES_FALLBACK_TARGET_ENV_VARS: readonly string[] = Object.freeze([
  "POSTGRES_POOLED_URL",
  "POSTGRES_DIRECT_URL",
]);

export type DataClient = Pick<PostgresClient, "query" | "mutation" | "action"> & {
  end?: () => Promise<void>;
};

export type ResolvedTarget = {
  url: string | null;
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

export function getDataBackend(env: NodeJS.ProcessEnv = process.env): DataBackend {
  return requirePostgresBackend(env);
}

export function postgresFingerprintFromUrl(targetUrl: string | null | undefined): string | null {
  return targetUrl ? parsePostgresTarget(targetUrl).identity : null;
}

export function resolvePostgresTarget({
  argv = process.argv.slice(2),
  env = process.env,
  explicitOnly = false,
}: { argv?: string[]; env?: NodeJS.ProcessEnv; explicitOnly?: boolean } = {}): ResolvedTarget {
  const explicit = resolveExplicitTarget(argv, env);
  if (explicit) return explicit;
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
        return new PostgresClient(new Pool({ connectionString: this.#url, max: 4, allowExitOnIdle: true, ...RUNTIME_POOL_OPTIONS }));
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
