import { describe, expect, it } from "vitest";

import {
  addAlias,
  applyOrderDrag,
  buildContributorPatch,
  buildOwnContributorPatch,
  curateSlug,
  filterContributors,
  isContributorFormDirty,
  matchesContributorSearch,
  moveCuratedSlug,
  ordersEqual,
  sortReports,
  sortWorks,
  splitByOrder,
  toContributorForm,
  uncurateSlug,
  type EditorContributorProfile,
} from "./contributorsModel";

const entry = {
  key: "JOSIE",
  displayName: "Josie",
  aliases: ["gremblin", "j. kinz"],
};

const profile: EditorContributorProfile = {
  key: "JOSIE",
  displayName: "Josie",
  aliases: ["gremblin"],
  bio: "A bio.",
  role: "Editor",
  links: [{ label: "Site", url: "https://example.com" }],
  membershipEmail: "josie@example.com",
  avatarUrl: null,
  avatarStorageId: null,
  storedAvatarUrl: null,
  replicationOrder: [],
  reportOrder: [],
  exclude_from_gallery: false,
  archival: false,
  approved_replicator: false,
  staffNote: null,
  updatedAt: null,
  updatedBy: null,
};

describe("matchesContributorSearch", () => {
  it("matches on display name, key, and alias", () => {
    expect(matchesContributorSearch(entry, "jos")).toBe(true);
    expect(matchesContributorSearch(entry, "JOSIE")).toBe(true);
    expect(matchesContributorSearch(entry, "gremb")).toBe(true);
  });

  it("returns every entry for an empty query and none for a miss", () => {
    expect(matchesContributorSearch(entry, "  ")).toBe(true);
    expect(matchesContributorSearch(entry, "nobody")).toBe(false);
    expect(filterContributors([entry], "nobody")).toEqual([]);
  });
});

describe("splitByOrder", () => {
  const items = [{ slug: "a" }, { slug: "b" }, { slug: "c" }];

  it("puts curated items first in stored order and leaves the rest in default sort", () => {
    const split = splitByOrder(items, ["c", "a"]);
    expect(split.curated.map((item) => item.slug)).toEqual(["c", "a"]);
    expect(split.auto.map((item) => item.slug)).toEqual(["b"]);
    expect(split.danglingSlugs).toEqual([]);
  });

  it("reports curated slugs that no longer resolve instead of dropping them silently", () => {
    const split = splitByOrder(items, ["ghost", "b"]);
    expect(split.curated.map((item) => item.slug)).toEqual(["b"]);
    expect(split.danglingSlugs).toEqual(["ghost"]);
  });

  it("ignores a duplicated slug in the stored order", () => {
    const split = splitByOrder(items, ["a", "a"]);
    expect(split.curated.map((item) => item.slug)).toEqual(["a"]);
    expect(split.auto.map((item) => item.slug)).toEqual(["b", "c"]);
  });

  it("treats an empty order as everything auto-sorted", () => {
    const split = splitByOrder(items, []);
    expect(split.curated).toEqual([]);
    expect(split.auto).toHaveLength(3);
  });
});

describe("curation edits", () => {
  it("curates at the end by default and at a position when asked", () => {
    expect(curateSlug(["a", "b"], "c")).toEqual(["a", "b", "c"]);
    expect(curateSlug(["a", "b"], "c", 0)).toEqual(["c", "a", "b"]);
  });

  it("re-curating an already curated slug moves it rather than duplicating it", () => {
    expect(curateSlug(["a", "b", "c"], "c", 0)).toEqual(["c", "a", "b"]);
  });

  it("un-curates by removing the slug", () => {
    expect(uncurateSlug(["a", "b"], "a")).toEqual(["b"]);
    expect(uncurateSlug(["a", "b"], "z")).toEqual(["a", "b"]);
  });

  it("moves a curated slug up and down, and stops at the ends", () => {
    expect(moveCuratedSlug(["a", "b", "c"], "b", "up")).toEqual(["b", "a", "c"]);
    expect(moveCuratedSlug(["a", "b", "c"], "b", "down")).toEqual(["a", "c", "b"]);
    expect(moveCuratedSlug(["a", "b"], "a", "up")).toEqual(["a", "b"]);
    expect(moveCuratedSlug(["a", "b"], "b", "down")).toEqual(["a", "b"]);
  });
});

describe("applyOrderDrag", () => {
  const curatedSlugs = ["a", "b", "c"];

  it("moves a curated item down onto its target's position", () => {
    expect(
      applyOrderDrag({ order: ["a", "b", "c"], activeSlug: "a", overSlug: "c", curatedSlugs }),
    ).toEqual(["b", "c", "a"]);
  });

  it("moves a curated item up onto its target's position", () => {
    expect(
      applyOrderDrag({ order: ["a", "b", "c"], activeSlug: "c", overSlug: "a", curatedSlugs }),
    ).toEqual(["c", "a", "b"]);
  });

  it("curates an auto item dragged above the divider onto a curated slot", () => {
    expect(
      applyOrderDrag({
        order: ["a", "b"],
        activeSlug: "x",
        overSlug: "b",
        curatedSlugs: ["a", "b"],
      }),
    ).toEqual(["a", "x", "b"]);
  });

  it("un-curates an item dragged onto the auto section", () => {
    expect(
      applyOrderDrag({
        order: ["a", "b"],
        activeSlug: "a",
        overSlug: "z",
        curatedSlugs: ["a", "b"],
      }),
    ).toEqual(["b"]);
  });

  it("leaves the order alone when an item is dropped on itself", () => {
    expect(applyOrderDrag({ order: ["a", "b"], activeSlug: "a", overSlug: "a", curatedSlugs })).toEqual([
      "a",
      "b",
    ]);
  });
});

describe("ordersEqual", () => {
  it("compares by sequence, not by membership", () => {
    expect(ordersEqual(["a", "b"], ["a", "b"])).toBe(true);
    expect(ordersEqual(["a", "b"], ["b", "a"])).toBe(false);
    expect(ordersEqual(["a"], ["a", "b"])).toBe(false);
  });
});

describe("default sorts", () => {
  it("sorts works newest first and undated last", () => {
    const sorted = sortWorks([
      {
        slug: "old",
        title: "",
        artist: "",
        role: "",
        type: "",
        effectSlug: null,
        createdAt: "2024-01-01",
        thumbnailUrl: null,
      },
      {
        slug: "none",
        title: "",
        artist: "",
        role: "",
        type: "",
        effectSlug: null,
        createdAt: null,
        thumbnailUrl: null,
      },
      {
        slug: "new",
        title: "",
        artist: "",
        role: "",
        type: "",
        effectSlug: null,
        createdAt: "2026-01-01",
        thumbnailUrl: null,
      },
    ]);
    expect(sorted.map((work) => work.slug)).toEqual(["new", "old", "none"]);
  });

  it("sorts reports by trip date, newest first", () => {
    const sorted = sortReports([
      { slug: "a", title: "", authorName: "", tripDate: "2020-05-01", featured: false },
      { slug: "b", title: "", authorName: "", tripDate: "2023-05-01", featured: false },
    ]);
    expect(sorted.map((report) => report.slug)).toEqual(["b", "a"]);
  });
});

describe("the profile form", () => {
  it("round-trips a profile without reporting a change", () => {
    expect(isContributorFormDirty(profile, toContributorForm(profile), false)).toBe(false);
  });

  it("treats a pending avatar upload as a change on its own", () => {
    expect(isContributorFormDirty(profile, toContributorForm(profile), true)).toBe(true);
  });

  it("notices an edited field", () => {
    const form = { ...toContributorForm(profile), role: "Contributor" };
    expect(isContributorFormDirty(profile, form, false)).toBe(true);
  });

  const clearableForm = {
    displayName: "  Josie  ",
    bio: "",
    role: "   ",
    membershipEmail: "",
    avatarUrl: "",
    aliases: ["  gremblin ", ""],
    links: [
      { label: "Site", url: "https://example.com" },
      { label: "", url: "https://dropped.example" },
    ],
    exclude_from_gallery: false,
    archival: false,
    approved_replicator: false,
    staffNoteMarkdown: "   ",
    staffNoteAttribution: "Someone",
  };

  it("sends null for emptied clearable fields and keeps an empty bio as a string", () => {
    const patch = buildContributorPatch(clearableForm, { canApprove: true });

    expect(patch).toEqual({
      displayName: "Josie",
      bio: "",
      role: null,
      membershipEmail: null,
      avatarUrl: null,
      aliases: ["gremblin"],
      links: [{ label: "Site", url: "https://example.com" }],
      exclude_from_gallery: false,
      archival: false,
      approved_replicator: false,
      // A blank note clears the field even when an attribution was left behind.
      staffNote: null,
    });
  });

  it("never names a trust field in an editor's patch, even unchanged", () => {
    const patch = buildContributorPatch(
      { ...clearableForm, role: "Founder", approved_replicator: true, staffNoteMarkdown: "Kept." },
      { canApprove: false },
    );

    expect(patch).toEqual({
      displayName: "Josie",
      bio: "",
      avatarUrl: null,
      aliases: ["gremblin"],
      links: [{ label: "Site", url: "https://example.com" }],
    });
    for (const field of [
      "role",
      "membershipEmail",
      "exclude_from_gallery",
      "archival",
      "approved_replicator",
      "staffNote",
    ]) {
      expect(patch).not.toHaveProperty(field);
    }
  });

  it("keeps the self-serve patch to name, bio, avatar, and links", () => {
    const patch = buildOwnContributorPatch({
      displayName: "  Josie  ",
      bio: "Hi.",
      role: "Admin",
      membershipEmail: "josie@example.com",
      avatarUrl: " https://cdn.example/josie.png ",
      aliases: ["gremblin"],
      links: [{ label: "Site", url: "https://example.com" }],
      exclude_from_gallery: true,
      archival: true,
      approved_replicator: true,
      staffNoteMarkdown: "self-awarded",
      staffNoteAttribution: "",
    });

    expect(patch).toEqual({
      displayName: "Josie",
      bio: "Hi.",
      avatarUrl: "https://cdn.example/josie.png",
      links: [{ label: "Site", url: "https://example.com" }],
    });
  });

  it("round-trips the gallery exclusion flag and notices it toggling", () => {
    const excluded: EditorContributorProfile = { ...profile, exclude_from_gallery: true };
    expect(toContributorForm(excluded).exclude_from_gallery).toBe(true);
    expect(isContributorFormDirty(excluded, toContributorForm(excluded), false)).toBe(false);

    const toggled = { ...toContributorForm(profile), exclude_from_gallery: true };
    expect(isContributorFormDirty(profile, toggled, false)).toBe(true);
    expect(buildContributorPatch(toggled, { canApprove: true }).exclude_from_gallery).toBe(true);
  });

  it("round-trips the archival flag and notices it toggling", () => {
    const archived: EditorContributorProfile = { ...profile, archival: true };
    expect(toContributorForm(archived).archival).toBe(true);
    expect(isContributorFormDirty(archived, toContributorForm(archived), false)).toBe(false);

    const toggled = { ...toContributorForm(profile), archival: true };
    expect(isContributorFormDirty(profile, toggled, false)).toBe(true);
    expect(buildContributorPatch(toggled, { canApprove: true }).archival).toBe(true);
  });

  it("round-trips the approved replicator flag and notices it toggling", () => {
    const approved: EditorContributorProfile = { ...profile, approved_replicator: true };
    expect(toContributorForm(approved).approved_replicator).toBe(true);
    expect(isContributorFormDirty(approved, toContributorForm(approved), false)).toBe(false);

    const toggled = { ...toContributorForm(profile), approved_replicator: true };
    expect(isContributorFormDirty(profile, toggled, false)).toBe(true);
    expect(buildContributorPatch(toggled, { canApprove: true }).approved_replicator).toBe(true);
  });

  it("round-trips the staff note and only sends an attribution beside a kept note", () => {
    const noted: EditorContributorProfile = {
      ...profile,
      staffNote: { markdown: "A **signed** note.", attribution: "Josie Kins · founder" },
    };
    const form = toContributorForm(noted);
    expect(form.staffNoteMarkdown).toBe("A **signed** note.");
    expect(form.staffNoteAttribution).toBe("Josie Kins · founder");
    expect(isContributorFormDirty(noted, form, false)).toBe(false);

    expect(buildContributorPatch(form, { canApprove: true }).staffNote).toEqual({
      markdown: "A **signed** note.",
      attribution: "Josie Kins · founder",
    });

    const unattributed = { ...form, staffNoteAttribution: "   " };
    expect(buildContributorPatch(unattributed, { canApprove: true }).staffNote).toEqual({
      markdown: "A **signed** note.",
    });
  });

  it("adds aliases without duplicating an existing one in another case", () => {
    expect(addAlias(["gremblin"], "Gremblin")).toEqual(["gremblin"]);
    expect(addAlias(["gremblin"], " zuwu ")).toEqual(["gremblin", "zuwu"]);
    expect(addAlias(["gremblin"], "  ")).toEqual(["gremblin"]);
  });
});
