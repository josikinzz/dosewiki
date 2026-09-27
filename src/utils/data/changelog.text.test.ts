import { describe, expect, it } from "vitest";

import { buildTextChangelog } from "./changelog";

const lines = (markdown: string) => markdown.split("\n").slice(2).filter(Boolean);

describe("buildTextChangelog", () => {
  it("shows an inserted paragraph as added lines only, even when the stored text ends in a blank line", () => {
    const stored = "Alpha one.\n\nBeta two.\n\n";
    const draft = "Alpha one.\n\nInserted para.\n\nBeta two.";
    const { markdown, hasChanges } = buildTextChangelog("About copy", stored, draft);
    expect(hasChanges).toBe(true);
    expect(lines(markdown)).toEqual(["+Inserted para.", "+"]);
    expect(markdown.split("\n")).not.toContain("-");
  });

  it("reads text that differs only in blank lines at the end as unchanged", () => {
    expect(buildTextChangelog("Tagline", "Hello.\n\n\n", "Hello.").hasChanges).toBe(false);
    expect(buildTextChangelog("Tagline", "Hello.\r\n", "Hello.").hasChanges).toBe(false);
  });

  it("keeps trailing spaces, which are a Markdown line break", () => {
    const { markdown } = buildTextChangelog("Note", "Line one", "Line one  ");
    expect(lines(markdown)).toEqual(["-Line one", "+Line one  "]);
  });

  it("marks a replaced line as removed then added", () => {
    const { markdown } = buildTextChangelog("Tagline", "Old words.", "New words.");
    expect(markdown.startsWith("# Tagline\n\n")).toBe(true);
    expect(lines(markdown)).toEqual(["-Old words.", "+New words."]);
  });
});
