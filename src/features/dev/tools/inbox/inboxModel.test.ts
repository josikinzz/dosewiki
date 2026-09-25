import { describe, expect, it } from "vitest";

import { filterInboxItems, sortInboxItems, type InboxItem } from "./inboxModel";

function item(overrides: Partial<InboxItem> & Pick<InboxItem, "key">): InboxItem {
  return {
    source: "proposals",
    id: overrides.key,
    title: overrides.key,
    subtitle: "",
    status: "new",
    urgency: "normal",
    receivedAt: "2026-09-01T00:00:00.000Z",
    claimedBy: null,
    href: "/dev/queue",
    ...overrides,
  };
}

describe("inboxModel", () => {
  it("sorts by urgency, then the item that has waited longest", () => {
    const sorted = sortInboxItems([
      item({ key: "low-old", urgency: "low", receivedAt: "2026-01-01T00:00:00.000Z" }),
      item({ key: "normal-new", receivedAt: "2026-09-02T00:00:00.000Z" }),
      item({ key: "critical-new", urgency: "critical", receivedAt: "2026-09-03T00:00:00.000Z" }),
      item({ key: "normal-old", receivedAt: "2026-08-01T00:00:00.000Z" }),
      item({ key: "high", urgency: "high" }),
    ]);
    expect(sorted.map((entry) => entry.key)).toEqual(["critical-new", "high", "normal-old", "normal-new", "low-old"]);
  });

  it("puts an item with no known age after dated items of the same urgency", () => {
    const sorted = sortInboxItems([item({ key: "undated", receivedAt: "" }), item({ key: "dated" })]);
    expect(sorted.map((entry) => entry.key)).toEqual(["dated", "undated"]);
  });

  it("filters Mine, Unassigned and Everyone by the claimer, ignoring email case", () => {
    const items = [
      item({ key: "mine", claimedBy: "Ada@Example.com" }),
      item({ key: "theirs", claimedBy: "ben@example.com" }),
      item({ key: "open" }),
    ];
    const keys = (assignment: "mine" | "unassigned" | "everyone") =>
      filterInboxItems(items, { assignment, chip: null, actor: "ada@example.com" }).map((entry) => entry.key);
    expect(keys("mine")).toEqual(["mine"]);
    expect(keys("unassigned")).toEqual(["open"]);
    expect(keys("everyone")).toEqual(["mine", "theirs", "open"]);
  });

  it("filters by source chip, folding sources into their tool", () => {
    const items = [
      item({ key: "a", source: "article-feedback" }),
      item({ key: "s", source: "site-feedback" }),
      item({ key: "r", source: "review-recommendations" }),
    ];
    expect(filterInboxItems(items, { assignment: "everyone", chip: "feedback", actor: null }).map((entry) => entry.key)).toEqual(["a", "s"]);
    expect(filterInboxItems(items, { assignment: "everyone", chip: "change-review", actor: null }).map((entry) => entry.key)).toEqual(["r"]);
  });
});
