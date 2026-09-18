import { verifyProfileAvatarForImport } from "../../lib/runtime/r2MediaStorage.ts";

/** Fresh storage evidence is transport-only, never part of a pinned profile plan or ledger. */
export async function withVerifiedProfileAvatars<T extends { entries: readonly unknown[]; actorEmail?: string }>(
  payload: T,
  targetIdentity: string,
): Promise<T & { avatarR2Receipts: Record<string, string> }> {
  const avatarR2Receipts: Record<string, string> = {};
  const actorEmail = payload.actorEmail?.trim().toLowerCase() || "system@dosewiki.internal";
  for (const raw of payload.entries) {
    const entry = raw as {
      outcome?: string;
      profile?: { key?: string; avatarR2Key?: string | null };
      expected?: { avatarR2Key?: string | null };
    };
    const profile = entry.profile;
    if (!profile?.avatarR2Key) continue;
    if (entry.outcome === "existing-profile" && entry.expected?.avatarR2Key === profile.avatarR2Key) continue;
    if (!profile.key) throw new Error("An R2 avatar import requires an exact profile key.");
    const key = profile.key.trim().toUpperCase();
    avatarR2Receipts[key] = await verifyProfileAvatarForImport(profile.avatarR2Key, key, actorEmail, targetIdentity);
  }
  return { ...payload, avatarR2Receipts };
}
