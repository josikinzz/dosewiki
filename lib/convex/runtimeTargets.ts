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
  editorTargetAlignment: ConvexEditorTargetAlignment;
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

/**
 * The subdomain label of a Convex deployment URL — `glad-minnow-656` from
 * `https://glad-minnow-656.convex.cloud`.
 *
 * Deployment names are safe to show a signed-in editor; full privileged URLs
 * are not, so every surface that reports an alignment problem names the
 * deployment and never echoes the URL it came from.
 */
export function getConvexDeploymentName(url: string | null | undefined): string | null {
  if (!hasNonEmptyValue(url)) {
    return null;
  }

  try {
    const host = new URL(url.trim()).hostname;
    const label = host.split(".")[0];
    return label.length > 0 ? label : host;
  } catch {
    return null;
  }
}

export type ConvexEditorTargetAlignmentStatus =
  /** Browser reads and privileged writes resolve to the same deployment. */
  | "aligned"
  /** They resolve to different deployments. Every write lands on the wrong data. */
  | "split"
  /**
   * No privileged write target at all — the intended posture of the read-only
   * publication deployment (Effect Index). Not a split.
   */
  | "no-write-target"
  /** No browser read target; the surface cannot load. Handled elsewhere. */
  | "no-read-target";

export type ConvexEditorTargetSide = {
  deploymentName: string | null;
  sourceEnvVar: ConvexRuntimeSourceEnvVar | null;
};

export type ConvexEditorTargetAlignment = {
  status: ConvexEditorTargetAlignmentStatus;
  read: ConvexEditorTargetSide;
  write: ConvexEditorTargetSide;
  /** True when the operator has explicitly opted into running on a split. */
  overrideAcknowledged: boolean;
  /** One line, safe to render. Contains deployment names, never URLs or keys. */
  summary: string;
};

/**
 * Set to `1`/`true` to downgrade a split from a refusal to a persistent banner.
 * Deliberately awkward: it exists so a misconfigured local checkout is never
 * bricked, not so a split can be normalised.
 */
export const CONVEX_TARGET_SPLIT_OVERRIDE_ENV_VAR = "CONVEX_ALLOW_TARGET_SPLIT";

function isOverrideAcknowledged(env: RuntimeEnv): boolean {
  const raw = env[CONVEX_TARGET_SPLIT_OVERRIDE_ENV_VAR];
  if (!hasNonEmptyValue(raw)) {
    return false;
  }

  const normalized = raw.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function describeSide(side: ConvexEditorTargetSide): string {
  const name = side.deploymentName ?? "(unrecognised Convex URL)";
  return side.sourceEnvVar ? `${name} (via ${side.sourceEnvVar})` : name;
}

/**
 * Compare the deployment the editor's browser client reads from against the
 * deployment privileged server writes land on.
 *
 * These resolve from different, overlapping env-var chains
 * (`NEXT_PUBLIC_CONVEX_URL` → `VITE_CONVEX_URL` for reads;
 * `CONVEX_URL` → `VITE_CONVEX_URL` → `NEXT_PUBLIC_CONVEX_URL` for writes), so a
 * host can legitimately end up reading production while writing dev. Under that
 * split every optimistic-concurrency write fails as a bogus "changed since you
 * loaded it" conflict, and the full editor save — which has no such check —
 * silently writes the wrong deployment.
 *
 * Server-side only in practice: the write URL must never reach the browser, so
 * only the resolved deployment *names* in the result are safe to render.
 */
export function getEditorTargetAlignment(
  env: RuntimeEnv = getRuntimeEnv(),
): ConvexEditorTargetAlignment {
  const readTarget = getEditorBrowserReadTarget(env);
  const writeTarget = getPrivilegedWriteTarget(env);

  const read: ConvexEditorTargetSide = {
    deploymentName: getConvexDeploymentName(readTarget.selectedUrl),
    sourceEnvVar: readTarget.sourceEnvVar,
  };
  const write: ConvexEditorTargetSide = {
    deploymentName: getConvexDeploymentName(writeTarget.selectedUrl),
    sourceEnvVar: writeTarget.sourceEnvVar,
  };
  const overrideAcknowledged = isOverrideAcknowledged(env);

  if (!writeTarget.selectedUrl) {
    return {
      status: "no-write-target",
      read,
      write,
      overrideAcknowledged,
      summary:
        "No privileged Convex write target is configured. This deployment is read-only, which is a valid posture.",
    };
  }

  if (!readTarget.selectedUrl) {
    return {
      status: "no-read-target",
      read,
      write,
      overrideAcknowledged,
      summary:
        "No browser Convex read target is configured. Set NEXT_PUBLIC_CONVEX_URL for the editor surfaces.",
    };
  }

  // Compare deployment names when both parse; fall back to the raw values so an
  // unparsable URL cannot quietly read as "aligned".
  const sameDeployment =
    read.deploymentName !== null && write.deploymentName !== null
      ? read.deploymentName === write.deploymentName
      : readTarget.selectedUrl.trim() === writeTarget.selectedUrl.trim();

  if (sameDeployment) {
    return {
      status: "aligned",
      read,
      write,
      overrideAcknowledged,
      summary: `Editor reads and privileged writes both target ${describeSide(read)}.`,
    };
  }

  return {
    status: "split",
    read,
    write,
    overrideAcknowledged,
    summary:
      `Editor reads target ${describeSide(read)} but privileged writes target ${describeSide(write)}. ` +
      "Every save would be written to the deployment you are not looking at.",
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
    editorTargetAlignment: getEditorTargetAlignment(env),
  };
}
