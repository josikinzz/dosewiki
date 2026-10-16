import { msg } from "@/i18n/messages";
import { findProfileByAuthorNameInList, type NormalizedUserProfile } from "./userProfiles";
import {
  findContributorProfileByKeyOrAlias,
  normalizeProfileAlias,
  normalizeProfileKey,
} from "../../lib/contributorProfileIdentity";

export const EFFECT_INDEX_FOUNDER_KEY = "JOSIE";

export const EFFECT_INDEX_FOUNDER_ROLE_FALLBACK = msg("Founder");

export const EFFECT_INDEX_EXCLUDED_CONTRIBUTOR_KEYS: readonly string[] = [];

export const EFFECT_INDEX_STAFF_KEYS: readonly string[] = ["LYREA"];

export const EFFECT_INDEX_ROLE_OVERRIDES: Readonly<Record<string, string>> = {
  LYREA: "Administrator",
};

export function isRosterMember(entry: ContributorRosterEntry): boolean {
  return entry.profile.key.length > 0;
}

export const CURATED_FOUNDERS_SECTION_TITLE = msg("Founders & Contributors");

export const CONTRIBUTOR_ROSTER_SECTION_TITLE = msg("Founder & Contributors");

export const CONTRIBUTOR_ROSTER_ORDER_NOTE = msg(
  "Everyone who has contributed to the archive, ordered by the number of pages that credit them.",
);

type ContributorReferenceEffectInput = {
  readonly slug: string;
  readonly contributors?: readonly string[];
  readonly audio_replications?: readonly { readonly artist?: string }[];
}

type ContributorReferenceReplicationInput = {
  readonly effect_slug: string;
  readonly artist?: string;
}

type ContributorReferenceReportInput = {
  readonly slug: string;
  readonly author?: string;
  readonly authorProfileKey?: string;
}

type ContributorReferenceReviewedArticleInput = {
  readonly slug: string;
  readonly reviewerProfileKey: string;
}

export type ContributorReferenceInput = {
  readonly effects?: readonly ContributorReferenceEffectInput[];
  readonly replications?: readonly ContributorReferenceReplicationInput[];
  readonly reports?: readonly ContributorReferenceReportInput[];
  readonly reviewedArticles?: readonly ContributorReferenceReviewedArticleInput[];
};

export type ContributorReferencePage = {
  readonly id: string;
  readonly names: readonly string[];
  readonly profileKeys: readonly string[];
};

type MutablePage = {
  readonly id: string;
  readonly names: Set<string>;
  readonly profileKeys: Set<string>;
};

function addCredit(
  pages: Map<string, MutablePage>,
  id: string,
  credit: { name?: string | null; profileKey?: string | null },
): void {
  let page = pages.get(id);

  if (!page) {
    page = { id, names: new Set<string>(), profileKeys: new Set<string>() };
    pages.set(id, page);
  }

  const name = credit.name?.trim();
  if (name) {
    page.names.add(name);
  }

  const profileKey = credit.profileKey?.trim();
  if (profileKey) {
    page.profileKeys.add(profileKey);
  }
}

export function collectContributorReferencePages(
  input: ContributorReferenceInput,
): ContributorReferencePage[] {
  const pages = new Map<string, MutablePage>();

  for (const effect of input.effects ?? []) {
    const id = `effect:${effect.slug}`;
    addCredit(pages, id, {});

    for (const contributor of effect.contributors ?? []) {
      addCredit(pages, id, { name: contributor });
    }

    for (const audio of effect.audio_replications ?? []) {
      addCredit(pages, id, { name: audio.artist });
    }
  }

  for (const replication of input.replications ?? []) {
    addCredit(pages, `effect:${replication.effect_slug}`, { name: replication.artist });
  }

  for (const report of input.reports ?? []) {
    addCredit(pages, `report:${report.slug}`, {
      name: report.author,
      profileKey: report.authorProfileKey,
    });
  }

  for (const reviewed of input.reviewedArticles ?? []) {
    addCredit(pages, `substance:${reviewed.slug}`, { profileKey: reviewed.reviewerProfileKey });
  }

  return Array.from(pages.values(), (page) => ({
    id: page.id,
    names: Array.from(page.names),
    profileKeys: Array.from(page.profileKeys),
  }));
}

export function countContributorPageReferences(
  profiles: readonly NormalizedUserProfile[],
  pages: readonly ContributorReferencePage[],
): Map<string, number> {
  const counts = new Map<string, number>(profiles.map((profile) => [profile.key, 0]));

  const resolvedNames = new Map<string, string | null>();
  const resolvedKeys = new Map<string, string | null>();

  const resolveName = (name: string): string | null => {
    const cacheKey = normalizeProfileAlias(name);
    if (!cacheKey) {
      return null;
    }

    if (!resolvedNames.has(cacheKey)) {
      resolvedNames.set(cacheKey, findProfileByAuthorNameInList(profiles, name)?.key ?? null);
    }

    return resolvedNames.get(cacheKey) ?? null;
  };

  const resolveKey = (key: string): string | null => {
    const cacheKey = normalizeProfileKey(key);
    if (!cacheKey) {
      return null;
    }

    if (!resolvedKeys.has(cacheKey)) {
      resolvedKeys.set(cacheKey, findContributorProfileByKeyOrAlias(profiles, key)?.key ?? null);
    }

    return resolvedKeys.get(cacheKey) ?? null;
  };

  for (const page of pages) {
    const credited = new Set<string>();

    for (const profileKey of page.profileKeys) {
      const resolved = resolveKey(profileKey);
      if (resolved) {
        credited.add(resolved);
      }
    }

    for (const name of page.names) {
      const resolved = resolveName(name);
      if (resolved) {
        credited.add(resolved);
      }
    }

    for (const key of credited) {
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }

  return counts;
}

export function countContributorReferences(
  profiles: readonly NormalizedUserProfile[],
  input: ContributorReferenceInput,
): Map<string, number> {
  return countContributorPageReferences(profiles, collectContributorReferencePages(input));
}

export type ContributorRosterEntry = {
  readonly profile: NormalizedUserProfile;
  readonly referenceCount: number;
  readonly roleOverride?: string;
};

export type ContributorRoster = {
  readonly founder: ContributorRosterEntry | null;
  readonly staff: readonly ContributorRosterEntry[];
  readonly contributors: readonly ContributorRosterEntry[];
};

export type BuildContributorRosterInput = {
  readonly profiles: readonly NormalizedUserProfile[];
  readonly referenceCounts: ReadonlyMap<string, number>;
  readonly founderKey?: string;
  readonly staffKeys?: readonly string[];
  readonly roleOverrides?: Readonly<Record<string, string>>;
  readonly excludedKeys?: readonly string[];
};

function compareRosterEntries(left: ContributorRosterEntry, right: ContributorRosterEntry): number {
  if (left.referenceCount !== right.referenceCount) {
    return right.referenceCount - left.referenceCount;
  }

  const byName = left.profile.displayName.localeCompare(right.profile.displayName);
  if (byName !== 0) {
    return byName;
  }

  return left.profile.key.localeCompare(right.profile.key);
}

export function buildContributorRoster({
  profiles,
  referenceCounts,
  founderKey,
  staffKeys = [],
  roleOverrides = {},
  excludedKeys = [],
}: BuildContributorRosterInput): ContributorRoster {
  const excluded = new Set(excludedKeys.map((key) => normalizeProfileKey(key)).filter(Boolean));
  const normalizedFounderKey = normalizeProfileKey(founderKey ?? "");
  const staffKeySet = new Set(staffKeys.map((key) => normalizeProfileKey(key)).filter(Boolean));
  const overridesByKey = new Map(
    Object.entries(roleOverrides).map(([key, role]) => [normalizeProfileKey(key), role]),
  );

  let founder: ContributorRosterEntry | null = null;
  const staff: ContributorRosterEntry[] = [];
  const contributors: ContributorRosterEntry[] = [];

  for (const profile of profiles) {
    if (excluded.has(profile.key)) {
      continue;
    }

    const roleOverride = overridesByKey.get(profile.key);
    const entry: ContributorRosterEntry = {
      profile,
      referenceCount: referenceCounts.get(profile.key) ?? 0,
      ...(roleOverride ? { roleOverride } : {}),
    };

    if (normalizedFounderKey && profile.key === normalizedFounderKey && !founder) {
      founder = entry;
      continue;
    }

    if (staffKeySet.has(profile.key)) {
      staff.push(entry);
      continue;
    }

    if (!isRosterMember(entry)) {
      continue;
    }

    contributors.push(entry);
  }

  return {
    founder,
    staff: staff.sort(compareRosterEntries),
    contributors: contributors.sort(compareRosterEntries),
  };
}

export type AboutContributorSelection = {
  readonly founderProfiles: NormalizedUserProfile[];
  readonly roster: ContributorRoster | null;
  readonly sectionTitle: string;
};

export type SelectAboutContributorsInput = {
  readonly isEffectIndex: boolean;
  readonly allProfiles?: readonly NormalizedUserProfile[];
  readonly curatedFounderProfiles: readonly NormalizedUserProfile[];
  readonly referenceCounts?: ReadonlyMap<string, number>;
};

export function selectAboutContributors({
  isEffectIndex,
  allProfiles = [],
  curatedFounderProfiles,
  referenceCounts = new Map<string, number>(),
}: SelectAboutContributorsInput): AboutContributorSelection {
  if (!isEffectIndex) {
    return {
      founderProfiles: [...curatedFounderProfiles],
      roster: null,
      sectionTitle: CURATED_FOUNDERS_SECTION_TITLE,
    };
  }

  return {
    founderProfiles: [],
    roster: buildContributorRoster({
      profiles: allProfiles,
      referenceCounts,
      founderKey: EFFECT_INDEX_FOUNDER_KEY,
      staffKeys: EFFECT_INDEX_STAFF_KEYS,
      roleOverrides: EFFECT_INDEX_ROLE_OVERRIDES,
      excludedKeys: EFFECT_INDEX_EXCLUDED_CONTRIBUTOR_KEYS,
    }),
    sectionTitle: CONTRIBUTOR_ROSTER_SECTION_TITLE,
  };
}

export function formatContributorReferenceCount(referenceCount: number): string | null {
  if (!Number.isFinite(referenceCount) || referenceCount <= 0) {
    return null;
  }

  const pages = Math.floor(referenceCount);
  return `${pages.toLocaleString("en-US")} ${pages === 1 ? "page" : "pages"}`;
}

export function formatContributorRosterSubtitle(
  entry: ContributorRosterEntry,
  options: { roleFallback?: string } = {},
): string | undefined {
  const role =
    entry.roleOverride?.trim() || entry.profile.role?.trim() || options.roleFallback?.trim() || "";
  const parts = [role, formatContributorReferenceCount(entry.referenceCount) ?? ""].filter(Boolean);

  return parts.length > 0 ? parts.join(" · ") : undefined;
}
