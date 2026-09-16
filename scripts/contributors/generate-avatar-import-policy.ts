// Pure contributor-profile patch projection and diff policy.
import { buildImportedStoredProfile } from "../../server/lib/contributorProfiles";

export interface StoredContributorProfile {
  key: string;
  displayName: string;
  aliases?: string[];
  bio?: string;
  links?: Array<{ label: string; url: string }>;
  role?: string;
  avatarStorageId?: string;
  avatarUrl?: string | null;
  membershipEmail?: string;
  createdAt?: string;
  updatedAt?: string;
  updatedBy?: string;
}

/** Exactly the shape `bulkImportProfileValidator` accepts. */
export type ContributorImportRow = {
  key: string;
  displayName: string;
  aliases: string[];
  bio: string;
  links: Array<{ label: string; url: string }>;
  avatarUrl: string;
  role?: string;
  avatarStorageId?: string;
  membershipEmail?: string;
  createdAt?: string;
  updatedAt?: string;
  updatedBy?: string;
};
/**
 * The one field this script is allowed to change, merged onto the raw stored row.
 *
 * `bulkImport` patches every field it is handed, and silently defaults the ones
 * it is not: an omitted `createdAt` becomes now, an omitted `updatedBy` becomes
 * `system@dosewiki.internal`, an omitted `updatedAt` becomes now. Every field
 * including those three is therefore restated from the live row verbatim, so the
 * stored document differs in `avatarUrl` and in nothing else at all.
 */
export function avatarOnlyImportRow(
  stored: StoredContributorProfile,
  avatarUrl: string,
): ContributorImportRow {
  const row: ContributorImportRow = {
    key: stored.key,
    displayName: stored.displayName,
    aliases: stored.aliases ?? [],
    // Required by the validator even when empty.
    bio: stored.bio ?? "",
    links: stored.links ?? [],
    avatarUrl,
  };

  if (stored.role) row.role = stored.role;
  if (stored.avatarStorageId) row.avatarStorageId = stored.avatarStorageId;
  if (stored.membershipEmail) row.membershipEmail = stored.membershipEmail;
  if (stored.createdAt) row.createdAt = stored.createdAt;
  if (stored.updatedAt) row.updatedAt = stored.updatedAt;
  if (stored.updatedBy) row.updatedBy = stored.updatedBy;

  return row;
}

/**
 * What `bulkImport` would change about a stored row, field by field.
 *
 * The comparison is against `buildImportedStoredProfile` — the mutation's own
 * transform — rather than against the request, because the two are not the same
 * document. The mutation reshapes everything it is handed on the way in
 * (`sanitizeAliases` lowercases and dedupes, `sanitizeLinks` drops any non-HTTPS
 * link and keeps three, `sanitizeRole` collapses whitespace), so a row that
 * echoes a stored value back verbatim can still store something different. Only
 * a diff of stored-against-projected can say "`avatarUrl` moved and nothing
 * else" and be right.
 */
export function projectedStoredProfile(row: ContributorImportRow) {
  return buildImportedStoredProfile(row);
}

export function importRowDiff(stored: object, row: object): string[] {
  const fields = [
    "key",
    "displayName",
    "aliases",
    "avatarStorageId",
    "avatarUrl",
    "bio",
    "role",
    "links",
    "membershipEmail",
    "createdAt",
    "updatedAt",
    "updatedBy",
  ];

  return fields.filter(
    (field) =>
      JSON.stringify(Reflect.get(stored, field) ?? null) !==
      JSON.stringify(Reflect.get(row, field) ?? null),
  );
}
