import { parsePostgresTarget, resolveRuntimePostgresTarget, type RuntimeEnv } from "../postgres/runtime/target";

type DataRuntimeCapability = "publicServerRead" | "editorBrowserRead" | "privilegedWrite" | "authMembership";
type DataRuntimeSourceEnvVar = "POSTGRES_POOLED_URL" | "POSTGRES_DIRECT_URL";

export type DataRuntimeTarget = {
  capability: DataRuntimeCapability;
  /** Redacted diagnostic URL, never a connection string. */
  selectedUrl: string | null;
  sourceEnvVar: DataRuntimeSourceEnvVar | null;
  browserSafe: boolean;
  compatibility: { allowed: boolean; issues: string[]; warnings: string[] };
};

export type DataRuntimeTargetMatrix = Record<DataRuntimeCapability, DataRuntimeTarget> & {
  backend: "postgres";
  adminKeyConfigured: boolean;
  editorTargetAlignment: DataEditorTargetAlignment;
};

type DataEditorTargetSide = {
  deploymentName: string | null;
  sourceEnvVar: DataRuntimeSourceEnvVar | null;
};

export type DataEditorTargetAlignment = {
  status: "aligned" | "split";
  read: DataEditorTargetSide;
  write: DataEditorTargetSide;
  summary: string;
};

function buildTarget(capability: DataRuntimeCapability, env: RuntimeEnv): DataRuntimeTarget {
  try {
    const target = resolveRuntimePostgresTarget(env);
    return {
      capability,
      selectedUrl: target.displayUrl,
      sourceEnvVar: target.sourceEnvVar,
      // Browser reads use the same-origin API, not a database connection.
      browserSafe: capability === "editorBrowserRead",
      compatibility: { allowed: true, issues: [], warnings: [] },
    };
  } catch (error) {
    return {
      capability,
      selectedUrl: null,
      sourceEnvVar: null,
      browserSafe: capability === "editorBrowserRead",
      compatibility: { allowed: false, issues: [error instanceof Error ? error.message : "Invalid Postgres target."], warnings: [] },
    };
  }
}

export function getDataDeploymentName(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return parsePostgresTarget(url).identity;
  } catch {
    return null;
  }
}

export function getEditorTargetAlignment(env: RuntimeEnv = process.env): DataEditorTargetAlignment {
  const target = buildTarget("privilegedWrite", env);
  const side = { deploymentName: getDataDeploymentName(target.selectedUrl), sourceEnvVar: target.sourceEnvVar };
  return {
    // Invalid configuration must refuse the editor rather than pretending to be a read-only deployment.
    status: target.compatibility.allowed ? "aligned" : "split",
    read: side,
    write: side,
    summary: target.compatibility.allowed
      ? `Editor reads and privileged writes both target Postgres ${side.deploymentName}.`
      : target.compatibility.issues.join(" "),
  };
}

export function getPublicServerReadTarget(env: RuntimeEnv = process.env): DataRuntimeTarget {
  return buildTarget("publicServerRead", env);
}

export function getEditorBrowserReadTarget(env: RuntimeEnv = process.env): DataRuntimeTarget {
  return buildTarget("editorBrowserRead", env);
}

export function getPrivilegedWriteTarget(env: RuntimeEnv = process.env): DataRuntimeTarget {
  return buildTarget("privilegedWrite", env);
}

export function getAuthMembershipTarget(env: RuntimeEnv = process.env): DataRuntimeTarget {
  return buildTarget("authMembership", env);
}

export function getDataRuntimeTargetMatrix(env: RuntimeEnv = process.env): DataRuntimeTargetMatrix {
  return {
    backend: "postgres",
    publicServerRead: getPublicServerReadTarget(env),
    editorBrowserRead: getEditorBrowserReadTarget(env),
    privilegedWrite: getPrivilegedWriteTarget(env),
    authMembership: getAuthMembershipTarget(env),
    adminKeyConfigured: Boolean(env.DATA_ADMIN_KEY?.trim()),
    editorTargetAlignment: getEditorTargetAlignment(env),
  };
}
