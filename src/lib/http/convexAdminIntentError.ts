import type { AdminIntent } from "../../../convex/lib/adminIntentTokens";

/**
 * Decide whether a failed Convex call failed because of the credential.
 *
 * Convex does not send the reason to the caller: a rejected admin token and a
 * genuine bug both arrive as `Error: [Request ID: …] Server Error`, with the
 * `AuthError` left in the deployment's own logs. Sniffing the message therefore
 * cannot work — so this asks the deployment directly, replaying the same token
 * against a trivial query. If that is also rejected, the credential is the
 * fault; if it succeeds, the original error is real and must keep its own
 * message.
 *
 * The probe only ever runs on a path that has already failed, so the healthy
 * path pays nothing.
 */
export async function diagnoseConvexAdminCredential({
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
      `Convex rejected this app's admin credential for the "${intent}" intent, so the deployment ` +
      `refused the request. Run \`npm run convex:doctor\` to compare token fingerprints, then copy ` +
      `the deployment's own value into .env.local — see docs/agents/convex-credentials.md.`
    );
  }
}
