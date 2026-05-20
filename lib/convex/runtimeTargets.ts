export type ConvexRuntimeCapability =
  | "publicServerRead"
  | "editorBrowserRead"
  | "privilegedWrite"
  | "authMembership";

export type ConvexRuntimeSourceEnvVar =
  | "CONVEX_PUBLIC_READ_URL"
  | "CONVEX_URL"
  | "VITE_CONVEX_URL"
  | "NEXT_PUBLIC_CONVEX_URL";

export type ConvexRuntimeTarget = {
  capability: ConvexRuntimeCapability;
  selectedUrl: string | null;
  sourceEnvVar: ConvexRuntimeSourceEnvVar | null;
  browserSafe: boolean;
  compatibility: {
    allowed: boolean;
    issues: string[];
    warnings: string[];
  };
};

export type ConvexRuntimeTargetMatrix = Record<ConvexRuntimeCapability, ConvexRuntimeTarget> & {
  adminKeyConfigured: boolean;
};

type RuntimeEnv = Record<string, string | undefined>;

const PUBLIC_SERVER_READ_PRECEDENCE: ConvexRuntimeSourceEnvVar[] = [
  "CONVEX_PUBLIC_READ_URL",
  "CONVEX_URL",
  "VITE_CONVEX_URL",
  "NEXT_PUBLIC_CONVEX_URL",
];

const EDITOR_BROWSER_READ_PRECEDENCE: ConvexRuntimeSourceEnvVar[] = [
  "NEXT_PUBLIC_CONVEX_URL",
  "VITE_CONVEX_URL",
];

const PRIVILEGED_WRITE_PRECEDENCE: ConvexRuntimeSourceEnvVar[] = [
  "CONVEX_URL",
  "VITE_CONVEX_URL",
  "NEXT_PUBLIC_CONVEX_URL",
];

function getRuntimeEnv(): RuntimeEnv {
  return typeof process === "undefined" ? {} : process.env;
}

function hasNonEmptyValue(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function selectUrl(
  env: RuntimeEnv,
  precedence: ConvexRuntimeSourceEnvVar[],
): Pick<ConvexRuntimeTarget, "selectedUrl" | "sourceEnvVar"> {
  for (const sourceEnvVar of precedence) {
    const value = env[sourceEnvVar];
    if (hasNonEmptyValue(value)) {
      return { selectedUrl: value, sourceEnvVar };
    }
  }

  return { selectedUrl: null, sourceEnvVar: null };
}

function isProductionDeployment(env: RuntimeEnv): boolean {
  return env.VERCEL_ENV === "production" || env.NODE_ENV === "production";
}

function buildTarget(
  capability: ConvexRuntimeCapability,
  selected: Pick<ConvexRuntimeTarget, "selectedUrl" | "sourceEnvVar">,
  browserSafe: boolean,
  env: RuntimeEnv,
): ConvexRuntimeTarget {
  const issues: string[] = [];
  const warnings: string[] = [];

  if (!selected.selectedUrl) {
    issues.push(`Missing Convex URL for ${capability}.`);
  }

  if (
    (capability === "privilegedWrite" || capability === "authMembership") &&
    selected.sourceEnvVar === "NEXT_PUBLIC_CONVEX_URL"
  ) {
    warnings.push(
      "Privileged Convex writes are falling back to NEXT_PUBLIC_CONVEX_URL. Set CONVEX_URL explicitly for server writes.",
    );

    if (isProductionDeployment(env)) {
      warnings.push(
        "Production privileged writes are using a browser-exposed Convex URL fallback in compatibility mode.",
      );
    }
  }

  if (capability === "publicServerRead" && selected.sourceEnvVar !== "CONVEX_PUBLIC_READ_URL") {
    warnings.push(
      "Public server reads are using the default Convex target. Set CONVEX_PUBLIC_READ_URL to intentionally mirror another deployment.",
    );
  }

  return {
    capability,
    selectedUrl: selected.selectedUrl,
    sourceEnvVar: selected.sourceEnvVar,
    browserSafe,
    compatibility: {
      allowed: issues.length === 0,
      issues,
      warnings,
    },
  };
}

export function getPublicServerReadTarget(env: RuntimeEnv = getRuntimeEnv()): ConvexRuntimeTarget {
  return buildTarget("publicServerRead", selectUrl(env, PUBLIC_SERVER_READ_PRECEDENCE), false, env);
}

export function getEditorBrowserReadTarget(env: RuntimeEnv = getRuntimeEnv()): ConvexRuntimeTarget {
  return buildTarget("editorBrowserRead", selectUrl(env, EDITOR_BROWSER_READ_PRECEDENCE), true, env);
}

export function getPrivilegedWriteTarget(env: RuntimeEnv = getRuntimeEnv()): ConvexRuntimeTarget {
  return buildTarget("privilegedWrite", selectUrl(env, PRIVILEGED_WRITE_PRECEDENCE), false, env);
}

export function getAuthMembershipTarget(env: RuntimeEnv = getRuntimeEnv()): ConvexRuntimeTarget {
  return buildTarget("authMembership", selectUrl(env, PRIVILEGED_WRITE_PRECEDENCE), false, env);
}

export function getConvexRuntimeTargetMatrix(env: RuntimeEnv = getRuntimeEnv()): ConvexRuntimeTargetMatrix {
  return {
    publicServerRead: getPublicServerReadTarget(env),
    editorBrowserRead: getEditorBrowserReadTarget(env),
    privilegedWrite: getPrivilegedWriteTarget(env),
    authMembership: getAuthMembershipTarget(env),
    adminKeyConfigured: hasNonEmptyValue(env.CONVEX_ADMIN_KEY),
  };
}
