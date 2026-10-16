import type { AdminIntent } from "../../../server/lib/adminIntentTokens";

export async function diagnoseDataAdminCredential({
  intent,
  probe,
}: {
  intent: AdminIntent;
  probe: () => Promise<unknown>;
}): Promise<string | null> {
  try {
    await probe();
    return null;
  } catch {
    return (
      `The server could not verify this app's credential for the "${intent}" intent. ` +
      `Check the scoped DATA_ADMIN_TOKEN value and Postgres connection configuration; ` +
      `see docs/operations/data-credentials.md.`
    );
  }
}
