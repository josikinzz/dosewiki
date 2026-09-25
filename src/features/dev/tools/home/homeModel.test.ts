import { describe, expect, it } from "vitest";

import { countNoun, describeDay, homeCardSetsFor, homeSummaryFor } from "./homeModel";

describe("homeModel", () => {
  it("gives an admin the queues first, then their own drafts and proposals", () => {
    expect(homeCardSetsFor("admin")).toEqual(["admin", "editor"]);
    expect(homeCardSetsFor("editor_translator")).toEqual(["editor", "translator"]);
    expect(homeCardSetsFor("contributor")).toEqual(["contributor"]);
    expect(homeCardSetsFor(null)).toEqual([]);
  });

  it("summarises what a Home holds in one sentence", () => {
    expect(homeSummaryFor(["contributor"])).toBe("Your profile and trip reports. Each row opens the tool that owns it.");
    expect(homeSummaryFor(["editor", "translator"])).toBe(
      "Your drafts and proposals, and the review inbox for each of your languages. Each row opens the tool that owns it.",
    );
    expect(homeSummaryFor([])).toBe("");
  });

  it("reads a day relative to now, with the full date kept for the tooltip", () => {
    const now = new Date(2026, 8, 25, 12).getTime();
    expect(describeDay(new Date(2026, 8, 25, 8).toISOString(), now)?.relative).toBe("today");
    expect(describeDay(new Date(2026, 8, 22, 8).toISOString(), now)).toMatchObject({ relative: "3 days ago", days: -3 });
    expect(describeDay(new Date(2026, 8, 27, 8).toISOString(), now)?.relative).toBe("in 2 days");
    expect(describeDay(new Date(2025, 0, 2).toISOString(), now)?.relative).toBe("Jan 2, 2025");
    expect(describeDay("not a date", now)).toBeNull();
  });

  it("counts nouns", () => {
    expect(countNoun(1, "draft")).toBe("1 draft");
    expect(countNoun(3, "comment")).toBe("3 comments");
  });
});
