import "server-only";

import { ConvexHttpClient, type HttpMutationOptions } from "convex/browser";
import {
  getFunctionName,
  makeFunctionReference,
  type ArgsAndOptions,
  type FunctionReference,
  type FunctionReturnType,
  type OptionalRestArgs,
} from "convex/server";
import {
  getConvexRuntimeTargetMatrix,
  getPrivilegedWriteTarget,
  getPublicServerReadTarget,
  type ConvexRuntimeTarget,
} from "./runtimeTargets";
import { getAdminIntentEnvVar, type AdminIntent } from "../../convex/lib/adminIntentTokens";
import { assertDataWritesNotFrozen } from "../runtime/dataWriteFreeze";
import { getDataBackend, getPostgresConvexClient } from "../postgres/runtime/backend";
import type { PostgresConvexClient } from "../postgres/runtime/client";

export type ServerConvexWriteHealth = {
  adminKeyConfigured: boolean;
  convexUrlConfigured: boolean;
  canSaveToConvex: boolean;
  issues: string[];
  diagnostics: {
    targets: ReturnType<typeof getConvexRuntimeTargetMatrix>;
    warnings: string[];
  };
};

export type ServerConvexDeploymentMetadata = {
  writeUrl: string;
  sourceEnvVar: ConvexRuntimeTarget["sourceEnvVar"];
};

/**
 * Mutations where the server is the actor because the public caller has no
 * authenticated identity to delegate. Keep this allowlist narrow so ordinary
 * route writes cannot bypass the actor gate.
 *
 * The `mailingList` and `publicationRecovery` entries are internal mutations
 * that Convex ran from its own HTTP action and cron; the Next routes that
 * replace them (`/api/subscribe`, `/api/cron/publication-delivery`) invoke
 * them the same actorless way on the Postgres backend.
 */
const SERVICE_MUTATION_NAMES: Record<string, true> = {
  "articleFeedback:create": true,
  "mailingList:subscribe": true,
  "publicationRecovery:claimDue": true,
  "publicationRecovery:recordDelivery": true,
  "siteFeedback:create": true,
  "tripReportSubmissions:create": true,
};

/**
 * The Convex client handed to Next routes. Regular mutations and actions must
 * name the actor they run as. Public intake uses `mutationAsService`, which is
 * restricted to the fixed actorless mutation allowlist above.
 */
export class ServerConvexWriteClient {
  constructor(private readonly inner: ConvexHttpClient | PostgresConvexClient) {}

  query<Query extends FunctionReference<"query">>(
    query: Query,
    ...args: OptionalRestArgs<Query>
  ): Promise<FunctionReturnType<Query>> {
    return this.inner.query(query, ...args);
  }

  async mutation<Mutation extends FunctionReference<"mutation">>(
    mutation: Mutation,
    ...args: ArgsAndOptions<Mutation, HttpMutationOptions>
  ): Promise<FunctionReturnType<Mutation>> {
    assertDataWritesNotFrozen(getFunctionName(mutation));
    assertNamesActor(mutation, args[0]);
    return await this.inner.mutation(mutation, ...args);
  }

  async mutationAsService<Mutation extends FunctionReference<"mutation">>(
    mutation: Mutation,
    ...args: ArgsAndOptions<Mutation, HttpMutationOptions>
  ): Promise<FunctionReturnType<Mutation>> {
    assertDataWritesNotFrozen(getFunctionName(mutation));
    assertServiceMutation(mutation);
    return await this.inner.mutation(mutation, ...args);
  }

  async action<Action extends FunctionReference<"action">>(
    action: Action,
    ...args: OptionalRestArgs<Action>
  ): Promise<FunctionReturnType<Action>> {
    assertDataWritesNotFrozen(getFunctionName(action));
    assertNamesActor(action, args[0]);
    return await this.inner.action(action, ...args);
  }
}

function assertNamesActor(reference: FunctionReference<"mutation" | "action">, args: unknown): void {
  const actorEmail =
    args !== null && typeof args === "object" && "actorEmail" in args ? args.actorEmail : undefined;

  if (typeof actorEmail !== "string" || actorEmail.trim().length === 0) {
    throw new Error(`Server Convex write without actorEmail: ${getFunctionName(reference)}`);
  }
}

function assertServiceMutation(reference: FunctionReference<"mutation">): void {
  const name = getFunctionName(reference);
  if (!SERVICE_MUTATION_NAMES[name]) {
    throw new Error(`Server Convex service mutation is not allowlisted: ${name}`);
  }
}

export type ServerConvexWriteCapability = {
  client: ServerConvexWriteClient;
  adminKey: string;
  getAdminIntentToken: (intent: AdminIntent) => string;
  deployment: ServerConvexDeploymentMetadata;
  health: ServerConvexWriteHealth;
};

export type ServerConvexWriteConfigurationFailure = {
  type: "configuration";
  missing: Array<"adminKey" | "writeUrl">;
  health: ServerConvexWriteHealth;
  message: string;
};

export type ServerConvexWriteCapabilityResult =
  | { ok: true; capability: ServerConvexWriteCapability }
  | { ok: false; failure: ServerConvexWriteConfigurationFailure };

let cachedWriteClient: ServerConvexWriteClient | null = null;
let cachedWriteUrl: string | null = null;

function hasNonEmptyValue(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function getServerConvexAdminKey(): string | null {
  return hasNonEmptyValue(process.env.CONVEX_ADMIN_KEY) ? process.env.CONVEX_ADMIN_KEY : null;
}

export function getServerConvexAdminIntentToken(intent: AdminIntent): string | null {
  const scopedEnvVar = getAdminIntentEnvVar(intent);
  if (scopedEnvVar && hasNonEmptyValue(process.env[scopedEnvVar])) {
    return process.env[scopedEnvVar];
  }

  return getServerConvexAdminKey();
}

export function getServerConvexWriteUrl(): string | null {
  return getPrivilegedWriteTarget().selectedUrl;
}

export function getServerConvexReadUrl(): string | null {
  return getPublicServerReadTarget().selectedUrl;
}

/**
 * Ask the deployment whether a credential is actually accepted.
 *
 * Presence is not validity: a rotated key is configured and still rejected, and
 * Convex reports that as an opaque server error with the reason left in its own
 * logs. This is the only way a route can tell "your token is stale" from "this
 * query has a bug". `apiKey` defaults to the legacy admin key; pass the scoped
 * token a route actually sent to test that one instead.
 */
export async function probeServerConvexAdminCredential(
  actorEmail: string,
  apiKey?: string,
): Promise<void> {
  const capability = getServerConvexWriteCapabilityOrThrow();
  const reference = makeFunctionReference<
    "query",
    { apiKey: string; email: string },
    unknown
  >("contributorProfiles:getOwnedProfile");

  await capability.client.query(reference, {
    apiKey: apiKey ?? capability.adminKey,
    email: actorEmail,
  });
}

export function getServerConvexWriteHealth(): ServerConvexWriteHealth {
  const adminKeyConfigured = getServerConvexAdminKey() !== null;
  const targetMatrix = getConvexRuntimeTargetMatrix();
  const writeTarget = targetMatrix.privilegedWrite;
  const convexUrlConfigured = writeTarget.selectedUrl !== null;
  const issues: string[] = [];

  if (!adminKeyConfigured) {
    issues.push("Missing CONVEX_ADMIN_KEY on the server.");
  }

  if (!convexUrlConfigured) {
    issues.push("Missing Convex URL on the server.");
  }

  const alignment = targetMatrix.editorTargetAlignment;

  return {
    adminKeyConfigured,
    convexUrlConfigured,
    canSaveToConvex: adminKeyConfigured && convexUrlConfigured,
    issues,
    diagnostics: {
      targets: targetMatrix,
      // A read/write split is not a missing credential, so it does not flip
      // canSaveToConvex here — the editor and review surfaces refuse to render
      // on a split, which stops the save before it is offered. This warning is
      // the same fact reported to /api/editor-config-health.
      warnings:
        alignment.status === "split"
          ? [...writeTarget.compatibility.warnings, alignment.summary]
          : writeTarget.compatibility.warnings,
    },
  };
}

function getCachedWriteClient(writeUrl: string): ServerConvexWriteClient {
  const key = getDataBackend() === "postgres" ? "postgres" : writeUrl;
  if (!cachedWriteClient || cachedWriteUrl !== key) {
    cachedWriteClient = new ServerConvexWriteClient(key === "postgres" ? getPostgresConvexClient() : new ConvexHttpClient(writeUrl));
    cachedWriteUrl = key;
  }

  return cachedWriteClient;
}

/** Public form intake cannot borrow an editorial credential or inspect private queues. */
export function getPublicIntakeWriteCapability(): {
  client: ServerConvexWriteClient;
  apiKey: string;
  writeUrl: string;
} | null {
  const apiKey = process.env.CONVEX_ADMIN_TOKEN_PUBLIC_INTAKE_CREATE;
  const writeUrl = getPrivilegedWriteTarget().selectedUrl;
  if (!hasNonEmptyValue(apiKey) || !writeUrl) return null;
  return { client: getCachedWriteClient(writeUrl), apiKey, writeUrl };
}

function buildConfigurationFailure(
  missing: ServerConvexWriteConfigurationFailure["missing"],
  health: ServerConvexWriteHealth,
): ServerConvexWriteConfigurationFailure {
  return {
    type: "configuration",
    missing,
    health,
    message:
      missing.includes("adminKey")
        ? "Convex admin key is not configured on the server."
        : "Convex write capability is not configured on the server.",
  };
}

export function getServerConvexWriteCapability(): ServerConvexWriteCapabilityResult {
  const adminKey = getServerConvexAdminKey();
  const writeTarget = getPrivilegedWriteTarget();
  const writeUrl = writeTarget.selectedUrl;
  const health = getServerConvexWriteHealth();
  const missing: ServerConvexWriteConfigurationFailure["missing"] = [];

  if (!adminKey) {
    missing.push("adminKey");
  }

  if (!writeUrl) {
    missing.push("writeUrl");
  }

  if (missing.length > 0) {
    return {
      ok: false,
      failure: buildConfigurationFailure(missing, health),
    };
  }

  return {
    ok: true,
    capability: {
      client: getCachedWriteClient(writeUrl),
      adminKey,
      getAdminIntentToken: getServerConvexAdminIntentToken,
      deployment: {
        writeUrl,
        sourceEnvVar: writeTarget.sourceEnvVar,
      },
      health,
    },
  };
}

export function getServerConvexWriteCapabilityOrThrow(): ServerConvexWriteCapability {
  const result = getServerConvexWriteCapability();

  if (result.ok === false) {
    if (result.failure.missing.length === 1 && result.failure.missing[0] === "writeUrl") {
      throw new Error(
        "Convex write URL is not configured. Set CONVEX_URL, VITE_CONVEX_URL, or NEXT_PUBLIC_CONVEX_URL.",
      );
    }

    throw new Error(result.failure.message);
  }

  return result.capability;
}

export function resetServerConvexWriteCapabilityCacheForTests(): void {
  cachedWriteClient = null;
  cachedWriteUrl = null;
}
