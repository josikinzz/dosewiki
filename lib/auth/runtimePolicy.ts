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
    clientId: string | undefined;
    clientSecret: string | undefined;
  };
  legacyCredentials: {
    configured: boolean;
    available: boolean;
    reason: "available" | "github-configured" | "not-development" | "missing-credentials";
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
  const legacyAvailable = !githubConfigured && isDevelopment && legacyConfigured;

  const resolvedSecret = authSecret?.value ?? (isDevelopment ? DEVELOPMENT_AUTH_SECRET : undefined);
  const authSecretSource =
    authSecret?.key === "AUTH_SECRET" || authSecret?.key === "NEXTAUTH_SECRET"
      ? authSecret.key
      : isDevelopment
        ? "development-fallback"
        : "missing";

  let legacyReason: AuthRuntimePolicy["legacyCredentials"]["reason"] = "missing-credentials";
  if (legacyAvailable) {
    legacyReason = "available";
  } else if (githubConfigured) {
    legacyReason = "github-configured";
  } else if (!isDevelopment) {
    legacyReason = "not-development";
  }

  const providers: AuthProviderId[] = [];
  if (githubConfigured) {
    providers.push("github");
  }
  if (legacyAvailable) {
    providers.push("credentials");
  }

  const requiredSecrets: string[] = [];
  if (!resolvedSecret) {
    requiredSecrets.push("AUTH_SECRET");
  }
  if (!githubConfigured && deploymentTarget !== "local") {
    requiredSecrets.push("AUTH_GITHUB_ID", "AUTH_GITHUB_SECRET");
  }

  const restrictions: string[] = [];
  if (deploymentTarget !== "local" && legacyConfigured) {
    restrictions.push("Legacy credentials are ignored outside local development.");
  }
  if (!resolvedSecret && deploymentTarget !== "local") {
    restrictions.push("AUTH_SECRET is required for preview and production Auth.js sessions.");
  }
  if (!githubConfigured && deploymentTarget !== "local") {
    restrictions.push("GitHub OAuth is required for real preview and production sign-in.");
  }

  return {
    deploymentTarget,
    nodeEnv: env.NODE_ENV,
    authSecret: resolvedSecret,
    authSecretSource,
    github: {
      configured: githubConfigured,
      clientId: githubClientId,
      clientSecret: githubClientSecret,
    },
    legacyCredentials: {
      configured: legacyConfigured,
      available: legacyAvailable,
      reason: legacyReason,
    },
    activeMode: githubConfigured ? "github" : legacyAvailable ? "legacy-credentials" : "disabled",
    providers,
    requiredSecrets,
    restrictions,
  };
}

export const authRuntimePolicy = resolveAuthRuntimePolicy();
export const authSecret = authRuntimePolicy.authSecret;
export const hasGitHubAuthConfigured = authRuntimePolicy.github.configured;
export const hasLegacyCredentialsAuthConfigured = authRuntimePolicy.legacyCredentials.available;
