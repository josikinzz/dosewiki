// Pure identity resolution for wild-sourced contributor avatars: which artist a
// findings row belongs to, which profile carries it, and which spellings fold
// into it. No network, no filesystem, no Postgres - so the decision that matters
// most here is the one that is cheapest to test.
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
  /** Always present on a read row, and required by the alias-aware matcher. */
  aliases: string[];
}

export interface ReplicationRow {
  artist?: string;
  artist_url?: string;
}

/** One artist's findings, however many credit lines they arrived under. */
interface Cluster {
  key: string;
  profile: ProfileRow | null;
  members: Finding[];
  /** Every credit line folded into this identity, including ones with no finding. */
  creditLines: Set<string>;
}

export interface PlanEntry {
  /** The best-evidenced finding in the cluster; the one whose bytes get installed. */
  finding: Finding;
  /** The profile the avatar lands on; `null` until one is created for it. */
  profile: ProfileRow | null;
  key: string;
  displayName: string;
  avatarUrl: string;
  /** Other spellings of this artist, to record on the profile so they resolve to it. */
  aliasesToAdd: string[];
  /** Every credit line folded into this identity, for the report and the manifest. */
  consolidated: string[];
  /** What the artist's heading shows today, for the report. */
  replaces: "artwork-cut" | "other-image" | "monogram";
}

export interface SkippedFinding {
  finding: Finding;
  reason: string;
}

/** Findings below this are reported and skipped, never installed. */
const INSTALLABLE_CONFIDENCE: Record<string, true> = {
  high: true,
  medium: true,
};

/**
 * Smallest source short side worth installing.
 *
 * Nothing here upscales, so a 50x50 legacy avatar is delivered at 50px and
 * renders soft in a 40 CSS px frame on a 2x screen - softer than the sharp
 * artwork crop it would be replacing. A find that loses to the stand-in is not
 * an improvement, so it is reported and left alone. 96 keeps the 100x100 avatars
 * the older platforms still serve.
 */
export const MIN_SOURCE_SHORT_SIDE = 96;

/**
 * A profile key derived from a credit line.
 *
 * `normalizeProfileKey` only trims and uppercases, so the separator-stripping
 * that produced `SYMMETRICVISION` from "Symmetric Vision" and `UHSD5` from
 * "u/hsd5" happens here, then goes through it. Collisions are not an error at
 * this level: they are resolved by consolidating the two spellings into one
 * identity rather than by minting a second row.
 */
function newProfileKeyFor(displayName: string): string {
  const key = normalizeProfileKey(displayName.replace(/[^A-Za-z0-9]/g, ""));
  if (!key) {
    throw new Error(
      `Cannot derive a profile key from the credit line "${displayName}".`,
    );
  }
  return key;
}

/** True when `left` becomes `right` with at most one insertion, deletion or substitution. */
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

/**
 * Keys that look like the same artist spelled two ways.
 *
 * Containment catches the "X" / "X Art" shape; a single edit catches a
 * transposed or dropped letter, which is how "Shupliak" and "Shuplyak" ended up
 * as two artists. A match means the two spellings are consolidated onto one
 * profile with the loser recorded as an alias - never two rows for one person.
 *
 * An exact match counts. Two credit lines that derive the same key - which is
 * what a reviewed merge group produces, since every member derives the key of
 * the spelling that leads it - are the same identity by construction, and
 * callers pass lists that never contain the key being tested.
 *
 * Deliberately narrow otherwise. Two genuinely different artists whose names
 * differ by one letter would be merged by this, so anything it catches is
 * printed in the run's consolidation report rather than applied silently.
 */
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
  /** Profile keys whose current avatar is a crop of the artist's own work. */
  artworkKeys: ReadonlySet<string>;
  /** Reviewed groups of credit lines that name the same human. */
  mergeGroups: readonly string[][];
}

/**
 * Findings in, one entry per artist out.
 *
 * The whole point of this function is that an artist ends up with exactly one
 * profile no matter how many names the corpus credits them under. Two artists
 * merged by mistake is the expensive failure - it hands one person's page to
 * another - so consolidation only happens on a reviewed merge group or a
 * near-identical key, and everything it does is reported by the caller.
 */
export function buildWildAvatarPlan({
  findings,
  profiles,
  replications,
  artworkKeys,
  mergeGroups,
}: PlanInput): { plan: PlanEntry[]; skipped: SkippedFinding[] } {
  // Every credit line the gallery shows, with its weight. A findings row naming
  // an artist nobody is credited as is caught here rather than installed
  // nowhere, and the counts decide which spelling leads a consolidated identity.
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

    // A reviewed merge group speaks for the whole identity, so the profile
    // lookup and the derived key both run against the spelling that leads it.
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

    // Every spelling folded into this identity, whether or not it had a finding
    // of its own: an alias is what makes the other gallery group resolve here.
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
