import type { ServerDataWriteHealth } from "../data/serverWriteHealth";
import type { RuntimeEnvContract } from "./envContract";

export type DiagnosticsAudience =
  | "public-not-found"
  | "authenticated-viewer"
  | "editor"
  | "admin"
  | "local-developer"
  | "build-preflight";

type DiagnosticIssueSeverity = "info" | "warning" | "error"

type DiagnosticDisclosureIssue = {
  severity: DiagnosticIssueSeverity;
  message: string;
  capability?: string;
  envVars?: string[];
}

type DiagnosticKeyPresenceFact = {
  name: string;
  configured: boolean;
  sensitive?: boolean;
}

export type DiagnosticDisclosureFacts = {
  now: Date;
  production: boolean;
  testEnvRouteEnabledInProduction: boolean;
  keyPresence?: DiagnosticKeyPresenceFact[];
  dataWriteHealth?: ServerDataWriteHealth;
  runtimeEnv?: RuntimeEnvContract["diagnostics"];
};

export type DiagnosticDisclosureView = {
  ok: boolean;
  audience: DiagnosticsAudience;
  available: boolean;
  status: "not-found" | "healthy" | "unhealthy" | "warning" | "error";
  canSaveToPostgres?: boolean;
  dataAdminKeyConfigured?: boolean;
  postgresUrlConfigured?: boolean;
  keysFound?: number;
  totalKeys?: number;
  keyNames?: string[];
  issues: string[];
  issueDetails?: DiagnosticDisclosureIssue[];
  diagnostics?: {
    warnings?: string[];
    targets?: ServerDataWriteHealth["diagnostics"]["targets"];
    runtimeEnv?: Omit<RuntimeEnvContract["diagnostics"], "issues"> & {
      issues: DiagnosticDisclosureIssue[];
    };
  };
  checkedAt?: string;
  timestamp?: string;
};

const SECRET_NAME_AUDIENCES = new Set<DiagnosticsAudience>([
  "admin",
  "local-developer",
  "build-preflight",
]);

const DETAILED_DIAGNOSTICS_AUDIENCES = new Set<DiagnosticsAudience>([
  "editor",
  "admin",
  "local-developer",
  "build-preflight",
]);

function issueSeverity(issues: DiagnosticDisclosureIssue[]): DiagnosticDisclosureView["status"] {
  if (issues.some((issue) => issue.severity === "error")) {
    return "error";
  }

  if (issues.some((issue) => issue.severity === "warning")) {
    return "warning";
  }

  return "healthy";
}

function redactRuntimeIssue(
  issue: RuntimeEnvContract["diagnostics"]["issues"][number],
  audience: DiagnosticsAudience,
): DiagnosticDisclosureIssue {
  const redacted: DiagnosticDisclosureIssue = {
    severity: issue.severity,
    capability: issue.capability,
    message: issue.message,
  };

  if (SECRET_NAME_AUDIENCES.has(audience)) {
    redacted.envVars = issue.envVars;
  }

  return redacted;
}

function dataIssues(health: ServerDataWriteHealth | undefined): DiagnosticDisclosureIssue[] {
  if (!health) {
    return [];
  }

  return health.issues.map((message) => ({
    severity: "error",
    capability: "serverWriteConfig",
    message,
  }));
}

function runtimeIssues(
  runtimeEnv: RuntimeEnvContract["diagnostics"] | undefined,
  audience: DiagnosticsAudience,
): DiagnosticDisclosureIssue[] {
  return runtimeEnv?.issues.map((issue) => redactRuntimeIssue(issue, audience)) ?? [];
}

function redactRuntimeEnvDiagnostics(
  runtimeEnv: RuntimeEnvContract["diagnostics"] | undefined,
  audience: DiagnosticsAudience,
): NonNullable<DiagnosticDisclosureView["diagnostics"]>["runtimeEnv"] | undefined {
  if (!runtimeEnv) {
    return undefined;
  }

  return {
    ...runtimeEnv,
    issues: runtimeIssues(runtimeEnv, audience),
  };
}

function productionGateAllows(audience: DiagnosticsAudience, facts: DiagnosticDisclosureFacts): boolean {
  if (audience === "public-not-found") {
    return false;
  }

  return !facts.production || audience !== "local-developer";
}

function keyCounts(facts: DiagnosticDisclosureFacts) {
  const keys = facts.keyPresence ?? [];
  return {
    keysFound: keys.filter((key) => key.configured).length,
    totalKeys: keys.length,
  };
}

export function createDiagnosticsDisclosureView(
  audience: DiagnosticsAudience,
  facts: DiagnosticDisclosureFacts,
): DiagnosticDisclosureView {
  const checkedAt = facts.now.toISOString();
  const available = productionGateAllows(audience, facts);

  if (!available) {
    return {
      ok: false,
      audience,
      available: false,
      status: "not-found",
      issues: [],
      checkedAt,
      timestamp: checkedAt,
    };
  }

  const dataHealth = facts.dataWriteHealth;
  const issueDetails = [
    ...dataIssues(dataHealth),
    ...runtimeIssues(facts.runtimeEnv, audience),
  ];
  const visibleIssues = dataHealth ? dataHealth.issues : issueDetails.map((issue) => issue.message);
  const status = audience === "build-preflight"
    ? issueDetails.length > 0
      ? issueSeverity(issueDetails)
      : "healthy"
    : dataHealth
    ? dataHealth.canSaveToPostgres
      ? "healthy"
      : "unhealthy"
    : issueDetails.length > 0
      ? issueSeverity(issueDetails)
      : "healthy";
  const view: DiagnosticDisclosureView = {
    ok: status !== "error" && status !== "unhealthy",
    audience,
    available: true,
    status,
    issues: visibleIssues,
    checkedAt,
    timestamp: checkedAt,
  };

  if (dataHealth) {
    view.canSaveToPostgres = dataHealth.canSaveToPostgres;
    view.dataAdminKeyConfigured = dataHealth.adminKeyConfigured;
    view.postgresUrlConfigured = dataHealth.postgresUrlConfigured;
  }

  if (facts.keyPresence) {
    Object.assign(view, keyCounts(facts));
  }

  if (facts.keyPresence && SECRET_NAME_AUDIENCES.has(audience)) {
    view.keyNames = facts.keyPresence.map((key) => key.name);
  }

  if (issueDetails.length > 0 && DETAILED_DIAGNOSTICS_AUDIENCES.has(audience)) {
    view.issueDetails = issueDetails;
  }

  if (dataHealth && DETAILED_DIAGNOSTICS_AUDIENCES.has(audience)) {
    view.diagnostics = {
      warnings: dataHealth.diagnostics.warnings,
      targets: dataHealth.diagnostics.targets,
      runtimeEnv: redactRuntimeEnvDiagnostics(facts.runtimeEnv, audience),
    };
  }

  return view;
}
