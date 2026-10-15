import {
  findContributorProfileByAuthorName,
  normalizeProfileAlias,
  normalizeProfileKey,
} from "../../lib/contributorProfileIdentity";
import type { StoredContributorProfile } from "./generate-avatar-import-policy";
import { avatarUrlForKey } from "./generate-avatar-files";

type Confidence = "high" | "medium" | "low" | "none";

export interface Finding {
  artist: string;
  imageUrl: string | null;
  sourcePage?: string | null;
  platform?: string | null;
  dimensions?: string | null;
  evidence: string;
  license?: string | null;
  confidence: Confidence;
}

export interface ProfileRow extends StoredContributorProfile {
  key: string;
  displayName: string;
  aliases: string[];
}

export interface ReplicationRow {
  artist?: string;
  artist_url?: string;
}

interface Cluster {
  key: string;
  profile: ProfileRow | null;
  members: Finding[];
  creditLines: Set<string>;
}

export interface PlanEntry {
  finding: Finding;
  profile: ProfileRow | null;
  key: string;
  displayName: string;
  avatarUrl: string;
  aliasesToAdd: string[];
  consolidated: string[];
  replaces: "artwork-cut" | "other-image" | "monogram";
}

export interface SkippedFinding {
  finding: Finding;
  reason: string;
}

const INSTALLABLE_CONFIDENCE: Record<string, true> = {
  high: true,
  medium: true,
};

export const MIN_SOURCE_SHORT_SIDE = 96;

function newProfileKeyFor(displayName: string): string {
  const key = normalizeProfileKey(displayName.replace(/[^A-Za-z0-9]/g, ""));
  if (!key) {
    throw new Error(
      `Cannot derive a profile key from the credit line "${displayName}".`,
    );
  }
  return key;
}

function editDistanceAtMostOne(left: string, right: string): boolean {
  if (left === right) return true;
  const [shorter, longer] =
    left.length <= right.length ? [left, right] : [right, left];
  if (longer.length - shorter.length > 1) return false;

  let short = 0;
  let long = 0;
  let edits = 0;
  while (short < shorter.length && long < longer.length) {
    if (shorter[short] === longer[long]) {
      short += 1;
      long += 1;
      continue;
    }
    edits += 1;
    if (edits > 1) return false;
    if (shorter.length === longer.length) short += 1;
    long += 1;
  }
  return true;
}

function nearDuplicateOf(
  key: string,
  others: readonly string[],
): string | null {
  for (const other of others) {
    if (other === key) return other;
    if (other.startsWith(key) || key.startsWith(other)) return other;
    if (
      Math.abs(other.length - key.length) <= 1 &&
      editDistanceAtMostOne(key, other)
    )
      return other;
  }
  return null;
}

function isInstallable(finding: Finding): boolean {
  return (
    INSTALLABLE_CONFIDENCE[finding.confidence] === true &&
    typeof finding.imageUrl === "string" &&
    /^https:\/\//.test(finding.imageUrl)
  );
}

export interface PlanInput {
  findings: readonly Finding[];
  profiles: readonly ProfileRow[];
  replications: readonly ReplicationRow[];
  artworkKeys: ReadonlySet<string>;
  mergeGroups: readonly string[][];
}

export function buildWildAvatarPlan({
  findings,
  profiles,
  replications,
  artworkKeys,
  mergeGroups,
}: PlanInput): { plan: PlanEntry[]; skipped: SkippedFinding[] } {
  const worksByCredit = new Map<string, number>();
  for (const row of replications) {
    const credit = normalizeProfileAlias(row.artist ?? "");
    if (!credit || /^(unknown|anonymous)$/.test(credit)) continue;
    worksByCredit.set(credit, (worksByCredit.get(credit) ?? 0) + 1);
  }
  const works = (line: string) =>
    worksByCredit.get(normalizeProfileAlias(line)) ?? 0;

  const existingKeys: string[] = [];
  for (const profile of profiles) {
    existingKeys.push(normalizeProfileKey(profile.key));
    for (const alias of profile.aliases ?? []) {
      existingKeys.push(normalizeProfileKey(alias));
    }
  }

  const mergeGroupByCredit = new Map<string, string[]>();
  for (const group of mergeGroups) {
    for (const line of group) {
      mergeGroupByCredit.set(normalizeProfileAlias(line), group);
    }
  }

  const clusters: Cluster[] = [];
  const skipped: SkippedFinding[] = [];

  const join = (
    cluster: Cluster | undefined,
    finding: Finding,
    lines: readonly string[],
  ) => {
    if (!cluster) return false;
    cluster.members.push(finding);
    for (const line of lines) cluster.creditLines.add(line);
    return true;
  };

  for (const finding of findings) {
    if (!isInstallable(finding)) {
      skipped.push({
        finding,
        reason:
          finding.confidence === "none"
            ? "no avatar found"
            : finding.confidence === "low"
              ? "uncorroborated identity"
              : "no https image URL",
      });
      continue;
    }
    if (!worksByCredit.has(normalizeProfileAlias(finding.artist))) {
      skipped.push({
        finding,
        reason: "credit line matches no replication row",
      });
      continue;
    }

    const group = mergeGroupByCredit.get(normalizeProfileAlias(finding.artist));
    const groupLines = group ?? [finding.artist];
    const leadCredit = [...groupLines].sort(
      (left, right) => works(right) - works(left) || left.localeCompare(right),
    )[0];

    const claimedProfile =
      findContributorProfileByAuthorName(profiles, finding.artist) ??
      (group
        ? (groupLines
            .map((line) => findContributorProfileByAuthorName(profiles, line))
            .find((match) => match !== null) ?? null)
        : null);

    if (claimedProfile) {
      const key = normalizeProfileKey(claimedProfile.key);
      if (
        !join(
          clusters.find((entry) => entry.key === key),
          finding,
          groupLines,
        )
      ) {
        clusters.push({
          key,
          profile: claimedProfile,
          members: [finding],
          creditLines: new Set(groupLines),
        });
      }
      continue;
    }

    const derived = newProfileKeyFor(leadCredit);
    const claimedKey = nearDuplicateOf(derived, existingKeys);
    const owner = claimedKey
      ? (profiles.find((row) => normalizeProfileKey(row.key) === claimedKey) ??
        profiles.find((row) =>
          (row.aliases ?? []).some(
            (alias) => normalizeProfileKey(alias) === claimedKey,
          ),
        ))
      : undefined;

    if (owner) {
      const key = normalizeProfileKey(owner.key);
      if (
        !join(
          clusters.find((entry) => entry.key === key),
          finding,
          groupLines,
        )
      ) {
        clusters.push({
          key,
          profile: owner,
          members: [finding],
          creditLines: new Set(groupLines),
        });
      }
      continue;
    }

    const sibling = clusters.find(
      (cluster) => !cluster.profile && nearDuplicateOf(derived, [cluster.key]),
    );
    if (!join(sibling, finding, groupLines)) {
      clusters.push({
        key: derived,
        profile: null,
        members: [finding],
        creditLines: new Set(groupLines),
      });
    }
  }

  const plan = clusters.map((cluster): PlanEntry => {
    const ranked = [...cluster.members].sort(
      (left, right) =>
        Number(right.confidence === "high") -
          Number(left.confidence === "high") ||
        works(right.artist) - works(left.artist) ||
        left.artist.localeCompare(right.artist),
    );

    const creditLines = [...cluster.creditLines].sort(
      (left, right) => works(right) - works(left) || left.localeCompare(right),
    );
    const displayName = cluster.profile?.displayName ?? creditLines[0];
    const key = cluster.profile
      ? normalizeProfileKey(cluster.profile.key)
      : newProfileKeyFor(displayName);
    const held = new Set(
      (cluster.profile?.aliases ?? []).map((alias) =>
        normalizeProfileAlias(alias),
      ),
    );
    const aliasesToAdd = creditLines
      .map((line) => normalizeProfileAlias(line))
      .filter(
        (alias, index, list) =>
          alias !== normalizeProfileAlias(displayName) &&
          !held.has(alias) &&
          list.indexOf(alias) === index,
      );

    return {
      finding: ranked[0],
      profile: cluster.profile,
      key,
      displayName,
      avatarUrl: avatarUrlForKey(key),
      aliasesToAdd,
      consolidated: creditLines,
      replaces: !cluster.profile
        ? "monogram"
        : artworkKeys.has(key)
          ? "artwork-cut"
          : cluster.profile.avatarUrl
            ? "other-image"
            : "monogram",
    };
  });

  plan.sort((left, right) => left.key.localeCompare(right.key));
  return { plan, skipped };
}
