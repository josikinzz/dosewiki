export const DEVELOPMENT_AUTH_SECRET = "dosewiki-next-auth-development-secret";

type AuthRuntimeEnv = Partial<Record<string, string | undefined>>;

type AuthDeploymentTarget = "local" | "preview" | "production"

export type AuthRuntimePolicy = {
  deploymentTarget: AuthDeploymentTarget;
  nodeEnv: string | undefined;
  authSecret: string | undefined;
  authSecretSource: "AUTH_SECRET" | "NEXTAUTH_SECRET" | "development-fallback" | "missing";
  sessionsAvailable: boolean;
  requiredSecrets: string[];
  restrictions: string[];
};

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

export function resolveAuthRuntimePolicy(env: AuthRuntimeEnv = process.env): AuthRuntimePolicy {
  const deploymentTarget = getDeploymentTarget(env);
  const isDevelopment = env.NODE_ENV === "development";

  let authSecretSource: AuthRuntimePolicy["authSecretSource"] = "missing";
  let resolvedSecret: string | undefined;
  for (const key of ["AUTH_SECRET", "NEXTAUTH_SECRET"] as const) {
    const value = env[key];
    if (typeof value === "string" && value.trim().length > 0) {
      authSecretSource = key;
      resolvedSecret = value;
      break;
    }
  }
  if (!resolvedSecret && isDevelopment) {
    authSecretSource = "development-fallback";
    resolvedSecret = DEVELOPMENT_AUTH_SECRET;
  }

  const requiredSecrets: string[] = [];
  const restrictions: string[] = [];
  if (!resolvedSecret) {
    requiredSecrets.push("AUTH_SECRET");
    restrictions.push("AUTH_SECRET is required before Auth.js can issue sessions.");
  }

  return {
    deploymentTarget,
    nodeEnv: env.NODE_ENV,
    authSecret: resolvedSecret,
    authSecretSource,
    sessionsAvailable: Boolean(resolvedSecret),
    requiredSecrets,
    restrictions,
  };
}

export const authRuntimePolicy = resolveAuthRuntimePolicy();
export const authSecret = authRuntimePolicy.authSecret;
