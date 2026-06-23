import { hasLegacyCredentialsConfigured } from "./legacyCredentials";

export const DEVELOPMENT_AUTH_SECRET = "dosewiki-next-auth-development-secret";

type AuthRuntimeEnv = Partial<Record<string, string | undefined>>;

export type AuthDeploymentTarget = "local" | "preview" | "production";
export type AuthProviderId = "github" | "credentials";
export type AuthMode = "github" | "legacy-credentials" | "disabled";

export type AuthRuntimePolicy = {
  deploymentTarget: AuthDeploymentTarget;
  nodeEnv: string | undefined;
  authSecret: string | undefined;
  authSecretSource: "AUTH_SECRET" | "NEXTAUTH_SECRET" | "development-fallback" | "missing";
  github: {
    configured: boolean;
    available: boolean;
    clientId: string | undefined;
    clientSecret: string | undefined;
  };
  legacyCredentials: {
    configured: boolean;
    available: boolean;
    reason: "available" | "missing-auth-secret" | "missing-credentials";
  };
  activeMode: AuthMode;
  providers: AuthProviderId[];
  requiredSecrets: string[];
  restrictions: string[];
};

function firstPresent(env: AuthRuntimeEnv, keys: string[]) {
  for (const key of keys) {
    const value = env[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return { key, value };
    }
  }

  return null;
}

function getDeploymentTarget(env: AuthRuntimeEnv): AuthDeploymentTarget {
  if (env.VERCEL_ENV === "production") {
    return "production";
  }

  if (env.VERCEL_ENV === "preview") {
    return "preview";
  }

  if (env.NODE_ENV === "production") {
    return "production";
  }

  return "local";
}

function hasLegacyCredentialsInEnv(env: AuthRuntimeEnv): boolean {
  return hasLegacyCredentialsConfigured({ env });
}

export function resolveAuthRuntimePolicy(env: AuthRuntimeEnv = process.env): AuthRuntimePolicy {
  const deploymentTarget = getDeploymentTarget(env);
  const isDevelopment = env.NODE_ENV === "development";
  const authSecret = firstPresent(env, ["AUTH_SECRET", "NEXTAUTH_SECRET"]);
  const githubClientId = firstPresent(env, ["AUTH_GITHUB_ID", "GITHUB_ID"])?.value;
  const githubClientSecret = firstPresent(env, ["AUTH_GITHUB_SECRET", "GITHUB_SECRET"])?.value;
  const githubConfigured = Boolean(githubClientId && githubClientSecret);
  const legacyConfigured = hasLegacyCredentialsInEnv(env);

  const resolvedSecret = authSecret?.value ?? (isDevelopment ? DEVELOPMENT_AUTH_SECRET : undefined);
  const githubAvailable = githubConfigured && Boolean(resolvedSecret);
  const legacyAvailable = legacyConfigured && Boolean(resolvedSecret);
  const authSecretSource =
    authSecret?.key === "AUTH_SECRET" || authSecret?.key === "NEXTAUTH_SECRET"
      ? authSecret.key
      : isDevelopment
        ? "development-fallback"
        : "missing";

  let legacyReason: AuthRuntimePolicy["legacyCredentials"]["reason"] = "missing-credentials";
  if (legacyAvailable) {
    legacyReason = "available";
  } else if (legacyConfigured) {
    legacyReason = "missing-auth-secret";
  }

  const providers: AuthProviderId[] = [];
  if (legacyAvailable) {
    providers.push("credentials");
  }
  if (githubAvailable) {
    providers.push("github");
  }

  const requiredSecrets: string[] = [];
  if (!resolvedSecret && (deploymentTarget !== "local" || githubConfigured || legacyConfigured)) {
    requiredSecrets.push("AUTH_SECRET");
  }
  if (!githubConfigured && !legacyConfigured && deploymentTarget !== "local") {
    requiredSecrets.push("ADMIN_PASSWORD");
  }

  const restrictions: string[] = [];
  if (!resolvedSecret && (deploymentTarget !== "local" || githubConfigured || legacyConfigured)) {
    restrictions.push("AUTH_SECRET is required before Auth.js providers can issue sessions.");
  }
  if (!githubAvailable && !legacyAvailable && deploymentTarget !== "local") {
    restrictions.push(
      "Configure at least one Auth.js provider: an editor password env var such as ADMIN_PASSWORD or an OAuth provider.",
    );
  }

  return {
    deploymentTarget,
    nodeEnv: env.NODE_ENV,
    authSecret: resolvedSecret,
    authSecretSource,
    github: {
      configured: githubConfigured,
      available: githubAvailable,
      clientId: githubClientId,
      clientSecret: githubClientSecret,
    },
    legacyCredentials: {
      configured: legacyConfigured,
      available: legacyAvailable,
      reason: legacyReason,
    },
    activeMode: legacyAvailable ? "legacy-credentials" : githubAvailable ? "github" : "disabled",
    providers,
    requiredSecrets,
    restrictions,
  };
}

export const authRuntimePolicy = resolveAuthRuntimePolicy();
export const authSecret = authRuntimePolicy.authSecret;
export const hasGitHubAuthConfigured = authRuntimePolicy.github.available;
export const hasLegacyCredentialsAuthConfigured = authRuntimePolicy.legacyCredentials.available;
