import { describe, expect, it } from "vitest";
import { sliceArticleDiff } from "./articleRecentChanges";

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
