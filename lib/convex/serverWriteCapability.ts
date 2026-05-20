import "server-only";

import { ConvexHttpClient } from "convex/browser";
import {
  getConvexRuntimeTargetMatrix,
  getPrivilegedWriteTarget,
  getPublicServerReadTarget,
  type ConvexRuntimeTarget,
} from "./runtimeTargets";
import { getAdminIntentEnvVar, type AdminIntent } from "../../convex/lib/adminIntentTokens";

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

export type ServerConvexWriteCapability = {
  client: ConvexHttpClient;
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

let cachedWriteClient: ConvexHttpClient | null = null;
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

  return {
    adminKeyConfigured,
    convexUrlConfigured,
    canSaveToConvex: adminKeyConfigured && convexUrlConfigured,
    issues,
    diagnostics: {
      targets: targetMatrix,
      warnings: writeTarget.compatibility.warnings,
    },
  };
}

function getCachedWriteClient(writeUrl: string): ConvexHttpClient {
  if (!cachedWriteClient || cachedWriteUrl !== writeUrl) {
    cachedWriteClient = new ConvexHttpClient(writeUrl);
    cachedWriteUrl = writeUrl;
  }

  return cachedWriteClient;
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
