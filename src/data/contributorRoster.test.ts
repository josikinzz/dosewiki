import { describe, expect, it } from "vitest";

import {
  CONTRIBUTOR_ROSTER_SECTION_TITLE,
  CURATED_FOUNDERS_SECTION_TITLE,
  EFFECT_INDEX_EXCLUDED_CONTRIBUTOR_KEYS,
  EFFECT_INDEX_FOUNDER_KEY,
  EFFECT_INDEX_ROLE_OVERRIDES,
  EFFECT_INDEX_STAFF_KEYS,
  buildContributorRoster,
  collectContributorReferencePages,
  countContributorPageReferences,
  countContributorReferences,
  formatContributorReferenceCount,
  formatContributorRosterSubtitle,
  isRosterMember,
  selectAboutContributors,
  type ContributorRosterEntry,
} from "./contributorRoster";
import type { NormalizedUserProfile } from "./userProfiles";

function profile(
  key: string,
  displayName: string,
  overrides: Partial<NormalizedUserProfile> = {},
): NormalizedUserProfile {
  return {
    key,
    displayName,
    aliases: [],
    avatarUrl: null,
    bio: "",
    links: [],
    hasCustomBio: false,
    ...overrides,
  };
}

/** Shapes and spellings taken from the live corpus, trimmed to what the counting reads. */
const JOSIE = profile("JOSIE", "Josie Kins", { aliases: ["josie", "josikinz", "josie kins"] });
const KAYTWO = profile("KAYTWO", "Kaytwo", { aliases: ["kaylee", "kaytwo"] });
const VISCID = profile("VISCID", "Viscid", { aliases: ["viscid", "mark gillis"] });
const NERVEWING = profile("NERVEWING", "Nervewing", { aliases: ["nervewing"] });
const STINGRAYZ = profile("STINGRAYZ", "StingrayZ", { aliases: ["stingrayz"] });
const RHO = profile("RHO", "Rho", { aliases: ["rho"] });
// Her stored role says "Founder" because she founded dose.wiki; Effect Index re-badges it.
const LYREA = profile("LYREA", "Lyrea", { aliases: ["oldhandle"], role: "Founder" });

const ALL_PROFILES = [JOSIE, KAYTWO, LYREA, NERVEWING, RHO, STINGRAYZ, VISCID];

describe("countContributorReferences", () => {
  it("counts distinct pages rather than mentions", () => {
    // Josie is credited three times on one effect page: in `contributors`, as an audio
    // replication artist, and as the artist of an image replication on that same effect.
    const counts = countContributorReferences([JOSIE, KAYTWO], {
      effects: [
        {
          slug: "tracers",
          contributors: ["Josie", "Josie"],
          audio_replications: [{ artist: "josikinz" }],
        },
      ],
      replications: [{ effect_slug: "tracers", artist: "Josie Kins" }],
    });

    expect(counts.get("JOSIE")).toBe(1);
    expect(counts.get("KAYTWO")).toBe(0);
  });

  it("adds up separate effect and report pages", () => {
    const counts = countContributorReferences(ALL_PROFILES, {
      effects: [
        { slug: "tracers", contributors: ["Josie", "Kaylee"] },
        { slug: "drifting", contributors: ["Josie"] },
        { slug: "geometry", contributors: ["Kaylee"] },
      ],
      replications: [{ effect_slug: "geometry", artist: "StingrayZ" }],
      reports: [
        { slug: "first", author: "nervewing" },
        { slug: "second", author: "nervewing" },
        { slug: "third", author: "Kaytwo" },
      ],
    });

    expect(Object.fromEntries(counts)).toEqual({
      JOSIE: 2,
      KAYTWO: 3,
      LYREA: 0,
      NERVEWING: 2,
      RHO: 0,
      STINGRAYZ: 1,
      VISCID: 0,
    });
  });

  it("resolves free-text credits through the shared alias matchers", () => {
    const counts = countContributorReferences(ALL_PROFILES, {
      effects: [
        // Alias, display-name-first-word and exact display name spellings all occur.
        { slug: "one", contributors: ["mark gillis"] },
        { slug: "two", contributors: ["josikinz"] },
        { slug: "three", contributors: ["Josie"] },
        { slug: "four", contributors: ["Kaylee"] },
      ],
    });

    expect(counts.get("VISCID")).toBe(1);
    expect(counts.get("JOSIE")).toBe(2);
    expect(counts.get("KAYTWO")).toBe(1);
  });

  it("credits an explicit profile key as well as the free-text name", () => {
    const counts = countContributorReferences(ALL_PROFILES, {
      reports: [
        { slug: "keyed", author: "Anonymous", authorProfileKey: "JOSIE" },
        // An alias in the key position resolves the same way.
        { slug: "aliased", author: "Anonymous", authorProfileKey: "oldhandle" },
      ],
    });

    expect(counts.get("JOSIE")).toBe(1);
    expect(counts.get("LYREA")).toBe(1);
  });

  it("counts an expert review as a contribution to the reviewed article's page", () => {
    const counts = countContributorReferences(ALL_PROFILES, {
      reviewedArticles: [
        { slug: "2c-b", reviewerProfileKey: "LYREA" },
        { slug: "dmt", reviewerProfileKey: "LYREA" },
        // An alias in the key position resolves like a report's authorProfileKey.
        { slug: "lsd", reviewerProfileKey: "oldhandle" },
        // Two reviews stamped on the same article count that page once.
        { slug: "2c-b", reviewerProfileKey: "LYREA" },
      ],
    });

    expect(counts.get("LYREA")).toBe(3);
    expect(counts.get("JOSIE")).toBe(0);
  });

  it("credits nobody for names and keys that match no profile", () => {
    const counts = countContributorReferences(ALL_PROFILES, {
      effects: [{ slug: "one", contributors: ["liv", "Brack", "chemi", ""] }],
      replications: [{ effect_slug: "one", artist: "Unknown" }, { effect_slug: "two" }],
      reports: [
        { slug: "anon", author: "Anonymous" },
        { slug: "orphan", author: "froggie", authorProfileKey: "NOBODY" },
      ],
    });

    expect([...counts.values()].every((count) => count === 0)).toBe(true);
  });

  it("keeps every profile in the result, including the ones nothing credits", () => {
    const counts = countContributorReferences(ALL_PROFILES, {});

    expect([...counts.keys()].sort()).toEqual(ALL_PROFILES.map((entry) => entry.key).sort());
    expect([...counts.values()]).toEqual(ALL_PROFILES.map(() => 0));
  });

  it("collapses every source that lands on one effect page into a single credit list", () => {
    const pages = collectContributorReferencePages({
      effects: [{ slug: "tracers", contributors: ["Josie"], audio_replications: [{ artist: "Emex" }] }],
      replications: [
        { effect_slug: "tracers", artist: "StingrayZ" },
        { effect_slug: "tracers", artist: "StingrayZ" },
      ],
      reports: [{ slug: "trip", author: "nervewing", authorProfileKey: "NERVEWING" }],
    });

    expect(pages).toEqual([
      { id: "effect:tracers", names: ["Josie", "Emex", "StingrayZ"], profileKeys: [] },
      { id: "report:trip", names: ["nervewing"], profileKeys: ["NERVEWING"] },
    ]);
  });

  it("produces the same counts however the pages are ordered", () => {
    const input = {
      effects: [
        { slug: "one", contributors: ["Josie", "Kaylee"] },
        { slug: "two", contributors: ["Kaylee"] },
      ],
      reports: [{ slug: "trip", author: "nervewing" }],
    };
    const pages = collectContributorReferencePages(input);

    const forward = countContributorPageReferences(ALL_PROFILES, pages);
    const reversed = countContributorPageReferences([...ALL_PROFILES].reverse(), [...pages].reverse());

    expect(Object.fromEntries(reversed)).toEqual(Object.fromEntries(forward));
  });
});

describe("buildContributorRoster", () => {
  const referenceCounts = new Map<string, number>([
    ["JOSIE", 1],
    ["KAYTWO", 192],
    ["NERVEWING", 76],
    ["STINGRAYZ", 12],
    ["RHO", 0],
    ["VISCID", 1],
    ["LYREA", 40],
  ]);

  function keysOf(entries: readonly ContributorRosterEntry[]): string[] {
    return entries.map((entry) => entry.profile.key);
  }

  it("pins the founder out of the ranking even when her count is low", () => {
    const roster = buildContributorRoster({
      profiles: ALL_PROFILES,
      referenceCounts,
      founderKey: "JOSIE",
    });

    expect(roster.founder?.profile.key).toBe("JOSIE");
    expect(roster.founder?.referenceCount).toBe(1);
    // Kaytwo out-ranks her 192 to 1 and still does not take the top slot.
    expect(keysOf(roster.contributors)).not.toContain("JOSIE");
    expect(keysOf(roster.contributors)[0]).toBe("KAYTWO");
  });

  it("orders the rest by reference count, descending", () => {
    const roster = buildContributorRoster({
      profiles: ALL_PROFILES,
      referenceCounts,
      founderKey: "JOSIE",
    });

    expect(keysOf(roster.contributors)).toEqual([
      "KAYTWO",
      "NERVEWING",
      "LYREA",
      "STINGRAYZ",
      "VISCID",
      "RHO",
    ]);
    const counts = roster.contributors.map((entry) => entry.referenceCount);
    expect(counts).toEqual([...counts].sort((left, right) => right - left));
  });

  it("sorts zero-reference contributors last", () => {
    const roster = buildContributorRoster({
      profiles: ALL_PROFILES,
      referenceCounts: new Map([["RHO", 0], ["VISCID", 1]]),
      founderKey: "JOSIE",
    });

    // Everyone missing from the map counts as zero, so only Viscid outranks them, and the
    // zeroes fall to the back in display-name order rather than being dropped.
    expect(keysOf(roster.contributors)).toEqual([
      "VISCID",
      "KAYTWO",
      "LYREA",
      "NERVEWING",
      "RHO",
      "STINGRAYZ",
    ]);
    expect(roster.contributors.slice(1).every((entry) => entry.referenceCount === 0)).toBe(true);
  });

  it("breaks count ties deterministically, whatever order the profiles arrive in", () => {
    const tied = new Map<string, number>([
      ["VISCID", 1],
      ["KAYTWO", 1],
      ["NERVEWING", 1],
      ["STINGRAYZ", 1],
      ["RHO", 1],
      ["LYREA", 1],
    ]);

    const forward = buildContributorRoster({
      profiles: ALL_PROFILES,
      referenceCounts: tied,
      founderKey: "JOSIE",
    });
    const reversed = buildContributorRoster({
      profiles: [...ALL_PROFILES].reverse(),
      referenceCounts: tied,
      founderKey: "JOSIE",
    });

    // Display name decides, so the tie order is alphabetical and stable between builds.
    expect(keysOf(forward.contributors)).toEqual([
      "KAYTWO",
      "LYREA",
      "NERVEWING",
      "RHO",
      "STINGRAYZ",
      "VISCID",
    ]);
    expect(keysOf(reversed.contributors)).toEqual(keysOf(forward.contributors));
  });

  it("falls back to the profile key when two profiles share a display name", () => {
    const twinA = profile("TWIN_A", "Twin");
    const twinB = profile("TWIN_B", "Twin");

    const roster = buildContributorRoster({
      profiles: [twinB, twinA],
      referenceCounts: new Map([["TWIN_A", 3], ["TWIN_B", 3]]),
    });

    expect(keysOf(roster.contributors)).toEqual(["TWIN_A", "TWIN_B"]);
  });

  it("drops excluded keys entirely, matching on key rather than display name", () => {
    const roster = buildContributorRoster({
      profiles: ALL_PROFILES,
      referenceCounts,
      founderKey: "JOSIE",
      excludedKeys: ["lyrea"],
    });

    expect(keysOf(roster.contributors)).not.toContain("LYREA");
    expect(roster.contributors).toHaveLength(ALL_PROFILES.length - 2);
  });

  it("pins staff out of the ranking, between the founder and the contributors", () => {
    const roster = buildContributorRoster({
      profiles: ALL_PROFILES,
      referenceCounts,
      founderKey: "JOSIE",
      staffKeys: ["lyrea"],
    });

    // Matched on the normalized key, like the founder pin.
    expect(keysOf(roster.staff)).toEqual(["LYREA"]);
    expect(roster.staff[0]?.referenceCount).toBe(40);
    // No double-appearance: a staff member leaves the ranked grid entirely, and the
    // ranking of everybody else is what it was without her.
    expect(keysOf(roster.contributors)).toEqual([
      "KAYTWO",
      "NERVEWING",
      "STINGRAYZ",
      "VISCID",
      "RHO",
    ]);
  });

  it("builds an empty staff tier when none is configured", () => {
    const roster = buildContributorRoster({
      profiles: ALL_PROFILES,
      referenceCounts,
      founderKey: "JOSIE",
    });

    expect(roster.staff).toEqual([]);
  });

  it("attaches role overrides as display-only data, leaving the profile untouched", () => {
    const roster = buildContributorRoster({
      profiles: ALL_PROFILES,
      referenceCounts,
      founderKey: "JOSIE",
      staffKeys: ["LYREA"],
      roleOverrides: { lyrea: "Administrator" },
    });

    expect(roster.staff[0]?.roleOverride).toBe("Administrator");
    // The very same profile object, stored role and all — nothing was rewritten.
    expect(roster.staff[0]?.profile).toBe(LYREA);
    expect(roster.staff[0]?.profile.role).toBe("Founder");
    // Nobody outside the override map picks one up.
    expect(roster.contributors.every((entry) => entry.roleOverride === undefined)).toBe(true);
  });

  it("still renders a roster when the pinned founder has no profile", () => {
    const roster = buildContributorRoster({
      profiles: [KAYTWO, RHO],
      referenceCounts,
      founderKey: "JOSIE",
    });

    expect(roster.founder).toBeNull();
    expect(keysOf(roster.contributors)).toEqual(["KAYTWO", "RHO"]);
  });
});

describe("selectAboutContributors", () => {
  const referenceCounts = new Map<string, number>([
    ["JOSIE", 227],
    ["KAYTWO", 192],
    ["NERVEWING", 76],
    ["STINGRAYZ", 12],
    ["VISCID", 1],
    ["LYREA", 40],
  ]);
  const curatedFounderProfiles = [LYREA, JOSIE];

  it("lists every Effect Index contributor, reviewers included", () => {
    const selection = selectAboutContributors({
      isEffectIndex: true,
      allProfiles: ALL_PROFILES,
      curatedFounderProfiles,
      referenceCounts,
    });

    const listed = [
      ...(selection.roster?.founder ? [selection.roster.founder.profile.key] : []),
      ...(selection.roster?.staff ?? []).map((entry) => entry.profile.key),
      ...(selection.roster?.contributors ?? []).map((entry) => entry.profile.key),
    ];

    expect(listed).toEqual([
      "JOSIE",
      "LYREA",
      "KAYTWO",
      "NERVEWING",
      "STINGRAYZ",
      "VISCID",
      "RHO",
    ]);
    // Every profile appears exactly once across the three tiers.
    expect(listed).toHaveLength(ALL_PROFILES.length);
  });

  it("lists Lyrea on both publications: pinned staff here, curated founder on dose.wiki", () => {
    const effectIndex = selectAboutContributors({
      isEffectIndex: true,
      allProfiles: ALL_PROFILES,
      curatedFounderProfiles,
      referenceCounts,
    });
    const dosewiki = selectAboutContributors({
      isEffectIndex: false,
      allProfiles: ALL_PROFILES,
      curatedFounderProfiles,
      referenceCounts,
    });

    expect(EFFECT_INDEX_EXCLUDED_CONTRIBUTOR_KEYS).toEqual([]);
    expect(EFFECT_INDEX_STAFF_KEYS).toEqual(["LYREA"]);
    // Staff, not contributor: she appears once, in the pinned tier above the ranking.
    expect((effectIndex.roster?.staff ?? []).map((entry) => entry.profile.key)).toEqual(["LYREA"]);
    expect(
      (effectIndex.roster?.contributors ?? []).map((entry) => entry.profile.key),
    ).not.toContain("LYREA");
    // The founder pin is unaffected: the staff tier sits below her, not in her slot.
    expect(effectIndex.roster?.founder?.profile.key).toBe("JOSIE");

    expect(dosewiki.founderProfiles.map((entry) => entry.key)).toContain("LYREA");
  });

  it("re-badges Lyrea as Administrator on Effect Index without touching her stored role", () => {
    const effectIndex = selectAboutContributors({
      isEffectIndex: true,
      allProfiles: ALL_PROFILES,
      curatedFounderProfiles,
      referenceCounts,
    });
    const dosewiki = selectAboutContributors({
      isEffectIndex: false,
      allProfiles: ALL_PROFILES,
      curatedFounderProfiles,
      referenceCounts,
    });

    expect(EFFECT_INDEX_ROLE_OVERRIDES).toEqual({ LYREA: "Administrator" });

    const staffLyrea = effectIndex.roster?.staff.find((entry) => entry.profile.key === "LYREA");
    expect(staffLyrea?.roleOverride).toBe("Administrator");
    // The card's credit line keeps the familiar `role · count` shape.
    expect(staffLyrea && formatContributorRosterSubtitle(staffLyrea)).toBe(
      "Administrator · 40 pages",
    );
    // She did found dose.wiki: the stored role stays "Founder" and the curated branch
    // hands the profile through untouched.
    expect(staffLyrea?.profile.role).toBe("Founder");
    expect(dosewiki.founderProfiles.find((entry) => entry.key === "LYREA")?.role).toBe("Founder");
  });

  it("leaves dose.wiki's curated list, its order and its heading untouched", () => {
    const selection = selectAboutContributors({
      isEffectIndex: false,
      allProfiles: ALL_PROFILES,
      curatedFounderProfiles,
      referenceCounts,
    });

    // The editor's order, not the reference ranking: Josie out-references Lyrea 227 to 40
    // and still comes second, exactly as the curated list says.
    expect(selection.founderProfiles).toEqual(curatedFounderProfiles);
    expect(selection.roster).toBeNull();
    expect(selection.sectionTitle).toBe(CURATED_FOUNDERS_SECTION_TITLE);
  });

  it("names the Effect Index section for what it now shows", () => {
    const selection = selectAboutContributors({
      isEffectIndex: true,
      allProfiles: ALL_PROFILES,
      curatedFounderProfiles,
      referenceCounts,
    });

    expect(selection.sectionTitle).toBe(CONTRIBUTOR_ROSTER_SECTION_TITLE);
    expect(selection.founderProfiles).toEqual([]);
    expect(selection.roster?.founder?.profile.key).toBe(EFFECT_INDEX_FOUNDER_KEY);
  });

  it("survives an empty contributor table", () => {
    const selection = selectAboutContributors({
      isEffectIndex: true,
      allProfiles: [],
      curatedFounderProfiles: [],
    });

    expect(selection.roster).toEqual({ founder: null, staff: [], contributors: [] });
  });
});

describe("contributor credit lines", () => {
  it("pluralises and thousands-separates the page count", () => {
    expect(formatContributorReferenceCount(0)).toBeNull();
    expect(formatContributorReferenceCount(-3)).toBeNull();
    expect(formatContributorReferenceCount(Number.NaN)).toBeNull();
    expect(formatContributorReferenceCount(1)).toBe("1 page");
    expect(formatContributorReferenceCount(12)).toBe("12 pages");
    expect(formatContributorReferenceCount(1234)).toBe("1,234 pages");
  });

  it("combines a role with the page count, and degrades when either is missing", () => {
    const withRole: ContributorRosterEntry = {
      profile: profile("JOSIE", "Josie Kins", { role: "Founder" }),
      referenceCount: 227,
    };

    expect(formatContributorRosterSubtitle(withRole)).toBe("Founder · 227 pages");
    expect(formatContributorRosterSubtitle({ ...withRole, referenceCount: 0 })).toBe("Founder");
    expect(formatContributorRosterSubtitle({ profile: RHO, referenceCount: 12 })).toBe("12 pages");
    // No role, no references: nothing to say, so the card falls back to its `@key` subtitle.
    expect(formatContributorRosterSubtitle({ profile: RHO, referenceCount: 0 })).toBeUndefined();
  });

  it("prefers the roster's display override over the stored role and any fallback", () => {
    const overridden: ContributorRosterEntry = {
      profile: profile("LYREA", "Lyrea", { role: "Founder" }),
      referenceCount: 141,
      roleOverride: "Administrator",
    };

    expect(formatContributorRosterSubtitle(overridden)).toBe("Administrator · 141 pages");
    expect(formatContributorRosterSubtitle({ ...overridden, referenceCount: 0 })).toBe(
      "Administrator",
    );
    expect(formatContributorRosterSubtitle(overridden, { roleFallback: "Founder" })).toBe(
      "Administrator · 141 pages",
    );
  });

  it("uses the supplied role fallback only when the profile carries none", () => {
    expect(
      formatContributorRosterSubtitle(
        { profile: profile("JOSIE", "Josie Kins"), referenceCount: 0 },
        { roleFallback: "Founder" },
      ),
    ).toBe("Founder");
    expect(
      formatContributorRosterSubtitle(
        { profile: profile("JOSIE", "Josie Kins", { role: "Site Founder" }), referenceCount: 0 },
        { roleFallback: "Founder" },
      ),
    ).toBe("Site Founder");
  });
});

/**
 * The credited-identity import gives every name in the corpus an ordinary profile, so the
 * Effect Index roster grows with it. That is the intended behaviour, not a leak — but it is a
 * large, public, one-way-looking change, so these tests pin down that the growth is exactly
 * "one row in, one name on the page", that it is decided in one place, and that narrowing it
 * later is a one-line edit rather than a rewrite.
 */
describe("roster membership policy", () => {
  const LIVE_PROFILE_KEYS = [
    "GABRIEL", "GRAHAM", "HYPNAGOGIST", "JOSIE", "KAYTWO", "LYREA", "MAETHOR",
    "NATALIE", "NERVEWING", "RHO", "STINGRAYZ", "UTHERAPTOR", "VISCID",
  ] as const;

  const LIVE_PROFILES = LIVE_PROFILE_KEYS.map((key) =>
    profile(key, key.charAt(0) + key.slice(1).toLowerCase()),
  );

  /** Six of the seventy-one rows the import writes, including the third parties. */
  const IMPORTED_PROFILES = [
    profile("COLDWASABI", "Cold Wasabi", { role: "Replication Artist" }),
    profile("PHOSFORM", "Phosform", { role: "Replication Artist" }),
    profile("ZDZISLAWBEKSINSKI", "Zdzisław Beksiński"),
    profile("HRGIGER", "H. R. Giger"),
    profile("ALEXGREY", "Alex Grey"),
    profile("CHELSEAMORGAN", "Chelsea Morgan", { role: "Replication Artist" }),
  ];

  const referenceCounts = new Map<string, number>([
    ...LIVE_PROFILES.map((entry, index) => [entry.key, 100 + index] as const),
    ...IMPORTED_PROFILES.map((entry) => [entry.key, 1] as const),
  ]);

  function rosterKeys(profiles: readonly NormalizedUserProfile[]): string[] {
    const roster = buildContributorRoster({
      profiles,
      referenceCounts,
      founderKey: EFFECT_INDEX_FOUNDER_KEY,
      excludedKeys: EFFECT_INDEX_EXCLUDED_CONTRIBUTOR_KEYS,
    });

    return [
      ...(roster.founder ? [roster.founder.profile.key] : []),
      ...roster.contributors.map((entry) => entry.profile.key),
    ];
  }

  it("adds every imported profile to the roster, on the same terms as anyone else", () => {
    const before = rosterKeys(LIVE_PROFILES);
    const after = rosterKeys([...LIVE_PROFILES, ...IMPORTED_PROFILES]);

    expect(before).toHaveLength(LIVE_PROFILES.length - EFFECT_INDEX_EXCLUDED_CONTRIBUTOR_KEYS.length);
    expect(after).toHaveLength(before.length + IMPORTED_PROFILES.length);
    // Third parties included: the owner asked for no special casing, so there is none.
    expect(after).toContain("ZDZISLAWBEKSINSKI");
    expect(after).toContain("ALEXGREY");
  });

  it("ranks the newcomers by the same count rule, so they land where their credits put them", () => {
    const after = rosterKeys([...LIVE_PROFILES, ...IMPORTED_PROFILES]);

    // One page each puts all six at the bottom, alphabetically among themselves.
    expect(after.slice(-IMPORTED_PROFILES.length)).toEqual([
      "ALEXGREY", "CHELSEAMORGAN", "COLDWASABI", "HRGIGER", "PHOSFORM", "ZDZISLAWBEKSINSKI",
    ]);
  });

  it("keeps the excluded-key gate an empty per-publication exception, not a growth mechanism", () => {
    // Emptied when expert reviews started counting as contributions; the gate itself is
    // pinned by `buildContributorRoster`'s excluded-keys test above.
    expect(EFFECT_INDEX_EXCLUDED_CONTRIBUTOR_KEYS).toEqual([]);
    expect(rosterKeys([...LIVE_PROFILES, ...IMPORTED_PROFILES])).toContain("LYREA");
  });

  it("decides membership in one place, and narrowing it there is the whole veto", () => {
    const everyone = [...LIVE_PROFILES, ...IMPORTED_PROFILES];
    expect(everyone.every((entry) => isRosterMember({ profile: entry, referenceCount: 1 }))).toBe(true);

    // The veto the owner may want: keep only profiles the archive credits more than once.
    // Reproduced here rather than configured, to show it is a one-line body change.
    const narrowed = everyone.filter(
      (entry) => (referenceCounts.get(entry.key) ?? 0) > 1 || entry.key === EFFECT_INDEX_FOUNDER_KEY,
    );
    expect(rosterKeys(narrowed)).toEqual(rosterKeys(LIVE_PROFILES));
  });

  it("never drops the pinned founder, whatever the policy says", () => {
    const roster = buildContributorRoster({
      profiles: [profile("JOSIE", "Josie Kins")],
      referenceCounts: new Map(),
      founderKey: EFFECT_INDEX_FOUNDER_KEY,
    });

    expect(roster.founder?.profile.key).toBe("JOSIE");
  });
});
