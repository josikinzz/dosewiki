/**
 * Owned handlers read runtime variables from `process.env`. Every application
 * and operator process must supply the required delivery configuration so
 * reads cannot silently omit media.
 *
 * The failure that motivated this check: without `REPLICATION_MEDIA_BASE_URL`,
 * `server/lib/replicationUrls.ts` resolves no R2 URL, `projectGalleryRow`
 * drops every row whose URL is null, and the public gallery loses about 96
 * percent of its items with no error anywhere.
 */

import { ADMIN_INTENTS, getAdminIntentEnvVar } from "../../../server/lib/adminIntentTokens";

/**
 * Variables whose absence silently changes what a READ returns. These are
 * required of any process serving Postgres, including credential-free ones.
 */
export const REQUIRED_DEPLOYMENT_ENV = ["REPLICATION_MEDIA_BASE_URL"] as const;

/**
 * Variables a WRITING process needs. Deliberately not required: on Postgres
 * `DATA_ADMIN_KEY` is itself the admin credential, so demanding it would
 * force write authority onto the read-only public and Effect Index
 * deployments. Their absence makes API-key authentication unavailable, which
 * is what a read-only deployment wants; `lib/data/serverWriteCapability.ts`
 * already reports the resulting configuration failure to writers.
 */
const WRITE_DEPLOYMENT_ENV = [
  "DATA_ADMIN_KEY",
  "GENERATED_PUBLICATION_DEPLOYMENT_FINGERPRINT",
] as const

/** Variables that gate one feature each; absence disables it rather than corrupting reads. */
const OPTIONAL_DEPLOYMENT_ENV = [
  "IDENTITY_SOCIAL_TRUSTED_DELIVERY_EXECUTOR",
  "MAILING_LIST_IP_HASH_SECRET",
  "PUBLIC_CACHE_PUBLISH_SECRET",
  "PUBLIC_CACHE_PUBLISH_TARGETS",
] as const

/** Every scoped admin intent token name, derived from the intent registry. */
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

/**
 * Throws when a required variable is absent. Called once per client, so a
 * misconfigured deployment fails on its first query instead of serving
 * truncated content.
 */
export function assertDeploymentEnv(env: Record<string, string | undefined> = process.env): void {
  const { missingRequired } = inspectDeploymentEnv(env);
  if (missingRequired.length === 0) return;
  throw new Error(
    `Postgres runtime configuration is missing: ${missingRequired.join(", ")}. ` +
      "Configure the approved media delivery origin for this environment.",
  );
}
