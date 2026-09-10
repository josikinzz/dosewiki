/**
 * One client factory for every operator script (tickets 17 to 19).
 *
 * `createDataClient()` returns a `ConvexHttpClient`-shaped client for whichever
 * backend `DATA_BACKEND` selects, so call sites keep their
 * `client.query(api.x.y, args)` / `client.mutation(...)` lines unchanged:
 *
 *   DATA_BACKEND unset or anything but "postgres" (Convex):
 *     the URL passed as `target`, else `--target-url`, else TARGET_CONVEX_URL.
 *     Browser and compatibility variables (CONVEX_URL, VITE_CONVEX_URL,
 *     NEXT_PUBLIC_CONVEX_URL) are never consulted here; scripts that read
 *     them do so through their run context and pass the URL in explicitly.
 *
 *   DATA_BACKEND=postgres:
 *     a postgres:// URL passed as `target`, else `--target <url>`, else
 *     TARGET_POSTGRES_URL, else POSTGRES_POOLED_URL, else POSTGRES_DIRECT_URL.
 *     A Convex https URL passed as `target` is ignored (the script computed it
 *     for the Convex backend) and the argv/env chain is used instead.
 *     Any non-loopback host must be confirmed twice, exactly like
 *     `scripts/postgres/targetGuard.ts`: `--allow-remote` (or
 *     `allowRemote: true`) plus POSTGRES_IMPORT_CONFIRM=<hostname>.
 *
 * The Postgres client is loaded lazily on first use so that Convex-mode runs
 * (and the node:test suites that import these scripts) never load the SQL
 * runtime or the registered Convex modules. This file stays within Node's
 * erasable TypeScript subset for the same reason.
 */

import { ConvexHttpClient, type HttpMutationOptions } from "convex/browser";
import { getFunctionName } from "convex/server";
import type { ArgsAndOptions, FunctionReference, FunctionReturnType, OptionalRestArgs } from "convex/server";
import { assertDataWritesNotFrozen } from "../../lib/runtime/dataWriteFreeze.ts";
import type { PostgresConvexClient } from "../../lib/postgres/runtime/client.ts";
import { guardTarget } from "../postgres/targetGuard.ts";

export type DataBackend = "convex" | "postgres";

export const CONVEX_EXPLICIT_TARGET_ENV_VAR = "TARGET_CONVEX_URL";
export const POSTGRES_EXPLICIT_TARGET_ENV_VAR = "TARGET_POSTGRES_URL";
export const POSTGRES_FALLBACK_TARGET_ENV_VARS: readonly string[] = Object.freeze([
  "POSTGRES_POOLED_URL",
  "POSTGRES_DIRECT_URL",
]);

/** The `ConvexHttpClient` surface scripts use, plus `end()` for pooled backends. */
export type DataClient = Pick<ConvexHttpClient, "query" | "mutation" | "action"> & {
  end?: () => Promise<void>;
};

export type ResolvedTarget = {
  url: string | null;
  /** `--target`, `--target-url`, or the env var name the URL came from. */
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
  /** Deployment fingerprint: Convex slug, or `<host>/<database>` for Postgres. */
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

/** Explicit only: an unset or unknown value means Convex (ticket 19). */
export function getDataBackend(env: NodeJS.ProcessEnv = process.env): DataBackend {
  return env.DATA_BACKEND === "postgres" ? "postgres" : "convex";
}

export function isPostgresUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const protocol = new URL(value).protocol;
    return protocol === "postgres:" || protocol === "postgresql:";
  } catch {
    return false;
  }
}

export function normalizeHostname(hostname: string): string {
  const normalized = hostname.trim().toLowerCase();
  return normalized.startsWith("[") && normalized.endsWith("]") ? normalized.slice(1, -1) : normalized;
}

export function isLoopbackHostname(hostname: string): boolean {
  return ["localhost", "127.0.0.1", "::1"].includes(normalizeHostname(hostname));
}

/**
 * The Postgres equivalent of a Convex deployment slug: `<hostname>/<database>`.
 * Loopback hosts are included on purpose; a local rehearsal spells out
 * `--expected-deployment=localhost/dosewiki` like any other target.
 */
export function postgresFingerprintFromUrl(targetUrl: string | null | undefined): string | null {
  if (!targetUrl) return null;
  let parsed: URL;
  try {
    parsed = new URL(targetUrl);
  } catch {
    throw new Error("Postgres write target must be a valid postgres:// URL.");
  }
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new Error("Postgres write target must use the postgres:// scheme.");
  }
  const database = decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
  if (!parsed.hostname || !database || database.includes("/")) {
    throw new Error("Postgres write target must name one host and one database.");
  }
  return `${normalizeHostname(parsed.hostname)}/${database}`;
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
  if (cli) return { url: cli, source: "--target" };
  const explicit = readNonEmpty(env[POSTGRES_EXPLICIT_TARGET_ENV_VAR]);
  if (explicit) return { url: explicit, source: POSTGRES_EXPLICIT_TARGET_ENV_VAR };
  if (!explicitOnly) {
    for (const key of POSTGRES_FALLBACK_TARGET_ENV_VARS) {
      const value = readNonEmpty(env[key]);
      if (value) return { url: value, source: key };
    }
  }
  return { url: null, source: null };
}

export function isPostgresTargetExplicit(source: string | null): boolean {
  return source === "--target" || source === POSTGRES_EXPLICIT_TARGET_ENV_VAR;
}

/** `--target-url <url>` > TARGET_CONVEX_URL; compatibility variables are ignored. */
export function resolveConvexTarget({
  argv = process.argv.slice(2),
  env = process.env,
}: { argv?: string[]; env?: NodeJS.ProcessEnv } = {}): ResolvedTarget {
  const cli = flagValue(argv, "--target-url");
  if (cli) return { url: cli, source: "--target-url" };
  const explicit = readNonEmpty(env[CONVEX_EXPLICIT_TARGET_ENV_VAR]);
  if (explicit) return { url: explicit, source: CONVEX_EXPLICIT_TARGET_ENV_VAR };
  return { url: null, source: null };
}

function convexFingerprint(targetUrl: string): string | null {
  try {
    const parsed = new URL(targetUrl);
    const suffix = ".convex.cloud";
    if (parsed.protocol !== "https:" || !parsed.hostname.endsWith(suffix)) return null;
    const slug = parsed.hostname.slice(0, -suffix.length);
    return slug && !slug.includes(".") ? slug : null;
  } catch {
    return null;
  }
}

/**
 * Loads `lib/postgres/runtime/client.ts` (and with it every registered Convex
 * module) on the first query or mutation. Construction is synchronous so the
 * factory can stand in for `new ConvexHttpClient(url)` anywhere.
 */
class LazyPostgresDataClient implements DataClient {
  readonly #url: string;
  #loading: Promise<PostgresConvexClient> | null = null;

  constructor(url: string) {
    this.#url = url;
  }

  #load(): Promise<PostgresConvexClient> {
    if (!this.#loading) {
      this.#loading = (async () => {
        const [{ PostgresConvexClient }, { Pool }] = await Promise.all([
          import("../../lib/postgres/runtime/client.ts"),
          import("pg"),
        ]);
        // allowExitOnIdle: scripts that fall off the end must not wait for the pool.
        return new PostgresConvexClient(new Pool({ connectionString: this.#url, max: 4, allowExitOnIdle: true }));
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

  if (backend === "convex") {
    const explicit = readNonEmpty(target);
    const resolved = explicit ? { url: explicit, source: "argument" } : resolveConvexTarget({ argv, env });
    if (!resolved.url) {
      throw new Error("createDataClient: no Convex URL. Pass a target, --target-url, or set TARGET_CONVEX_URL.");
    }
    return {
      backend,
      client: new FreezeGuardedDataClient(new ConvexHttpClient(resolved.url) as unknown as DataClient, env),
      target: resolved.url,
      fingerprint: convexFingerprint(resolved.url),
    };
  }

  const resolved = isPostgresUrl(target) ? { url: target, source: "argument" } : resolvePostgresTarget({ argv, env });
  if (!resolved.url) {
    throw new Error(
      "createDataClient: DATA_BACKEND=postgres needs --target <url>, TARGET_POSTGRES_URL, POSTGRES_POOLED_URL, or POSTGRES_DIRECT_URL.",
    );
  }
  guardTarget(resolved.url, allowRemote ?? argv.includes("--allow-remote"), env);
  return {
    backend,
    client: new FreezeGuardedDataClient(new LazyPostgresDataClient(resolved.url), env),
    target: resolved.url,
    fingerprint: postgresFingerprintFromUrl(resolved.url),
  };
}
