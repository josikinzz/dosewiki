/**
 * The public contributor roster — who appears on the About page's contributor tab, in what
 * order, and with what credit line.
 *
 * Two publications share this codebase and they want different things here:
 *
 * - **dose.wiki** shows a curated founder subset chosen by an editor in Convex
 *   (`siteConfig.founderProfileKeys`). Nothing in this module changes that: the dose.wiki
 *   branch returns those profiles untouched, in the editor's order.
 * - **Effect Index** lists *every* contributor profile, with Josie Kins pinned first as the
 *   site's founder and everybody else ordered by how many pages credit them.
 *
 * Everything here is pure and takes the flavor as an argument, so both branches are testable
 * in one run without rebuilding the module graph.
 *
 * ## What "how many pages credit them" means
 *
 * Attribution in this corpus is mostly free text, and only some of it belongs to a page a
 * reader can visit. The count is the number of **distinct pages** that credit a contributor,
 * assembled from the reads the site already performs:
 *
 * | Page                | Credit fields                                                     |
 * | ------------------- | ----------------------------------------------------------------- |
 * | `/effects/<slug>`   | `subjectiveEffects.contributors[]`, `audio_replications[].artist`, and the `artist` of every replication whose `effect_slug` is that effect |
 * | `/reports/<slug>`   | `tripReports.subject.name`, and `subject.profile_key` when set     |
 *
 * Deliberately excluded:
 *
 * - `effectIndexArticles.authors[]` — the legacy Mongo dump left these as raw 24-character
 *   ObjectIds (every published article carries the same one) and nothing maps them back to a
 *   person. Counting them would credit nobody and rank everybody wrong; the home page's
 *   `formatAuthorLine` already refuses to print them for the same reason.
 * - The archived Effect Index blog — `effectIndexArchive` is not deployed on the public read
 *   target, so its posts are not a live attribution source at all.
 * - The dev changelog (`submittedBy`) — those are editor edit records for substance articles,
 *   not pages a reader can open. The contributor profile page already surfaces them as
 *   history via `buildProfileHistory`.
 *
 * Name resolution goes through the existing alias-aware matchers so `mark gillis` resolves to
 * `VISCID`, `josikinz` and `Josie` to `JOSIE`, and `Kaylee` to `KAYTWO`. This module adds no
 * matching rules of its own — it only memoizes the answers.
 */
import { findProfileByAuthorNameInList, type NormalizedUserProfile } from "./userProfiles";
import {
  findContributorProfileByKeyOrAlias,
  normalizeProfileAlias,
  normalizeProfileKey,
} from "../../lib/contributorProfileIdentity";

/**
 * Josie Kins founded Effect Index (30 June 2017) and the site says so in its own mission
 * prose. The pin is by profile key rather than by display name or by a `role` value, because
 * the key is the stable identity and the `role` field is optional and not yet backfilled
 * everywhere.
 */
export const EFFECT_INDEX_FOUNDER_KEY = "JOSIE";

/**
 * Fallback title for the pinned founder when her profile carries no `role`. Founding Effect
 * Index is a documented fact of the publication (see the flavor's mission markdown), not a
 * data-dependent claim, so the label is safe to render without the field.
 */
export const EFFECT_INDEX_FOUNDER_ROLE_FALLBACK = "Founder";

/**
 * Lyrea is a dose.wiki contributor, not an Effect Index one: she did not contribute to Effect
 * Index and is not a founder of it, so listing her on that publication's contributor tab
 * would be a false credit. Her profile and her dose.wiki presence are untouched — this is a
 * display-time exclusion on one flavor only.
 */
export const EFFECT_INDEX_EXCLUDED_CONTRIBUTOR_KEYS: readonly string[] = ["LYREA"];

/** dose.wiki's heading, unchanged: that tab really does list a curated founder subset. */
export const CURATED_FOUNDERS_SECTION_TITLE = "Founders & Contributors";

/** Effect Index lists everyone, behind one founder — singular, because there is one. */
export const CONTRIBUTOR_ROSTER_SECTION_TITLE = "Founder & Contributors";

/** Explains the roster's order to the reader, so the ranking does not look arbitrary. */
export const CONTRIBUTOR_ROSTER_ORDER_NOTE =
  "Everyone who has contributed to the archive, ordered by the number of pages that credit them.";

/* --------------------------------------------------------------------- profile de-dupe */

/**
 * Drop contributor rows that exist only as an alias of another row.
 *
 * This is the same intent as `collapseContributorProfiles` in
 * `lib/convex/publicData.reportProfileProjection`, with one difference that matters here: a
 * profile listing *its own* name among its aliases is not a duplicate of itself.
 *
 * The Effect Index identity import writes the lowercased key as an alias (`JOSIE` carries
 * `["josie", "josikinz", "josie kins"]`), which the shared helper reads as "this row is an
 * alias row" and removes — currently collapsing the entire public profile table down to the
 * one row that has no self-alias. That helper is shared with the report author projection and
 * with dose.wiki's own curated founder list, so it is left alone; the roster gets a corrected
 * copy rather than a behaviour change nobody asked for. Fold the two together once dose.wiki's
 * About page is allowed to move.
 *
 * A genuinely duplicated row is still dropped, keeping the profile that claims it.
 */
export function dropAliasDuplicateProfiles(
  profiles: readonly NormalizedUserProfile[],
): NormalizedUserProfile[] {
  const canonicalKeys = new Set(profiles.map((profile) => profile.key));
  const duplicateKeys = new Set<string>();

  for (const profile of profiles) {
    for (const alias of profile.aliases) {
      const aliasKey = normalizeProfileKey(alias);

      if (aliasKey && aliasKey !== profile.key && canonicalKeys.has(aliasKey)) {
        duplicateKeys.add(aliasKey);
      }
    }
  }

  return profiles.filter((profile) => !duplicateKeys.has(profile.key));
}

/* ------------------------------------------------------------------ reference counting */

/** One effect article, as the public effect read already returns it. */
export type ContributorReferenceEffectInput = {
  readonly slug: string;
  readonly contributors?: readonly string[];
  readonly audio_replications?: readonly { readonly artist?: string }[];
};

/** One image/video replication. Credited to the effect page that renders it. */
export type ContributorReferenceReplicationInput = {
  readonly effect_slug: string;
  readonly artist?: string;
};

/**
 * One trip report preview. `authorProfileKey` is the key the public report projection already
 * resolved from `subject.name`; a raw `subject.profile_key` may be passed here just as well,
 * since both are run through the key-or-alias matcher.
 */
export type ContributorReferenceReportInput = {
  readonly slug: string;
  readonly author?: string;
  readonly authorProfileKey?: string;
};

export type ContributorReferenceInput = {
  readonly effects?: readonly ContributorReferenceEffectInput[];
  readonly replications?: readonly ContributorReferenceReplicationInput[];
  readonly reports?: readonly ContributorReferenceReportInput[];
};

/**
 * One page's worth of credits. `id` exists so several sources that land on the same page —
 * an effect's `contributors`, its audio replications and its gallery images — collapse into a
 * single reference rather than three.
 */
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

/**
 * Fold every attribution source into one credit list per page. Insertion order is stable
 * (effects in read order, then reports), which keeps the resulting counts identical between
 * builds for identical input.
 */
export function collectContributorReferencePages(
  input: ContributorReferenceInput,
): ContributorReferencePage[] {
  const pages = new Map<string, MutablePage>();

  for (const effect of input.effects ?? []) {
    const id = `effect:${effect.slug}`;
    // An effect with no credits still gets a page entry, so the shape of the output does not
    // depend on whether anybody happens to be credited on it.
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

  return Array.from(pages.values(), (page) => ({
    id: page.id,
    names: Array.from(page.names),
    profileKeys: Array.from(page.profileKeys),
  }));
}

/**
 * Count the distinct pages that credit each profile. Every profile appears in the result,
 * including those with no references at all, so callers never have to distinguish "zero" from
 * "missing".
 *
 * A contributor named three times on one page counts once: credits are resolved into a set
 * per page before the counters move.
 */
export function countContributorPageReferences(
  profiles: readonly NormalizedUserProfile[],
  pages: readonly ContributorReferencePage[],
): Map<string, number> {
  const counts = new Map<string, number>(profiles.map((profile) => [profile.key, 0]));

  // Free-text credits repeat heavily ("Josie" appears on 200+ effects), so each distinct
  // spelling is resolved once. The matching itself stays in the shared identity helpers.
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

/** Convenience wrapper: collect the pages and count them in one call. */
export function countContributorReferences(
  profiles: readonly NormalizedUserProfile[],
  input: ContributorReferenceInput,
): Map<string, number> {
  return countContributorPageReferences(profiles, collectContributorReferencePages(input));
}

/* -------------------------------------------------------------------------- the roster */

export type ContributorRosterEntry = {
  readonly profile: NormalizedUserProfile;
  /** Distinct pages that credit this contributor. `0` is a real, renderable value. */
  readonly referenceCount: number;
};

/**
 * The founder is a separate field rather than the first array element on purpose: the About
 * page renders her in her own labelled region, so being first is structural and survives any
 * change to the reference counts.
 */
export type ContributorRoster = {
  readonly founder: ContributorRosterEntry | null;
  readonly contributors: readonly ContributorRosterEntry[];
};

export type BuildContributorRosterInput = {
  readonly profiles: readonly NormalizedUserProfile[];
  readonly referenceCounts: ReadonlyMap<string, number>;
  /** Profile pinned out of the sort and presented as the founder. */
  readonly founderKey?: string;
  /** Profiles dropped from this publication's roster entirely. */
  readonly excludedKeys?: readonly string[];
};

/**
 * Order by reference count descending, then display name, then key.
 *
 * The two name fallbacks are what keep the build reproducible: counts tie constantly at the
 * bottom of the list (everybody with one page, everybody with none), and two profiles can
 * legitimately share a display name, so the key has the last word.
 */
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
  excludedKeys = [],
}: BuildContributorRosterInput): ContributorRoster {
  const excluded = new Set(excludedKeys.map((key) => normalizeProfileKey(key)).filter(Boolean));
  const normalizedFounderKey = normalizeProfileKey(founderKey ?? "");

  let founder: ContributorRosterEntry | null = null;
  const contributors: ContributorRosterEntry[] = [];

  for (const profile of profiles) {
    if (excluded.has(profile.key)) {
      continue;
    }

    const entry: ContributorRosterEntry = {
      profile,
      referenceCount: referenceCounts.get(profile.key) ?? 0,
    };

    if (normalizedFounderKey && profile.key === normalizedFounderKey && !founder) {
      founder = entry;
      continue;
    }

    contributors.push(entry);
  }

  return { founder, contributors: contributors.sort(compareRosterEntries) };
}

/* ------------------------------------------------------------------ flavored selection */

export type AboutContributorSelection = {
  /** dose.wiki's curated founder cards. Empty when the roster is in use. */
  readonly founderProfiles: NormalizedUserProfile[];
  /** Effect Index's full roster, or `null` on a flavor that keeps the curated list. */
  readonly roster: ContributorRoster | null;
  /** Heading for the contributor section and its tab panel. */
  readonly sectionTitle: string;
};

export type SelectAboutContributorsInput = {
  /** `true` on the Effect Index build. Passed in rather than read, so both paths are testable. */
  readonly isEffectIndex: boolean;
  /** Every public contributor profile. Only read on the roster branch. */
  readonly allProfiles?: readonly NormalizedUserProfile[];
  /** The editor-curated founder subset from Convex `siteConfig`. */
  readonly curatedFounderProfiles: readonly NormalizedUserProfile[];
  readonly referenceCounts?: ReadonlyMap<string, number>;
};

/**
 * Choose what the About page's contributor tab shows.
 *
 * dose.wiki's branch is deliberately a pass-through of the curated list, in the editor's
 * order: that publication's page must not move when Effect Index's does.
 */
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
      excludedKeys: EFFECT_INDEX_EXCLUDED_CONTRIBUTOR_KEYS,
    }),
    sectionTitle: CONTRIBUTOR_ROSTER_SECTION_TITLE,
  };
}

/* -------------------------------------------------------------------------- card credit */

/** `"12 pages"`, `"1 page"`, or `null` when nothing on the site credits them yet. */
export function formatContributorReferenceCount(referenceCount: number): string | null {
  if (!Number.isFinite(referenceCount) || referenceCount <= 0) {
    return null;
  }

  const pages = Math.floor(referenceCount);
  return `${pages.toLocaleString("en-US")} ${pages === 1 ? "page" : "pages"}`;
}

/**
 * Credit line under a roster card: the contributor's title, their page count, or both.
 * `undefined` when neither exists, which lets `ContributorCard` fall back to its `@key`
 * subtitle rather than rendering an empty separator.
 */
export function formatContributorRosterSubtitle(
  entry: ContributorRosterEntry,
  options: { roleFallback?: string } = {},
): string | undefined {
  const role = entry.profile.role?.trim() || options.roleFallback?.trim() || "";
  const parts = [role, formatContributorReferenceCount(entry.referenceCount) ?? ""].filter(Boolean);

  return parts.length > 0 ? parts.join(" · ") : undefined;
}
