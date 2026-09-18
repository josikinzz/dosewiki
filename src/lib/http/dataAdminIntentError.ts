import type { AdminIntent } from "../../../server/lib/adminIntentTokens";

/**
 * Decide whether a failed Postgres call failed because of the credential.
 *
 * An error message alone does not reliably establish whether a credential is
 * accepted. Replay the same token against a read: a rejected probe reports a
 * credential/configuration failure, while a successful probe leaves the
 * original error untouched.
 *
 * The probe only ever runs on a path that has already failed, so the healthy
 * path pays nothing.
 */
export async function diagnoseDataAdminCredential({
  intent,
  probe,
}: {
  intent: AdminIntent;
  /** Replays the exact token the caller sent; rejects when the deployment refuses it. */
  probe: () => Promise<unknown>;
}): Promise<string | null> {
  try {
    await probe();
    return null;
  } catch {
    return (
      `The server could not verify this app's credential for the "${intent}" intent. ` +
      `Check the scoped DATA_ADMIN_TOKEN value and Postgres connection configuration — ` +
      `see docs/operations/data-credentials.md.`
    );
  }
}
