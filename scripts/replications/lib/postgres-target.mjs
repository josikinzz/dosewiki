import { postgresFingerprintFromUrl } from "../../lib/data-client.ts";

/** Historical source pins never authorize a live database connection. */
export function requireCampaignTarget(command) {
  const identity = postgresFingerprintFromUrl(command.targetUrl);
  if (!identity || !["--target", "TARGET_POSTGRES_URL"].includes(command.targetSource)
    || command.expectedDeployment !== identity) {
    throw new Error("Campaign execution requires --target or TARGET_POSTGRES_URL and matching --expected-deployment=<host>/<database>.");
  }
  return identity;
}

export function bindCampaignTarget(ledger, identity) {
  if (ledger.postgresTarget && ledger.postgresTarget !== identity) {
    throw new Error("Campaign ledger belongs to another Postgres target.");
  }
  if (!ledger.postgresTarget && (ledger.canaryVerified || (ledger.completedIds?.length ?? 0) > 0 || Object.keys(ledger.completed ?? {}).length > 0 || Object.values(ledger.items ?? ledger.batches ?? ledger.rows ?? ledger.replications ?? {}).some((row) => row.verified || row.attempts > 0 || (row.status && !["pending", "planned"].includes(row.status))))) {
    throw new Error("Used campaign ledger has no Postgres target binding; use a fresh reviewed ledger.");
  }
  ledger.postgresTarget = identity;
  return ledger;
}
