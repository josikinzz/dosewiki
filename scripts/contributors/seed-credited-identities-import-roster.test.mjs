import { describe, expect, it } from "vitest";

import {
  buildImportEntries,
  buildSeedPlan,
  countPageReferences,
  mergeWithStoredProfile,
  previewRosterImpact,
} from "./seed-credited-identities.mjs";
import {
  LIVE_PROFILES,
  profile,
  replication,
  report,
} from "./seed-credited-identities-fixtures.mjs";

describe("mergeWithStoredProfile", () => {
  const planned = {
    key: "PHOSFORM",
    displayName: "Phosform",
    aliases: ["phosform"],
    bio: "",
    role: "Replication Artist",
    links: [{ label: "example.com", url: "https://example.com/" }],
  };

  it("creates a row when nothing is stored", () => {
    expect(mergeWithStoredProfile(planned, undefined).action).toBe("create");
  });

  it("never clobbers a bio, a title or curated links", () => {
    const stored = {
      key: "PHOSFORM",
      displayName: "Phosform",
      aliases: ["phosform"],
      bio: "A bio somebody wrote by hand.",
      role: "Founder",
      links: [{ label: "curated", url: "https://curated.example/" }],
      avatarStorageId: "kg2abc",
      membershipEmail: "phosform@example.com",
      createdAt: "2024-01-01T00:00:00.000Z",
    };

    const { entry, action } = mergeWithStoredProfile(planned, stored);

    expect(action).toBe("unchanged");
    expect(entry.bio).toBe("A bio somebody wrote by hand.");
    expect(entry.role).toBe("Founder");
    expect(entry.links).toEqual(stored.links);
    // bulkImport patches every field it is given, so the fields the public read
    // cannot see have to survive the merge or they are cleared.
    expect(entry.avatarStorageId).toBe("kg2abc");
    expect(entry.membershipEmail).toBe("phosform@example.com");
    expect(entry.createdAt).toBe("2024-01-01T00:00:00.000Z");
  });

  it("adds aliases without removing the stored ones", () => {
    const { entry, action, changedFields } = mergeWithStoredProfile(
      { ...planned, key: "STINGRAYZ", aliases: ["symmetric vision"] },
      { key: "STINGRAYZ", displayName: "StingrayZ", aliases: ["stingrayz"], bio: "x", links: [] },
    );

    expect(action).toBe("update");
    expect(changedFields).toContain("aliases");
    expect(entry.aliases).toEqual(["stingrayz", "symmetric vision"]);
  });

  it("is a no-op on a second run", () => {
    const first = mergeWithStoredProfile(planned, undefined);
    const second = mergeWithStoredProfile(planned, {
      ...first.entry,
      // What Postgres hands back after the first write.
      createdAt: "2026-08-10T00:00:00.000Z",
      updatedAt: "2026-08-10T00:00:00.000Z",
    });

    expect(second.action).toBe("unchanged");
    expect(second.changedFields).toEqual([]);
  });
});

describe("buildImportEntries", () => {
  it("writes the alias additions before any new row", () => {
    const plan = buildSeedPlan({
      profiles: LIVE_PROFILES,
      replications: [replication("Symmetric Vision"), replication("Phosform")],
      reports: [],
    });

    const entries = buildImportEntries(
      plan,
      new Map(LIVE_PROFILES.map((entry) => [entry.key, entry])),
    );

    expect(entries[0].reason).toBe("alias addition");
    expect(entries.at(-1).reason).toBe("credited identity");
    expect(entries.map((entry) => entry.entry.key)).toContain("PHOSFORM");
  });

  it("carries no key the plan did not produce", () => {
    const plan = buildSeedPlan({ profiles: LIVE_PROFILES, replications: [], reports: [] });
    const entries = buildImportEntries(plan, new Map(LIVE_PROFILES.map((e) => [e.key, e])));

    expect(entries.every((entry) => typeof entry.entry.key === "string" && entry.entry.key.length > 0)).toBe(true);
  });
});

describe("possible merges", () => {
  it("gives a thin-evidence merge candidate its own profile and reports it", () => {
    const plan = buildSeedPlan({
      profiles: [...LIVE_PROFILES, profile("NATALIE", "Natalie", { aliases: ["natalie"] })],
      replications: [],
      reports: [report("BluuRae"), report("Pluralist-Art")],
    });

    // Created, not aliased: an alias applied on a hunch credits one person's
    // work to another, and that is the harder mistake to notice.
    expect(plan.created.map((row) => row.key)).toEqual(
      expect.arrayContaining(["BLUURAE", "PLURALIST-ART"]),
    );
    expect(plan.possibleMerges.map((entry) => [entry.key, entry.candidateKey])).toEqual([
      ["BLUURAE", "NATALIE"],
      ["PLURALIST-ART", "RHO"],
    ]);
  });
});

/**
 * The roster preview is the part of the run a human is meant to act on, so it is
 * tested like an output the owner will trust: exact before, exact after, exact
 * list of names that newly appear.
 */
describe("previewRosterImpact", () => {
  const profiles = [
    profile("JOSIE", "Josie Kins", { aliases: ["josie", "josie kins"] }),
    profile("STINGRAYZ", "StingrayZ", { aliases: ["stingrayz"] }),
    profile("LYREA", "Lyrea", { aliases: ["oldhandle"] }),
  ];

  const corpus = {
    profiles,
    replications: [
      { slug: "a", effect_slug: "geometry", artist: "Symmetric Vision" },
      { slug: "b", effect_slug: "tracers", artist: "Symmetric Vision" },
      { slug: "c", effect_slug: "drifting", artist: "Phosform" },
      { slug: "d", effect_slug: "drifting", artist: "Zdzisław Beksiński" },
    ],
    reports: [{ slug: "r1", subject: { name: "froggie" } }],
  };
  const effects = [
    { slug: "geometry", contributors: ["Josie"] },
    { slug: "tracers", contributors: [] },
    { slug: "drifting", contributors: [] },
  ];

  const plan = buildSeedPlan(corpus);
  const roster = previewRosterImpact({ ...corpus, plan, effects });

  it("counts the roster today without the import", () => {
    // Lyrea is excluded from the Effect Index roster by key, as she is today.
    expect(roster.before.map((entry) => entry.key)).toEqual(["JOSIE", "STINGRAYZ"]);
    // StingrayZ currently matches nothing: the sixty "Symmetric Vision" works
    // are the whole point of the alias merge.
    expect(roster.before.find((entry) => entry.key === "STINGRAYZ").referenceCount).toBe(0);
  });

  it("names every profile that newly appears, in the position it would take", () => {
    expect(roster.added.map((entry) => [entry.position, entry.displayName])).toEqual([
      // One page each, so they tie and sort by display name, exactly as
      // `compareRosterEntries` would order them on the page.
      [3, "froggie"],
      [4, "Phosform"],
      [5, "Zdzisław Beksiński"],
    ]);
    expect(roster.after).toHaveLength(roster.before.length + roster.added.length);
  });

  it("flags the third parties by name, because that is the surprising part", () => {
    expect(
      roster.added.filter((entry) => entry.notableThirdParty).map((entry) => entry.displayName),
    ).toEqual(["Zdzisław Beksiński"]);
  });

  it("shows the credit count the alias merge moves", () => {
    expect(roster.movedByAlias.map((entry) => [entry.displayName, entry.wasReferenceCount, entry.referenceCount])).toEqual([
      ["StingrayZ", 0, 2],
    ]);
  });

  it("counts one page once however many times it names the same person", () => {
    const counts = countPageReferences(
      [{ key: "JOSIE", displayName: "Josie Kins", aliases: ["josie"] }],
      {
        effects: [{ slug: "tracers", contributors: ["Josie", "Josie Kins"] }],
        replications: [{ effect_slug: "tracers", artist: "Josie" }],
      },
    );

    expect(counts.get("JOSIE")).toBe(1);
  });
});
