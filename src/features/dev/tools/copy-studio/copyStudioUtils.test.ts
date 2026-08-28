import { describe, expect, it } from "vitest";

import { COPY_BLOCK_DEFAULTS } from "@/data/content/copyBlocks";
import {
  buildCopyStudioBlocks,
  canResetToDefault,
  countPlaceholders,
  draftFromBlock,
  draftToText,
  groupCopyStudioBlocks,
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

    expect(block.source).toBe("convex");
    expect(block.current.body).toBe("Stored wording");
    expect(block.fallback?.body).toBe(defaultBlock.body);
    expect(block.kind).toBe("markdown");
  });

  it("keeps a Convex-only block editable but gives it no reset target", () => {
    const block = findBlock("convex-only-block", [
      {
        key: "convex-only-block",
        kind: "plain",
        body: "Added straight in Convex",
        label: "Convex only",
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
