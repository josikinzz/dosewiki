import { describe, expect, it } from "vitest";

import { COPY_BLOCK_DEFAULTS } from "@/data/content/copyBlocks";
import {
  buildCopyStudioBlocks,
  canResetToDefault,
  copyBlockTwin,
  copyLengthGuide,
  copySearchMatch,
  countPlaceholders,
  draftFromBlock,
  draftToText,
  filterCopyStudioBlocks,
  groupCopyStudioBlocks,
  sectionCopyStudioGroups,
  isDraftDirty,
  openCopyProposals,
  placeholderChanges,
  resolveCopyPlaceholders,
  type CopyBlockRow,
} from "./copyStudioUtils";

const defaultBlock = COPY_BLOCK_DEFAULTS.find((entry) => entry.kind === "markdown")!;

function findBlock(key: string, rows: CopyBlockRow[] = []) {
  return buildCopyStudioBlocks(rows).find((block) => block.key === key)!;
}

describe("copy studio block reconciliation", () => {
  it("lists every checked-in default as an unsaved block", () => {
    const blocks = buildCopyStudioBlocks([]);

    expect(blocks).toHaveLength(COPY_BLOCK_DEFAULTS.length);
    expect(blocks.every((block) => block.source === "default")).toBe(true);
  });

  it("layers a stored row over its default and keeps the default as the reset target", () => {
    const block = findBlock(defaultBlock.key, [
      {
        key: defaultBlock.key,
        kind: "plain",
        body: "Stored wording",
        label: defaultBlock.label,
        group: defaultBlock.group,
        updatedBy: "editor@example.com",
      },
    ]);

    expect(block.source).toBe("data");
    expect(block.current.body).toBe("Stored wording");
    expect(block.fallback?.body).toBe(defaultBlock.body);
    expect(block.kind).toBe("markdown");
  });

  it("keeps a Postgres-only block editable but gives it no reset target", () => {
    const block = findBlock("data-only-block", [
      {
        key: "data-only-block",
        kind: "plain",
        body: "Added straight in Postgres",
        label: "Postgres only",
        group: "Home",
      },
    ]);

    expect(block.fallback).toBeNull();
    expect(canResetToDefault(block, draftFromBlock(block))).toBe(false);
  });

  it("treats a draft equal to the published value as clean", () => {
    const block = findBlock(defaultBlock.key);
    const draft = draftFromBlock(block);

    expect(isDraftDirty(block, draft)).toBe(false);
    expect(isDraftDirty(block, { ...draft, body: `${draft.body} more` })).toBe(true);
  });

  it("ignores blank list rows when deciding whether a list changed", () => {
    const listDefault = COPY_BLOCK_DEFAULTS.find((entry) => entry.kind === "list")!;
    const block = findBlock(listDefault.key);
    const draft = draftFromBlock(block);

    expect(isDraftDirty(block, { ...draft, items: [...draft.items, "   "] })).toBe(false);
    expect(isDraftDirty(block, { ...draft, items: [...draft.items, "new entry"] })).toBe(true);
  });

  it("renders a list draft as markdown bullets for the preview and diff", () => {
    expect(draftToText("list", { body: "", items: ["one", "two"] })).toBe("- one\n- two");
    expect(draftToText("plain", { body: "one", items: [] })).toBe("one");
  });

  it("groups blocks in first-seen order", () => {
    const groups = groupCopyStudioBlocks(buildCopyStudioBlocks([]));

    expect(groups[0]?.group).toBe(COPY_BLOCK_DEFAULTS[0].group);
    expect(new Set(groups.map((entry) => entry.group)).size).toBe(groups.length);
  });

  it("tiers every group under a section, and parks a group no section claims under Other", () => {
    const groups = groupCopyStudioBlocks(
      buildCopyStudioBlocks([
        { key: "zeta-new", kind: "plain", body: "a", label: "New thing", group: "Brand new group" },
      ]),
    );
    const sections = sectionCopyStudioGroups(groups);

    expect(sections.map((entry) => entry.section)).toEqual([
      "Site",
      "Substances",
      "Effects",
      "Docs",
      "SEO",
      "Other",
    ]);
    expect(sections.flatMap((entry) => entry.groups).length).toBe(groups.length);
    expect(sections.find((entry) => entry.section === "Docs")?.groups.map((entry) => entry.group)).toEqual([
      "Docs · Code",
      "Docs · How",
      "Docs · License",
    ]);
    expect(sections[sections.length - 1]?.groups.map((entry) => entry.group)).toEqual(["Brand new group"]);
    expect(sectionCopyStudioGroups([]).length).toBe(0);
  });

  it("finds blocks by key or label substring across every group, and none for a blank query", () => {
    const blocks = buildCopyStudioBlocks([
      { key: "zeta-hero", kind: "plain", body: "a", label: "Hero title", group: "Home" },
      { key: "zeta-footer", kind: "plain", body: "b", label: "Footer credit", group: "Footer" },
    ]);

    expect(filterCopyStudioBlocks(blocks, "ZETA").map((block) => block.key)).toEqual([
      "zeta-hero",
      "zeta-footer",
    ]);
    expect(filterCopyStudioBlocks(blocks, "footer CREDIT").map((block) => block.key)).toEqual([
      "zeta-footer",
    ]);
    const aboutMatches = filterCopyStudioBlocks(blocks, "about-");
    const byKey = aboutMatches.filter((block) => block.key.includes("about-"));
    expect(byKey.length).toBeGreaterThan(0);
    expect(aboutMatches.slice(0, byKey.length)).toEqual(byKey);
    expect(filterCopyStudioBlocks(blocks, "   ")).toEqual([]);
  });

  it("finds a block by a phrase from its text, after the key and label matches", () => {
    const blocks = buildCopyStudioBlocks([
      { key: "zeta-hero", kind: "plain", body: "Welcome to the zqvault archive.", label: "Hero title", group: "Home" },
      { key: "zeta-list", kind: "list", items: ["First point", "A typo lives hre"], label: "Points", group: "Home" },
      { key: "vault-note", kind: "plain", body: "b", label: "Zqvault note", group: "Footer" },
    ]);

    expect(filterCopyStudioBlocks(blocks, "typo lives HRE").map((block) => block.key)).toEqual(["zeta-list"]);
    expect(filterCopyStudioBlocks(blocks, "ZQVAULT").map((block) => block.key)).toEqual([
      "vault-note",
      "zeta-hero",
    ]);
  });
});

describe("copy studio placeholders", () => {
  it("counts each placeholder occurrence", () => {
    expect(countPlaceholders("{{ a }} and {{a}} and {{b}}")).toEqual([
      { name: "a", count: 2 },
      { name: "b", count: 1 },
    ]);
  });

  it("substitutes known placeholders and leaves unknown ones visible", () => {
    expect(resolveCopyPlaceholders("{{count}} of {{missing}}", { count: "7" })).toBe(
      "7 of {{missing}}",
    );
  });
});

describe("copy studio pairing, search and checks", () => {
  it("lists an Effect Index block straight after the block it rewords, and links the two", () => {
    const blocks = buildCopyStudioBlocks([]);
    const home = groupCopyStudioBlocks(blocks).find((entry) => entry.group === "Home")!.blocks.map((block) => block.key);
    expect(home.indexOf("home-hero-tagline-effect-index")).toBe(home.indexOf("home-hero-tagline") + 1);
    const base = blocks.find((block) => block.key === "footer-tagline")!;
    const twin = blocks.find((block) => block.key === "footer-tagline-effect-index")!;
    expect(copyBlockTwin(base, blocks)?.key).toBe(twin.key);
    expect(copyBlockTwin(twin, blocks)?.key).toBe(base.key);
  });

  it("finds a stored block the catalogue lists without text by its default wording", () => {
    const [block] = buildCopyStudioBlocks([{ key: "footer-tagline", kind: "plain", label: "Footer tagline", group: "Footer" }])
      .filter((entry) => entry.key === "footer-tagline");
    expect(copySearchMatch(block, "does not endorse")).toBe("default");
    expect(copySearchMatch(block, "footer tag")).toBe("name");
    expect(filterCopyStudioBlocks([block], "does not endorse")).toHaveLength(1);
  });

  it("names the placeholders a draft drops or adds", () => {
    expect(placeholderChanges("Browse {{substanceCount}} in {{siteName}}.", "Browse {{count}} in {{siteName}}.")).toEqual({
      removed: ["substanceCount"],
      added: ["count"],
    });
  });

  it("keys open copy proposals by block, newest first, and skips settled ones", () => {
    const open = openCopyProposals([
      { _id: "p-old", status: "submitted", createdAt: "2026-01-01T00:00:00Z", proposerName: "Ada", targets: [{ kind: "copyBlock", key: "footer-tagline" }] },
      { _id: "p-new", status: "changes_requested", createdAt: "2026-01-02T00:00:00Z", isAuthor: true, targets: [{ kind: "copyBlock", key: "footer-tagline" }] },
      { _id: "p-done", status: "approved", targets: [{ kind: "copyBlock", key: "home-hero-tagline" }] },
      { _id: "p-writing", status: "submitted", targets: [{ kind: "writing", key: "about" }] },
    ]);
    expect([...open.keys()]).toEqual(["footer-tagline"]);
    expect(open.get("footer-tagline")).toEqual({ id: "p-new", mine: true, by: "Someone" });
  });

  it("guides SEO text lengths only", () => {
    expect(copyLengthGuide({ key: "seo-contact-description", group: "SEO", kind: "plain" })?.target).toBe(155);
    expect(copyLengthGuide({ key: "footer-tagline", group: "Footer", kind: "plain" })).toBeUndefined();
  });
});
