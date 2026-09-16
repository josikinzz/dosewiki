/**
 * The public contributor roster — who appears on the About page's contributor tab, in what
 * order, and with what credit line.
 *
 * Two publications share this codebase and they want different things here:
 *
 * - **dose.wiki** shows a curated founder subset chosen by an editor in Postgres
 *   (`siteConfig.founderProfileKeys`). Nothing in this module changes that: the dose.wiki
 *   branch returns those profiles untouched, in the editor's order.
 * - **Effect Index** lists *every* contributor profile, with Josie Kins pinned first as the
 *   site's founder, a pinned Staff tier below her (`EFFECT_INDEX_STAFF_KEYS`), and everybody
 *   else ordered by how many pages credit them. `isRosterMember` is where "every" is decided,
 *   and it is the only place.
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
 * | `/substances/<slug>` | the completed `editorial_review`, resolved to a contributor profile key inside Postgres (`substanceIndex:getPublicReviewedArticleCreditsPage`) — expert-reviewing an article is a contribution to the page it gates |
 *
 * Deliberately excluded:
 *
 * - `effectIndexArticles.authors[]` — the legacy Mongo dump left these as raw 24-character
 *   ObjectIds. There is exactly one across the whole corpus, `60542430198361300fea3610`, and
 *   it does resolve: the dump's own `people` collection (`kind: "person"`, imported into
 *   `effectIndexArchive`) maps it to Josie Kins. What the ObjectIds cannot do is carry that
 *   identity at read time — the field is opaque strings, so it is `authorProfileKeys` (the
 *   backfilled profile keys, `JOSIE` for every legacy row) that bylines and any future
 *   counting read from. The raw ids stay excluded here and unprinted by the home page's
 *   `formatAuthorLine`. They are also a single author on every article, so counting them
 *   would move nobody's rank but Josie's, who is pinned first regardless.
 * - The archived Effect Index blog — `effectIndexArchive` is not deployed on the public read
 *   target, so its posts are not a live attribution source at all.
 * - The dev changelog (`submittedBy`) — those are editor edit records for substance articles,
 *   not pages a reader can open. The contributor profile page already surfaces them as
 *   history via `getPublicProfileHistory`.
 *
 * Name resolution goes through the existing alias-aware matchers so `mark gillis` resolves to
 * `VISCID`, `josikinz` and `Josie` to `JOSIE`, and `Kaylee` to `KAYTWO`. This module adds no
 * matching rules of its own — it only memoizes the answers.
 */
import { msg } from "@/i18n/messages";
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
export const EFFECT_INDEX_FOUNDER_ROLE_FALLBACK = msg("Founder");

/**
 * Profiles dropped from the Effect Index roster. Empty since expert reviews started counting
 * as contributions: Lyrea used to be excluded here on the grounds that she did not contribute
 * to Effect Index, but the substance corpus she reviews is served by both publications, so
 * that premise no longer holds. The mechanism stays for the next editorial exclusion.
 */
export const EFFECT_INDEX_EXCLUDED_CONTRIBUTOR_KEYS: readonly string[] = [];

/**
 * Profiles pinned into the Effect Index roster's Staff tier, rendered between the founder
 * and the ranked contributor grid. Like the founder pin, membership is by profile key: the
 * key is the stable identity, and being staff is an editorial fact about the publication
 * rather than something derivable from reference counts.
 */
export const EFFECT_INDEX_STAFF_KEYS: readonly string[] = ["LYREA"];

/**
 * Display-only role overrides for the Effect Index roster, keyed by profile key. The stored
 * profile `role` is shared by both publications, and Lyrea's says "Founder" because she
 * founded dose.wiki — a claim that is true there and wrong on Effect Index, which she did
 * not found. The override changes what one flavor's card prints; the profile itself, and
 * dose.wiki's rendering of it, are untouched.
 */
export const EFFECT_INDEX_ROLE_OVERRIDES: Readonly<Record<string, string>> = {
  LYREA: "Administrator",
};

/**
 * Whether one profile belongs on the contributor roster. **This is the whole membership
 * policy** — there is no second rule anywhere else, and changing this function changes the
 * published page.
 *
 * Today the answer is everybody. The credited-identity import
 * (`scripts/contributors/seed-credited-identities.mjs`) gives every name in the corpus an
 * ordinary profile "like anyone else", and that decision has a visible consequence: the
 * Effect Index roster goes from twelve names to eighty-three, most of them credited on a
 * single page. That is a real editorial choice, so it is written down as a function rather
 * than implied by the absence of a filter.
 *
 * To narrow it, edit only this body. For example:
 *
 * ```ts
 * // Only people the archive credits more than once.
 * return entry.referenceCount > 1;
 *
 * // Only the profiles that existed before the import.
 * return PRE_IMPORT_CONTRIBUTOR_KEYS.includes(entry.profile.key);
 * ```
 *
 * The pinned founder is chosen before this runs, so no narrowing can accidentally empty the
 * founder slot.
 */
export function isRosterMember(entry: ContributorRosterEntry): boolean {
  // A profile with no key has no page to link to, so it is the one thing a roster of
  // "everybody" still cannot show.
  return entry.profile.key.length > 0;
}

/** dose.wiki's heading, unchanged: that tab really does list a curated founder subset. */
export const CURATED_FOUNDERS_SECTION_TITLE = msg("Founders & Contributors");

/** Effect Index lists everyone, behind one founder — singular, because there is one. */
export const CONTRIBUTOR_ROSTER_SECTION_TITLE = msg("Founder & Contributors");

/** Explains the roster's order to the reader, so the ranking does not look arbitrary. */
export const CONTRIBUTOR_ROSTER_ORDER_NOTE = msg(
  "Everyone who has contributed to the archive, ordered by the number of pages that credit them.",
);

/* ------------------------------------------------------------------ reference counting */

/** One effect article, as the public effect read already returns it. */
type ContributorReferenceEffectInput = {
  readonly slug: string;
  readonly contributors?: readonly string[];
  readonly audio_replications?: readonly { readonly artist?: string }[];
}

/** One image/video replication. Credited to the effect page that renders it. */
type ContributorReferenceReplicationInput = {
  readonly effect_slug: string;
  readonly artist?: string;
}

/**
 * One trip report preview. `authorProfileKey` is the key the public report projection already
 * resolved from `subject.name`; a raw `subject.profile_key` may be passed here just as well,
 * since both are run through the key-or-alias matcher.
 */
type ContributorReferenceReportInput = {
  readonly slug: string;
  readonly author?: string;
  readonly authorProfileKey?: string;
}

/**
 * One expert-reviewed substance article. `reviewerProfileKey` was resolved from the stored
 * reviewer email inside Postgres, so no email reaches this module; the key still goes through
 * the key-or-alias matcher here, like a report's `authorProfileKey`.
 */
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
 * (effects in read order, then reports, then reviewed articles), which keeps the resulting
 * counts identical between builds for identical input.
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

  for (const reviewed of input.reviewedArticles ?? []) {
    addCredit(pages, `substance:${reviewed.slug}`, { profileKey: reviewed.reviewerProfileKey });
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
  /**
   * Publication-scoped display title, when this roster's flavor disagrees with the stored
   * profile `role`. Takes precedence over `profile.role` in the credit line; the profile
   * itself is never mutated.
   */
  readonly roleOverride?: string;
};

/**
 * The founder is a separate field rather than the first array element on purpose: the About
 * page renders her in her own labelled region, so being first is structural and survives any
 * change to the reference counts.
 */
export type ContributorRoster = {
  readonly founder: ContributorRosterEntry | null;
  /** Pinned staff tier, rendered between the founder and the ranked contributors. */
  readonly staff: readonly ContributorRosterEntry[];
  readonly contributors: readonly ContributorRosterEntry[];
};

export type BuildContributorRosterInput = {
  readonly profiles: readonly NormalizedUserProfile[];
  readonly referenceCounts: ReadonlyMap<string, number>;
  /** Profile pinned out of the sort and presented as the founder. */
  readonly founderKey?: string;
  /** Profiles pinned out of the sort into the Staff tier, above the ranked contributors. */
  readonly staffKeys?: readonly string[];
  /** Display-only role titles by profile key, overriding the stored `role` on this roster. */
  readonly roleOverrides?: Readonly<Record<string, string>>;
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

    // Pinned like the founder: staff membership is editorial, not count-derived, so it is
    // decided before the membership policy runs and cannot be narrowed away by it.
    if (staffKeySet.has(profile.key)) {
      staff.push(entry);
      continue;
    }

    // The single membership policy. See `isRosterMember`.
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
  /** The editor-curated founder subset from Postgres `siteConfig`. */
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
      staffKeys: EFFECT_INDEX_STAFF_KEYS,
      roleOverrides: EFFECT_INDEX_ROLE_OVERRIDES,
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
 * subtitle rather than rendering an empty separator. A roster-scoped `roleOverride`
 * outranks the stored profile `role`, which outranks the caller's fallback.
 */
export function formatContributorRosterSubtitle(
  entry: ContributorRosterEntry,
  options: { roleFallback?: string } = {},
): string | undefined {
  const role =
    entry.roleOverride?.trim() || entry.profile.role?.trim() || options.roleFallback?.trim() || "";
  const parts = [role, formatContributorReferenceCount(entry.referenceCount) ?? ""].filter(Boolean);

  return parts.length > 0 ? parts.join(" · ") : undefined;
}
