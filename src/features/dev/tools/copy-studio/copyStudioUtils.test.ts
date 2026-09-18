import { describe, expect, it } from "vitest";

import { COPY_BLOCK_DEFAULTS } from "@/data/content/copyBlocks";
import {
  buildCopyStudioBlocks,
  canResetToDefault,
  countPlaceholders,
  draftFromBlock,
  draftToText,
  filterCopyStudioBlocks,
  groupCopyStudioBlocks,
  sectionCopyStudioGroups,
  isDraftDirty,
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
    expect(filterCopyStudioBlocks(blocks, "about-").every((block) => block.key.includes("about-"))).toBe(true);
    expect(filterCopyStudioBlocks(blocks, "   ")).toEqual([]);
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
