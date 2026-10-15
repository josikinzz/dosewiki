import { ADMIN_INTENTS, getAdminIntentEnvVar } from "../../../server/lib/adminIntentTokens.ts";
import { replicationMediaBaseUrl } from "../../../server/lib/replicationUrls.ts";

export const REQUIRED_DEPLOYMENT_ENV = ["REPLICATION_MEDIA_BASE_URL"] as const;

const WRITE_DEPLOYMENT_ENV = [
  "DATA_ADMIN_KEY",
  "GENERATED_PUBLICATION_DEPLOYMENT_FINGERPRINT",
] as const

const OPTIONAL_DEPLOYMENT_ENV = [
  "IDENTITY_SOCIAL_TRUSTED_DELIVERY_EXECUTOR",
  "MAILING_LIST_IP_HASH_SECRET",
  "MAILING_LIST_RELAY_SECRET",
  "PUBLIC_CACHE_PUBLISH_SECRET",
  "PUBLIC_CACHE_PUBLISH_TARGETS",
] as const

export function adminIntentEnvVars(): string[] {
  const names = new Set<string>();
  for (const intent of ADMIN_INTENTS) {
    const name = getAdminIntentEnvVar(intent);
    if (name) names.add(name);
  }
  return [...names].sort();
}

type DeploymentEnvReport = {
  missingRequired: string[];
  missingWrite: string[];
  missingOptional: string[];
  missingIntentTokens: string[];
}

export function inspectDeploymentEnv(env: Record<string, string | undefined> = process.env): DeploymentEnvReport {
  const absent = (name: string) => !env[name] || env[name]!.trim().length === 0;
  return {
    missingRequired: REQUIRED_DEPLOYMENT_ENV.filter(absent),
    missingWrite: WRITE_DEPLOYMENT_ENV.filter(absent),
    missingOptional: OPTIONAL_DEPLOYMENT_ENV.filter(absent),
    missingIntentTokens: adminIntentEnvVars().filter(absent),
  };
}

export function assertDeploymentEnv(env: Record<string, string | undefined> = process.env): void {
  const { missingRequired } = inspectDeploymentEnv(env);
  if (missingRequired.length > 0) {
    throw new Error(
      `Postgres runtime configuration is missing: ${missingRequired.join(", ")}. ` +
        "Configure the approved media delivery origin for this environment.",
    );
  }
  if (replicationMediaBaseUrl(env) === null) {
    throw new Error(
      "Postgres runtime configuration has an invalid REPLICATION_MEDIA_BASE_URL. " +
        "Configure the approved HTTPS media delivery origin for this environment.",
    );
  }
}
