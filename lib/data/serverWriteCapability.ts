import "server-only";

import type { HttpMutationOptions } from "../postgres/runtime/api";
import {
  getFunctionName,
  makeFunctionReference,
  type ArgsAndOptions,
  type FunctionReference,
  type FunctionReturnType,
  type OptionalRestArgs,
} from "../postgres/runtime/api";
import {
  getDataRuntimeTargetMatrix,
  getPrivilegedWriteTarget,
  getPublicServerReadTarget,
  type DataRuntimeTarget,
} from "./runtimeTargets";
import { getAdminIntentEnvVar, type AdminIntent } from "../../server/lib/adminIntentTokens";
import { assertDataWritesNotFrozen } from "../runtime/dataWriteFreeze";
import { getPostgresClient } from "../postgres/runtime/backend";
import { resolveRuntimePostgresTarget } from "../postgres/runtime/target";
import type { PostgresClient } from "../postgres/runtime/client";

export type ServerDataWriteHealth = {
  adminKeyConfigured: boolean;
  backend: "postgres";
  postgresUrlConfigured: boolean;
  canSaveToPostgres: boolean;
  issues: string[];
  diagnostics: {
    targets: ReturnType<typeof getDataRuntimeTargetMatrix>;
    warnings: string[];
  };
};

export type ServerDataDeploymentMetadata = {
  writeUrl: string;
  sourceEnvVar: DataRuntimeTarget["sourceEnvVar"];
};

/**
 * Mutations where the server is the actor because the public caller has no
 * authenticated identity to delegate. Keep this allowlist narrow so ordinary
 * route writes cannot bypass the actor gate.
 *
 * `mailingList` and `publicationRecovery` are invoked without a user actor by
 * the same-origin subscription and authenticated cron routes.
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
 * The Postgres client handed to Next routes. Regular mutations and actions must
 * name the actor they run as. Public intake uses `mutationAsService`, which is
 * restricted to the fixed actorless mutation allowlist above.
 */
export class ServerDataWriteClient {
  constructor(private readonly inner: PostgresClient) {}

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
    throw new Error(`Server Postgres write without actorEmail: ${getFunctionName(reference)}`);
  }
}

function assertServiceMutation(reference: FunctionReference<"mutation">): void {
  const name = getFunctionName(reference);
  if (!SERVICE_MUTATION_NAMES[name]) {
    throw new Error(`Server Postgres service mutation is not allowlisted: ${name}`);
  }
}

export type ServerDataWriteCapability = {
  client: ServerDataWriteClient;
  adminKey: string;
  getAdminIntentToken: (intent: AdminIntent) => string;
  deployment: ServerDataDeploymentMetadata;
  health: ServerDataWriteHealth;
};

export type ServerDataWriteConfigurationFailure = {
  type: "configuration";
  missing: Array<"adminKey" | "writeUrl">;
  health: ServerDataWriteHealth;
  message: string;
};

export type ServerDataWriteCapabilityResult =
  | { ok: true; capability: ServerDataWriteCapability }
  | { ok: false; failure: ServerDataWriteConfigurationFailure };

let cachedWriteClient: ServerDataWriteClient | null = null;
let cachedWriteUrl: string | null = null;

function hasNonEmptyValue(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function getServerDataAdminKey(): string | null {
  return hasNonEmptyValue(process.env.DATA_ADMIN_KEY) ? process.env.DATA_ADMIN_KEY : null;
}

export function getServerDataAdminIntentToken(intent: AdminIntent): string | null {
  const scopedEnvVar = getAdminIntentEnvVar(intent);
  if (scopedEnvVar && hasNonEmptyValue(process.env[scopedEnvVar])) {
    return process.env[scopedEnvVar];
  }

  return getServerDataAdminKey();
}

export function getServerDataWriteUrl(): string | null {
  return getPrivilegedWriteTarget().selectedUrl;
}

export function getServerDataReadUrl(): string | null {
  return getPublicServerReadTarget().selectedUrl;
}

/**
 * Ask the deployment whether a credential is actually accepted.
 *
 * Presence is not validity: a rotated key may still be configured but rejected.
 * Replay the actual route credential against a read to check acceptance.
 * `apiKey` defaults to the admin key; pass the scoped token to check that one.
 */
export async function probeServerDataAdminCredential(
  actorEmail: string,
  apiKey?: string,
): Promise<void> {
  const capability = getServerDataWriteCapabilityOrThrow();
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

export function getServerDataWriteHealth(): ServerDataWriteHealth {
  const adminKeyConfigured = getServerDataAdminKey() !== null;
  const targetMatrix = getDataRuntimeTargetMatrix();
  const writeTarget = targetMatrix.privilegedWrite;
  const postgresUrlConfigured = writeTarget.compatibility.allowed;
  const issues = [...writeTarget.compatibility.issues];
  if (!adminKeyConfigured) issues.unshift("Missing DATA_ADMIN_KEY on the server.");
  return {
    backend: "postgres",
    adminKeyConfigured,
    postgresUrlConfigured,
    canSaveToPostgres: adminKeyConfigured && postgresUrlConfigured,
    issues,
    diagnostics: { targets: targetMatrix, warnings: [] },
  };
}

function getCachedWriteClient(): ServerDataWriteClient {
  const key = resolveRuntimePostgresTarget().url;
  if (!cachedWriteClient || cachedWriteUrl !== key) {
    cachedWriteClient = new ServerDataWriteClient(getPostgresClient());
    cachedWriteUrl = key;
  }

  return cachedWriteClient;
}

/** Public form intake cannot borrow an editorial credential or inspect private queues. */
export function getPublicIntakeWriteCapability(): {
  client: Pick<ServerDataWriteClient, "mutationAsService">;
  apiKey: string;
  writeUrl: string;
} | null {
  const apiKey = process.env.DATA_ADMIN_TOKEN_PUBLIC_INTAKE_CREATE;
  const writeUrl = getPrivilegedWriteTarget().selectedUrl;
  if (!hasNonEmptyValue(apiKey) || !writeUrl) return null;
  const client = getCachedWriteClient();
  return { client: { mutationAsService: client.mutationAsService.bind(client) }, apiKey, writeUrl };
}

function buildConfigurationFailure(
  missing: ServerDataWriteConfigurationFailure["missing"],
  health: ServerDataWriteHealth,
): ServerDataWriteConfigurationFailure {
  return {
    type: "configuration",
    missing,
    health,
    message:
      missing.includes("adminKey")
        ? "Postgres admin key is not configured on the server."
        : "Postgres write capability is not configured on the server.",
  };
}

export function getServerDataWriteCapability(): ServerDataWriteCapabilityResult {
  const adminKey = getServerDataAdminKey();
  const writeTarget = getPrivilegedWriteTarget();
  const writeUrl = writeTarget.selectedUrl;
  const health = getServerDataWriteHealth();
  const missing: ServerDataWriteConfigurationFailure["missing"] = [];

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
      client: getCachedWriteClient(),
      adminKey,
      getAdminIntentToken: getServerDataAdminIntentToken,
      deployment: {
        writeUrl,
        sourceEnvVar: writeTarget.sourceEnvVar,
      },
      health,
    },
  };
}

export function getServerDataWriteCapabilityOrThrow(): ServerDataWriteCapability {
  const result = getServerDataWriteCapability();

  if (result.ok === false) {
    if (result.failure.missing.length === 1 && result.failure.missing[0] === "writeUrl") {
      throw new Error(result.failure.health.issues.join(" "));
    }

    throw new Error(result.failure.message);
  }

  return result.capability;
}

export function resetServerDataWriteCapabilityCacheForTests(): void {
  cachedWriteClient = null;
  cachedWriteUrl = null;
}
