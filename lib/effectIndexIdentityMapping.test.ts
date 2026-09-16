import { describe, expect, it } from "vitest";

import {
  EFFECT_INDEX_IDENTITIES,
  assertNoEmail,
  buildIdentityRows,
  collectLegacyTags,
  legacyMarkupToMarkdown,
  normalizeLegacyMarkdownBody,
  redactEmails,
  splitLegacyRoleHeading,
} from "../scripts/migrate/effectindex-identity-mapping.mjs";
import {
  findContributorProfileByKeyOrAlias,
  materializeContributorProfile,
  type MaterializedContributorProfile,
} from "./contributorProfileIdentity";

type ProfileRow = {
  key: string;
  displayName: string;
  aliases: string[];
  bio: string;
  links: { label: string; url: string }[];
  role?: string;
  avatarUrl?: string;
  avatarStorageId?: string;
  membershipEmail?: string;
  createdAt?: string;
  updatedBy: string;
};

// Trimmed stand-ins for the legacy export, keeping the shapes and the markup
// dialects that actually occur in it.
const legacyPeople = [
  {
    full_name: "Mark Gillis",
    alias: "Viscid",
    profile_url: "viscid",
    role: "Former Dev",
    social_media: [],
    bio: { raw: "I developed the software." },
  },
  {
    full_name: "Josie Kins",
    alias: "Josikinz",
    profile_url: "josie",
    role: "Founder",
    not_public: true,
    social_media: [{ type: "twitter", value: "https://twitter.com/josikinz" }],
    bio: { raw: "[p]Legacy Effect Index bio that must not replace the dose.wiki one.[/p]" },
  },
  {
    alias: "Maethor",
    profile_url: "maethor",
    role: "Former Dev",
    isPrivate: false,
    social_media: [{ type: "discord", value: "Subsequently#6930" }],
    bio: { raw: "[p]I am a software developer and former Effect Index systems administrator.[/p]" },
  },
  {
    alias: "utheraptor",
    profile_url: "utheraptor",
    role: "Neural Network Dev",
    social_media: [
      { type: "instagram", value: "utheraptor" },
      { type: "reddit", value: "u/utheraptor" },
    ],
    bio: {
      raw: [
        "[p]Hello, I am Uther.[/p]",
        "",
        "[p]I am many things - an artist, a blogger, a harm-reduction advisor, and a fellow psychonaut who documents effects.[/p]",
        "",
        "[ul]",
        '  [li]Instagram: [ext-link to="https://www.instagram.com/utheraptor/"]utheraptor[/ext-link][/li]',
        "[/ul]",
      ].join("\n"),
    },
  },
];

const legacyProfiles = [
  {
    username: "Viscid",
    body: "Hello my name is Viscid and I do most of the technical work on this site.\n\n",
  },
  {
    username: "Josie",
    body: "#### Project Manager / Site Founder\n\nLegacy Josie bio.",
  },
  {
    username: "Rho",
    body: [
      "#### Replication Artist",
      "",
      "Hi, my name is Rho. I am fascinated by the intersection of complex systems, philosophy, and art.",
      "",
      "- **Discord** - zenx2#6213",
      "- **Email** - rho.fixture@example.invalid",
      "- **Reddit** - [/u/zenx2](https://reddit.com/u/zenx2)",
    ].join("\n"),
  },
  {
    username: "StingrayZ",
    body: [
      "**StingrayZ** is a talented replication artist based in Latvia and a well-known contributor.",
      "",
      "His dedication to reproducing the psychedelic experience stems from extensive personal usage. He can be contacted at stingray.fixture@example.invalid",
      "",
      "#### SOCIAL MEDIA",
      "- **Patreon** - www.patreon.com/stingrayz",
    ].join("\n"),
  },
  {
    username: "Maethor",
    body: "I am a software developer and former Effect Index systems administrator, and you can find me in our [Discord chat](/discord-chat).",
  },
  { username: "nervewing", body: "My name is nervewing and I document hallucinogenic compound experiences at length." },
  { username: "Hypnagogist", body: "I transcribe my experiences as visual art, both traditional 2D and digital 3D works." },
  { username: "Natalie", body: "I am a proofreader for this project with an interest in psychoactive substances." },
];

// The rows the live deployment already holds for the two overlapping keys.
const existingLiveRows = new Map<string, Record<string, unknown>>([
  [
    "JOSIE",
    {
      key: "JOSIE",
      displayName: "Josie Kins",
      aliases: [],
      bio: "Hi, my name is josie and i have been learning web development ^_^",
      links: [{ label: "personal website", url: "https://josiekins.xyz/" }],
      avatarUrl: "/profile-avatars/josie/avatar.webp",
      createdAt: "2026-01-01T00:00:00.000Z",
    },
  ],
  [
    "NERVEWING",
    {
      key: "NERVEWING",
      displayName: "Nervewing",
      aliases: [],
      bio: "",
      links: [],
      avatarUrl: "/profile-avatars/nervewing/avatar.webp",
      createdAt: "2026-01-01T00:00:00.000Z",
    },
  ],
]);

const stagedAvatars = new Map(
  ["JOSIE", "VISCID", "MAETHOR", "UTHERAPTOR", "HYPNAGOGIST", "STINGRAYZ", "RHO", "NERVEWING"].map((key) => [
    key,
    `/profile-avatars/${key.toLowerCase()}/avatar.png`,
  ]),
);

const runMapping = (existingProfiles: Map<string, unknown>) =>
  buildIdentityRows({
    people: legacyPeople,
    profiles: legacyProfiles,
    existingProfiles,
    avatarUrlsByKey: stagedAvatars,
  }) as { rows: ProfileRow[]; reports: { key: string; action: string; role: string }[] };

const rowsByKey = (rows: ProfileRow[]) => new Map(rows.map((row) => [row.key, row]));

describe("Effect Index legacy bio markup", () => {
  it("converts the people.json bracket dialect to the Markdown the bio renderer styles", () => {
    const markdown = legacyMarkupToMarkdown(legacyPeople[3].bio.raw);

    expect(markdown).toBe(
      [
        "Hello, I am Uther.",
        "",
        "I am many things - an artist, a blogger, a harm-reduction advisor, and a fellow psychonaut who documents effects.",
        "",
        "- Instagram: [utheraptor](https://www.instagram.com/utheraptor/)",
      ].join("\n"),
    );
    expect(markdown).not.toMatch(/\[\/?(?:p|ul|li|ext-link)/);
  });

  it("refuses to publish a bio containing an unhandled legacy macro", () => {
    expect(collectLegacyTags('[p]a[/p][mystery-tag to="x"]b[/mystery-tag]')).toContain("mystery-tag");
    expect(() => legacyMarkupToMarkdown("[p]a[/p][mystery-tag]b[/mystery-tag]")).toThrow(
      /Unhandled Effect Index bio macro\(s\): mystery-tag/,
    );
  });

  it("promotes a leading role heading and demotes section headings to bold text", () => {
    expect(splitLegacyRoleHeading("#### Replication Artist\n\nBody.")).toEqual({
      role: "Replication Artist",
      body: "\nBody.",
    });

    const stingrayz = normalizeLegacyMarkdownBody(legacyProfiles[3].body);
    // "SOCIAL MEDIA" sits mid-body, so it is a section label rather than a title.
    expect(stingrayz.role).toBe("");
    expect(stingrayz.body).toContain("**SOCIAL MEDIA**");
    expect(stingrayz.body).not.toContain("#");
  });

  it("flattens legacy internal links whose targets do not exist on dose.wiki", () => {
    const maethor = normalizeLegacyMarkdownBody(legacyProfiles[4].body);

    expect(maethor.body).toContain("you can find me in our Discord chat.");
    expect(maethor.body).not.toContain("/discord-chat");
  });

  it("drops an email without taking the surrounding prose or list with it", () => {
    const stingrayz = normalizeLegacyMarkdownBody(legacyProfiles[3].body).body;
    expect(stingrayz).toContain("His dedication to reproducing the psychedelic experience stems from extensive personal usage.");
    expect(stingrayz).not.toContain("stingray.fixture");
    expect(stingrayz).not.toContain("contacted at");

    // The emptied list item is removed, keeping the remaining items tight.
    const rho = normalizeLegacyMarkdownBody(legacyProfiles[2].body).body;
    expect(rho).toContain("- **Discord** - zenx2#6213\n- **Reddit** - [/u/zenx2](https://reddit.com/u/zenx2)");
    expect(rho).not.toContain("Email");

    expect(redactEmails("Reach me at nobody@example.com. Otherwise wait.")).toBe("Otherwise wait.");
  });
});

describe("Effect Index identity mapping", () => {
  it("plans all nine public Effect Index identities", () => {
    const { rows, reports } = runMapping(existingLiveRows);

    expect(rows).toHaveLength(9);
    expect(rows.map((row) => row.key)).toEqual(EFFECT_INDEX_IDENTITIES.map((identity) => identity.key));
    expect(reports.filter((report) => report.action === "CREATE").map((report) => report.key)).toEqual([
      "VISCID",
      "MAETHOR",
      "UTHERAPTOR",
      "HYPNAGOGIST",
      "STINGRAYZ",
      "RHO",
      "NATALIE",
    ]);
  });

  it("carries the legacy role strings across and leaves untitled contributors without one", () => {
    const byKey = rowsByKey(runMapping(existingLiveRows).rows);

    expect(byKey.get("JOSIE")?.role).toBe("Founder");
    expect(byKey.get("VISCID")?.role).toBe("Former Dev");
    expect(byKey.get("MAETHOR")?.role).toBe("Former Dev");
    expect(byKey.get("UTHERAPTOR")?.role).toBe("Neural Network Dev");
    expect(byKey.get("RHO")?.role).toBe("Replication Artist");

    for (const key of ["HYPNAGOGIST", "STINGRAYZ", "NATALIE", "NERVEWING"]) {
      expect(Object.prototype.hasOwnProperty.call(byKey.get(key)!, "role")).toBe(false);
    }
  });

  it("keeps Josie's dose.wiki bio, links and avatar while filling Nervewing's empty bio", () => {
    const byKey = rowsByKey(runMapping(existingLiveRows).rows);
    const josie = byKey.get("JOSIE")!;

    expect(josie.bio).toBe("Hi, my name is josie and i have been learning web development ^_^");
    expect(josie.links).toEqual([{ label: "personal website", url: "https://josiekins.xyz/" }]);
    expect(josie.avatarUrl).toBe("/profile-avatars/josie/avatar.webp");
    expect(josie.createdAt).toBe("2026-01-01T00:00:00.000Z");

    expect(byKey.get("NERVEWING")?.bio).toContain("My name is nervewing");
  });

  it("points new profiles at staged avatars and leaves Natalie's unset", () => {
    const byKey = rowsByKey(runMapping(existingLiveRows).rows);

    expect(byKey.get("RHO")?.avatarUrl).toBe("/profile-avatars/rho/avatar.png");
    expect(Object.prototype.hasOwnProperty.call(byKey.get("NATALIE")!, "avatarUrl")).toBe(false);
  });

  it("never writes a legacy email address into a public bio", () => {
    const { rows } = runMapping(existingLiveRows);

    expect(() => assertNoEmail(rows)).not.toThrow();
    expect(() => assertNoEmail([{ key: "X", bio: "reach me at leak@example.com" }])).toThrow(
      /Refusing to import an email address/,
    );
  });
});

describe("Effect Index identity mapping idempotence", () => {
  it("produces the same rows when the previous run's output is the new baseline", () => {
    const first = runMapping(existingLiveRows);

    // Feed run one's rows back as the stored state, exactly as bulkImport would
    // have left them.
    const afterFirstRun = new Map<string, ProfileRow>(first.rows.map((row) => [row.key, row]));
    const second = runMapping(afterFirstRun);

    expect(second.rows).toEqual(first.rows);
    expect(second.reports.every((report) => report.action === "UPDATE")).toBe(true);
    expect(second.reports.filter((report) => report.role !== "none").every((report) => report.role === "preserved-existing")).toBe(true);

    // And a third pass, in case any field only stabilises after two rounds.
    expect(runMapping(new Map(second.rows.map((row) => [row.key, row]))).rows).toEqual(first.rows);
  });
});

describe("Effect Index profile alias resolution", () => {
  const materialized = runMapping(existingLiveRows)
    .rows.map((row) => materializeContributorProfile(row))
    .filter((profile): profile is MaterializedContributorProfile => profile !== null);

  it("resolves every new profile by its canonical key", () => {
    for (const identity of EFFECT_INDEX_IDENTITIES) {
      expect(findContributorProfileByKeyOrAlias(materialized, identity.key)?.key).toBe(identity.key);
    }
  });

  it("resolves old Effect Index URLs and credit strings through aliases", () => {
    const cases: [string, string][] = [
      ["mark gillis", "VISCID"],
      ["MARK GILLIS", "VISCID"],
      ["josikinz", "JOSIE"],
      ["josie kins", "JOSIE"],
      ["hypnagogist", "HYPNAGOGIST"],
      ["stingrayz", "STINGRAYZ"],
      ["utheraptor", "UTHERAPTOR"],
      ["rho", "RHO"],
      ["natalie", "NATALIE"],
      ["maethor", "MAETHOR"],
      ["nervewing", "NERVEWING"],
    ];

    for (const [lookup, expected] of cases) {
      expect(findContributorProfileByKeyOrAlias(materialized, lookup)?.key, lookup).toBe(expected);
    }

    expect(findContributorProfileByKeyOrAlias(materialized, "not-a-contributor")).toBeNull();
  });

  it("materializes the role through to the public profile shape", () => {
    expect(findContributorProfileByKeyOrAlias(materialized, "mark gillis")?.role).toBe("Former Dev");
    expect(findContributorProfileByKeyOrAlias(materialized, "natalie")?.role).toBeUndefined();
  });
});
