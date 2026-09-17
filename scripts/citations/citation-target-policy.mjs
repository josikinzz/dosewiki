import { isPostgresTargetExplicit, postgresFingerprintFromUrl } from "../lib/data-client.ts";

export function assertCitationSourceIdentity(value) {
  if (typeof value !== "string" || !value.includes("/")) {
    throw new Error("Citation source must be a credential-free Postgres host/database identity.");
  }
  const separator = value.indexOf("/");
  const host = value.slice(0, separator);
  const database = value.slice(separator + 1);
  try {
    const urlHost = host.includes(":") ? `[${host}]` : host;
    if (!host || !database || /[@/?#\s]/.test(host)
        || postgresFingerprintFromUrl(`postgres://${urlHost}/${encodeURIComponent(database)}`) !== value) {
      throw new Error();
    }
  } catch {
    throw new Error("Citation source must be a credential-free Postgres host/database identity.");
  }
  return value;
}

export function assertExplicitCitationPromotionTarget(context) {
  if (context?.backend !== "postgres") {
    throw new Error("Citation promotion requires DATA_BACKEND=postgres; no other backend is a promotion target.");
  }
  if (!context?.targetUrl) {
    throw new Error("Citation promotion requires --target or TARGET_POSTGRES_URL.");
  }
  if (!isPostgresTargetExplicit(context.targetUrlKey)) {
    throw new Error("Citation promotion requires --target or TARGET_POSTGRES_URL; application fallback targets are not allowed.");
  }
  const fingerprint = postgresFingerprintFromUrl(context.targetUrl);
  if (!fingerprint || fingerprint !== context.deploymentFingerprint) {
    throw new Error("Citation promotion requires a valid PostgreSQL target with a matching deployment fingerprint.");
  }
  if (!context.expectedDeployment) {
    throw new Error(`Citation promotion dry-runs and writes require --expected-deployment=${context.deploymentFingerprint}.`);
  }
  if (context.expectedDeployment !== context.deploymentFingerprint) {
    throw new Error(
      `Expected deployment ${context.expectedDeployment} does not match citation target ${context.deploymentFingerprint}.`,
    );
  }
  return context.targetUrl;
}
