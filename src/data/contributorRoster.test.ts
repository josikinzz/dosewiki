import { describe, expect, it } from "vitest";

import {
  CONTRIBUTOR_ROSTER_SECTION_TITLE,
  CURATED_FOUNDERS_SECTION_TITLE,
  EFFECT_INDEX_EXCLUDED_CONTRIBUTOR_KEYS,
  EFFECT_INDEX_FOUNDER_KEY,
  buildContributorRoster,
  collectContributorReferencePages,
  countContributorPageReferences,
  countContributorReferences,
  dropAliasDuplicateProfiles,
  formatContributorReferenceCount,
  formatContributorRosterSubtitle,
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
const LYREA = profile("LYREA", "Lyrea", { aliases: ["witchy"] });

const ALL_PROFILES = [JOSIE, KAYTWO, LYREA, NERVEWING, RHO, STINGRAYZ, VISCID];

describe("dropAliasDuplicateProfiles", () => {
  it("keeps a profile that lists its own name among its aliases", () => {
    // Every row the Effect Index identity import wrote carries its lowercased key as an
    // alias. The shared `collapseContributorProfiles` reads that as an alias-duplicate row
    // and empties the table; the roster must not.
    expect(dropAliasDuplicateProfiles(ALL_PROFILES).map((entry) => entry.key)).toEqual(
      ALL_PROFILES.map((entry) => entry.key),
    );
  });

  it("still drops a row that is only an alias of another profile", () => {
    const canonical = profile("AUTHOR", "Author Name", { aliases: ["author", "old-author"] });
    const duplicate = profile("OLD-AUTHOR", "Old Author");
    const other = profile("OTHER", "Other");

    expect(
      dropAliasDuplicateProfiles([canonical, duplicate, other]).map((entry) => entry.key),
    ).toEqual(["AUTHOR", "OTHER"]);
  });

  it("ignores aliases that name no other profile", () => {
    const only = profile("VISCID", "Viscid", { aliases: ["viscid", "mark gillis"] });

    expect(dropAliasDuplicateProfiles([only])).toEqual([only]);
  });
});

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
        { slug: "aliased", author: "Anonymous", authorProfileKey: "witchy" },
      ],
    });

    expect(counts.get("JOSIE")).toBe(1);
    expect(counts.get("LYREA")).toBe(1);
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

  it("lists every Effect Index contributor except the excluded ones", () => {
    const selection = selectAboutContributors({
      isEffectIndex: true,
      allProfiles: ALL_PROFILES,
      curatedFounderProfiles,
      referenceCounts,
    });

    const listed = [
      ...(selection.roster?.founder ? [selection.roster.founder.profile.key] : []),
      ...(selection.roster?.contributors ?? []).map((entry) => entry.profile.key),
    ];

    expect(listed).toEqual(["JOSIE", "KAYTWO", "NERVEWING", "STINGRAYZ", "VISCID", "RHO"]);
    // Every profile appears, not just the curated founder subset.
    expect(listed).toHaveLength(ALL_PROFILES.length - EFFECT_INDEX_EXCLUDED_CONTRIBUTOR_KEYS.length);
  });

  it("excludes Lyrea on Effect Index but keeps her on dose.wiki", () => {
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

    expect(EFFECT_INDEX_EXCLUDED_CONTRIBUTOR_KEYS).toContain("LYREA");
    expect(effectIndex.roster?.founder?.profile.key).not.toBe("LYREA");
    expect(
      (effectIndex.roster?.contributors ?? []).map((entry) => entry.profile.key),
    ).not.toContain("LYREA");

    expect(dosewiki.founderProfiles.map((entry) => entry.key)).toContain("LYREA");
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

    expect(selection.roster).toEqual({ founder: null, contributors: [] });
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
