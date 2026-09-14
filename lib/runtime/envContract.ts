import { resolveAuthRuntimePolicy, type AuthRuntimePolicy } from "../auth/runtimePolicy";
import {
  getConvexRuntimeTargetMatrix,
  type ConvexRuntimeTargetMatrix,
} from "../convex/runtimeTargets";
import {
  PUBLICATION_TARGETS_ENV,
  getPublicationTargets,
} from "../next/publicationDispatch";
import {
  PUBLICATION_SECRET_ENV,
  getPublicationSecret,
} from "../next/publicationSignature";

export type RuntimeEnv = Partial<Record<string, string | undefined>>;

type RuntimeDeploymentProfile = "local" | "preview" | "production"

type RuntimeEnvContractStatus = "ok" | "warning" | "error"

type RuntimeEnvContractIssue = {
  capability: RuntimeEnvCapability;
  envVars: string[];
  severity: "warning" | "error";
  message: string;
}

type RuntimeEnvCapability = | "publicBrowserConfig"
| "serverReadConfig"
| "serverWriteConfig"
| "authConfig"
| "diagnosticsConfig"
| "publicationConfig"

export type PublicBrowserRuntimeConfig = {
  convexUrl: string;
  sourceEnvVar: "NEXT_PUBLIC_CONVEX_URL" | "VITE_CONVEX_URL" | null;
};

type ServerReadRuntimeConfig = {
  convexUrl: string | null;
  sourceEnvVar: ConvexRuntimeTargetMatrix["publicServerRead"]["sourceEnvVar"];
}

type ServerWriteRuntimeConfig = {
  convexUrl: string | null;
  convexUrlSourceEnvVar: ConvexRuntimeTargetMatrix["privilegedWrite"]["sourceEnvVar"];
  adminKeyConfigured: boolean;
}

type AuthRuntimeConfig = {
  policy: AuthRuntimePolicy;
}

export type DiagnosticsRuntimeConfig = {
  testEnvRouteEnabledInProduction: boolean;
  rateLimitConfigured: boolean;
};

export type RuntimeEnvContract = {
  profile: RuntimeDeploymentProfile;
  publicBrowserConfig: PublicBrowserRuntimeConfig;
  serverReadConfig: ServerReadRuntimeConfig;
  serverWriteConfig: ServerWriteRuntimeConfig;
  authConfig: AuthRuntimeConfig;
  diagnosticsConfig: DiagnosticsRuntimeConfig;
  diagnostics: {
    status: RuntimeEnvContractStatus;
    reportOnly: boolean;
    issues: RuntimeEnvContractIssue[];
    convexTargets: ConvexRuntimeTargetMatrix;
  };
};

function hasValue(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function getProfile(env: RuntimeEnv): RuntimeDeploymentProfile {
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

function getPublicBrowserConfig(env: RuntimeEnv): PublicBrowserRuntimeConfig {
  if (hasValue(env.NEXT_PUBLIC_CONVEX_URL)) {
    return {
      convexUrl: env.NEXT_PUBLIC_CONVEX_URL,
      sourceEnvVar: "NEXT_PUBLIC_CONVEX_URL",
    };
  }

  if (hasValue(env.VITE_CONVEX_URL)) {
    return {
      convexUrl: env.VITE_CONVEX_URL,
      sourceEnvVar: "VITE_CONVEX_URL",
    };
  }

  return {
    convexUrl: "",
    sourceEnvVar: null,
  };
}

function getDiagnosticsConfig(env: RuntimeEnv, profile: RuntimeDeploymentProfile): DiagnosticsRuntimeConfig {
  return {
    testEnvRouteEnabledInProduction: profile === "production" && env.ENABLE_TEST_ENV === "true",
    rateLimitConfigured: hasValue(env.UPSTASH_REDIS_REST_URL) && hasValue(env.UPSTASH_REDIS_REST_TOKEN),
  };
}

function issue(
  capability: RuntimeEnvCapability,
  envVars: string[],
  severity: RuntimeEnvContractIssue["severity"],
  message: string,
): RuntimeEnvContractIssue {
  return {
    capability,
    envVars,
    severity,
    message,
  };
}

function buildIssues({
  authPolicy,
  convexTargets,
  diagnosticsConfig,
  env,
  profile,
  publicBrowserConfig,
  serverWriteConfig,
}: {
  authPolicy: AuthRuntimePolicy;
  convexTargets: ConvexRuntimeTargetMatrix;
  diagnosticsConfig: DiagnosticsRuntimeConfig;
  env: RuntimeEnv;
  profile: RuntimeDeploymentProfile;
  publicBrowserConfig: PublicBrowserRuntimeConfig;
  serverWriteConfig: ServerWriteRuntimeConfig;
}): RuntimeEnvContractIssue[] {
  const issues: RuntimeEnvContractIssue[] = [];

  if (!publicBrowserConfig.sourceEnvVar) {
    issues.push(
      issue(
        "publicBrowserConfig",
        ["NEXT_PUBLIC_CONVEX_URL", "VITE_CONVEX_URL"],
        "error",
        "Missing browser Convex URL for the /dev shell.",
      ),
    );
  }

  if (!convexTargets.publicServerRead.selectedUrl) {
    issues.push(
      issue(
        "serverReadConfig",
        ["CONVEX_PUBLIC_READ_URL", "CONVEX_URL", "VITE_CONVEX_URL", "NEXT_PUBLIC_CONVEX_URL"],
        "error",
        "Missing Convex URL for public server reads.",
      ),
    );
  }

  if (!serverWriteConfig.convexUrl) {
    issues.push(
      issue(
        "serverWriteConfig",
        ["CONVEX_URL", "VITE_CONVEX_URL", "NEXT_PUBLIC_CONVEX_URL"],
        "error",
        "Missing Convex URL for privileged server writes.",
      ),
    );
  }

  if (!serverWriteConfig.adminKeyConfigured) {
    issues.push(
      issue(
        "serverWriteConfig",
        ["CONVEX_ADMIN_KEY"],
        "error",
        "Missing CONVEX_ADMIN_KEY for protected editor writes.",
      ),
    );
  }

  for (const warning of convexTargets.publicServerRead.compatibility.warnings) {
    issues.push(issue("serverReadConfig", ["CONVEX_PUBLIC_READ_URL"], "warning", warning));
  }

  for (const warning of convexTargets.privilegedWrite.compatibility.warnings) {
    issues.push(
      issue(
        "serverWriteConfig",
        ["CONVEX_URL", "VITE_CONVEX_URL", "NEXT_PUBLIC_CONVEX_URL"],
        "warning",
        warning,
      ),
    );
  }

  // A half-configured pair is the silent case: writes commit, the editor
  // refreshes itself, and the public deployments keep serving the old revision
  // with nothing in the response that looks like a failure.
  const publicationTargets = getPublicationTargets(env);
  const publicationSecret = getPublicationSecret(env);
  if (publicationTargets.length > 0 && !publicationSecret) {
    issues.push(
      issue(
        "publicationConfig",
        [PUBLICATION_TARGETS_ENV, PUBLICATION_SECRET_ENV],
        "warning",
        "Public cache targets are configured without a signing secret; editorial writes will not reach the public deployments.",
      ),
    );
  }

  for (const restriction of authPolicy.restrictions) {
    issues.push(issue("authConfig", authPolicy.requiredSecrets, "warning", restriction));
  }

  if (profile !== "local" && authPolicy.requiredSecrets.length > 0) {
    issues.push(
      issue(
        "authConfig",
        authPolicy.requiredSecrets,
        "error",
        `Missing required ${profile} auth configuration: ${authPolicy.requiredSecrets.join(", ")}.`,
      ),
    );
  }

  if (diagnosticsConfig.testEnvRouteEnabledInProduction) {
    issues.push(
      issue(
        "diagnosticsConfig",
        ["ENABLE_TEST_ENV"],
        "warning",
        "ENABLE_TEST_ENV exposes the test environment diagnostic route in production.",
      ),
    );
  }

  return issues;
}

function getStatus(issues: RuntimeEnvContractIssue[]): RuntimeEnvContractStatus {
  if (issues.some((candidate) => candidate.severity === "error")) {
    return "error";
  }

  if (issues.length > 0) {
    return "warning";
  }

  return "ok";
}

export function resolveRuntimeEnvContract(
  env: RuntimeEnv = process.env,
  options: { reportOnly?: boolean } = {},
): RuntimeEnvContract {
  const reportOnly = options.reportOnly ?? true;
  const profile = getProfile(env);
  const convexTargets = getConvexRuntimeTargetMatrix(env);
  const publicBrowserConfig = getPublicBrowserConfig(env);
  const serverReadConfig: ServerReadRuntimeConfig = {
    convexUrl: convexTargets.publicServerRead.selectedUrl,
    sourceEnvVar: convexTargets.publicServerRead.sourceEnvVar,
  };
  const serverWriteConfig: ServerWriteRuntimeConfig = {
    convexUrl: convexTargets.privilegedWrite.selectedUrl,
    convexUrlSourceEnvVar: convexTargets.privilegedWrite.sourceEnvVar,
    adminKeyConfigured: convexTargets.adminKeyConfigured,
  };
  const authPolicy = resolveAuthRuntimePolicy(env);
  const diagnosticsConfig = getDiagnosticsConfig(env, profile);
  const issues = buildIssues({
    authPolicy,
    convexTargets,
    diagnosticsConfig,
    env,
    profile,
    publicBrowserConfig,
    serverWriteConfig,
  });

  return {
    profile,
    publicBrowserConfig,
    serverReadConfig,
    serverWriteConfig,
    authConfig: {
      policy: authPolicy,
    },
    diagnosticsConfig,
    diagnostics: {
      status: getStatus(issues),
      reportOnly,
      issues,
      convexTargets,
    },
  };
}

export function getPublicBrowserRuntimeConfig(env: RuntimeEnv = process.env): PublicBrowserRuntimeConfig {
  return resolveRuntimeEnvContract(env).publicBrowserConfig;
}

export function getServerReadRuntimeConfig(env: RuntimeEnv = process.env): ServerReadRuntimeConfig {
  return resolveRuntimeEnvContract(env).serverReadConfig;
}

export function getServerWriteRuntimeConfig(env: RuntimeEnv = process.env): ServerWriteRuntimeConfig {
  return resolveRuntimeEnvContract(env).serverWriteConfig;
}

export function getAuthRuntimeConfig(env: RuntimeEnv = process.env): AuthRuntimeConfig {
  return resolveRuntimeEnvContract(env).authConfig;
}

export function getDiagnosticsRuntimeConfig(env: RuntimeEnv = process.env): DiagnosticsRuntimeConfig {
  return resolveRuntimeEnvContract(env).diagnosticsConfig;
}

export function runRuntimeEnvPreflight(
  env: RuntimeEnv = process.env,
  options: { reportOnly?: boolean } = {},
): RuntimeEnvContract["diagnostics"] {
  return resolveRuntimeEnvContract(env, options).diagnostics;
}
