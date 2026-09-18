import { describe, expect, it } from "vitest";
import { describeChange, mergeSourceChurn, sliceArticleDiff } from "./articleRecentChanges";

const article = { id: 12, title: "2C-B", slug: "2c-b" };

describe("sliceArticleDiff", () => {
  it("returns only this article's section from a bulk Dev-editor diff", () => {
    const markdown = [
      "# LSD · #7",
      "",
      '-  "threshold": "10 µg"',
      '+  "threshold": "15 µg"',
      "",
      "# 2C-B · #12",
      "",
      '-  "common": "12 mg"',
      '+  "common": "14 mg"',
      "",
      "# Ketamine · #9",
      "",
      "No differences detected.",
      "",
    ].join("\n");

    expect(sliceArticleDiff(markdown, article)).toBe('-  "common": "12 mg"\n+  "common": "14 mg"');
  });

  it("matches a direct-edit diff by bare title, case-insensitively", () => {
    const markdown = "# 2c-b\n\n@@ Dosage / Threshold @@\n- 5 mg\n+ 4 mg\n";

    expect(sliceArticleDiff(markdown, article)).toBe("@@ Dosage / Threshold @@\n- 5 mg\n+ 4 mg");
  });

  it("falls back to the only section when its heading does not match", () => {
    const markdown = "# Renamed article\n\n- a\n+ b\n";

    expect(sliceArticleDiff(markdown, article)).toBe("- a\n+ b");
  });

  it("returns nothing rather than another article's changes", () => {
    const markdown = "# LSD · #7\n\n- a\n+ b\n\n# Ketamine · #9\n\n- c\n+ d\n";

    expect(sliceArticleDiff(markdown, article)).toBe("");
  });

  it("treats a no-op section as having no diff", () => {
    expect(sliceArticleDiff("# 2C-B · #12\n\nNo differences detected.\n", article)).toBe("");
  });

  it("returns a heading-less diff whole", () => {
    expect(sliceArticleDiff("- a\n+ b\n", article)).toBe("- a\n+ b");
  });
});

describe("describeChange", () => {
  it("names a sourced claim when a citation-needed flag becomes a citation", () => {
    const diff = "@@ harm_potential.psychosis.description @@\n- Occurs in users[citation-needed] and more.\n+ Occurs in users[cite:doi-1] and more.";

    expect(describeChange("Inline edit — harm_potential.psychosis.description", diff)).toEqual({
      kind: "prose",
      message: "Sourced a claim",
      detail: null,
      section: { id: "harm-potential", label: "Harm Potential" },
      field: [{ label: "Psychosis", index: null }, { label: "Description", index: null }],
    });
  });

  it("counts citations and reworded words separately, with no link for an unanchored section", () => {
    const diff = "- The dose is 5 mg and safe.\n+ The dose is 4 mg and risky.[cite:a][cite:b]";

    expect(describeChange("Inline edit — summary", diff)).toMatchObject({
      message: "Added 2 citations and reworded 2 words",
      section: null,
      field: [{ label: "Summary", index: null }],
    });
  });

  it("keeps an unmapped field path as words without a section link", () => {
    expect(describeChange("Inline edit — mystery.thing", "- a\n+ b")).toMatchObject({
      message: "Changed a word",
      section: null,
      field: [{ label: "Mystery", index: null }, { label: "Thing", index: null }],
    });
  });

  it("splits a source message into verb and title", () => {
    expect(describeChange("Added a source — Some paper title", "")).toEqual({
      kind: "source",
      message: "Added a source",
      detail: "Some paper title",
      section: { id: "sources", label: "Sources" },
      field: null,
    });
  });

  it("treats a Dev editor save as a bulk update, dropping an auto timestamp note", () => {
    expect(describeChange("Dev editor update - 9/1/2026 3:38:03 PM", "")).toMatchObject({
      kind: "bulk",
      message: "Updated the article",
      detail: null,
    });
    expect(describeChange("Dev editor update - Fixed the dose table", "")).toMatchObject({
      detail: "Fixed the dose table",
    });
  });
});

describe("mergeSourceChurn", () => {
  const row = (id: string, message: string, createdAt: string, submittedBy = "LYREA") => ({
    id,
    kind: "source" as const,
    message,
    detail: "Same paper",
    createdAt,
    submittedBy,
  });

  it("collapses a remove-then-add of one source by one contributor into a re-add", () => {
    const merged = mergeSourceChurn([
      row("b", "Added a source", "2026-09-03T10:05:00Z"),
      row("a", "Removed a source", "2026-09-03T10:00:00Z"),
    ]);

    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ id: "b", message: "Re-added a source" });
  });

  it("collapses an add-then-remove into one row that says so", () => {
    const merged = mergeSourceChurn([
      row("b", "Removed a source", "2026-09-03T10:05:00Z"),
      row("a", "Added a source", "2026-09-03T10:00:00Z"),
    ]);

    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ id: "b", message: "Added, then removed a source" });
  });

  it("leaves a pair by different contributors or far apart in time alone", () => {
    expect(
      mergeSourceChurn([
        row("b", "Added a source", "2026-09-03T10:05:00Z", "JOSIE"),
        row("a", "Removed a source", "2026-09-03T10:00:00Z"),
      ]),
    ).toHaveLength(2);
    expect(
      mergeSourceChurn([
        row("b", "Added a source", "2026-09-04T10:05:00Z"),
        row("a", "Removed a source", "2026-09-03T10:00:00Z"),
      ]),
    ).toHaveLength(2);
  });
});
describe("describeChange legacy paths", () => {
  it("reads an indexed field path as words", () => {
    expect(describeChange("Inline edit — dosage.routes[0].dose_ranges.heavy", "- 1\n+ 2")).toMatchObject({
      kind: "prose",
      section: { id: "dosage-duration", label: "Dosage & Duration" },
      field: [{ label: "Routes", index: 1 }, { label: "Dose ranges", index: null }, { label: "Heavy", index: null }],
    });
  });
});
