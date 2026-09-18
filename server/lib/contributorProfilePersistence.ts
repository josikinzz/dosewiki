import type { MutationCtx, QueryCtx } from "../../lib/postgres/runtime/server"
import {
  normalizeProfileKey,
  sanitizeAliases,
  type StoredProfile,
} from "./contributorProfiles";

export async function getStoredContributorProfile(
  ctx: QueryCtx | MutationCtx,
  key: string,
) {
  return await ctx.db
    .query("contributorProfiles")
    .withIndex("by_key", (query) => query.eq("key", normalizeProfileKey(key)))
    .first();
}

export function attributionAliasesForProfile(
  existingProfile: StoredProfile | null,
  requestedAliases: string[] = [],
): string[] {
  return sanitizeAliases([
    ...(existingProfile?.aliases ?? []),
    ...(existingProfile?.displayName ? [existingProfile.displayName] : []),
    existingProfile?.key?.toLowerCase() ?? "",
    ...requestedAliases,
  ]);
}

export function contributorProfileRevalidationKeys(
  profileKey: string,
  aliases: readonly string[] | undefined,
): string[] {
  return sanitizeAliases([profileKey, ...(aliases ?? [])]).map((key) =>
    normalizeProfileKey(key),
  );
}

export async function patchReportsForContributorKey(
  ctx: MutationCtx,
  authorNames: string[],
  contributorKey: string,
  embeddedAuthorName?: string,
): Promise<number> {
  const acceptedNames = new Set(
    authorNames.map((name) => name.trim().toLowerCase()).filter(Boolean),
  );
  const normalizedContributorKey = normalizeProfileKey(contributorKey);
  const allReports = await ctx.db.query("tripReports").collect();
  let updated = 0;

  for (const report of allReports) {
    const subjectName = report.subject.name.trim().toLowerCase();
    const matchesAuthor = acceptedNames.has(subjectName);
    const matchesContributorKey = report.subject.profile_key === normalizedContributorKey;

    if (!matchesAuthor && !matchesContributorKey) {
      continue;
    }

    await ctx.db.patch(report._id, {
      subject: {
        ...report.subject,
        name: embeddedAuthorName ?? report.subject.name,
        profile_key: normalizedContributorKey,
      },
    });
    updated += 1;
  }

  return updated;
}
