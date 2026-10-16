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
export function avatarOnlyImportRow(
  stored: StoredContributorProfile,
  avatarUrl: string,
): ContributorImportRow {
  const row: ContributorImportRow = {
    key: stored.key,
    displayName: stored.displayName,
    aliases: stored.aliases ?? [],
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
