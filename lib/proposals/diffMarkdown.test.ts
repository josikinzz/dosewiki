import { describe, expect, it } from "vitest";
import { DIFF_MARKDOWN_MAX_LENGTH, truncateDiffMarkdown } from "./diffMarkdown";

describe("truncateDiffMarkdown", () => {
  it("returns bodies at or under the ceiling untouched", () => {
    const exact = "x".repeat(DIFF_MARKDOWN_MAX_LENGTH);
    expect(truncateDiffMarkdown("short")).toBe("short");
    expect(truncateDiffMarkdown(exact)).toBe(exact);
  });

  it("clips an oversized body so the marked result never exceeds the ceiling", () => {
    const clipped = truncateDiffMarkdown("x".repeat(DIFF_MARKDOWN_MAX_LENGTH + 1));
    expect(clipped.length).toBe(DIFF_MARKDOWN_MAX_LENGTH);
    expect(clipped.endsWith("... [Diff truncated - too large to store]")).toBe(true);
    expect(clipped.startsWith("xxxx")).toBe(true);
  });

  it("honours a caller-supplied ceiling", () => {
    const clipped = truncateDiffMarkdown("y".repeat(200), 100);
    expect(clipped.length).toBe(100);
    expect(clipped).toMatch(/^y+\n\n\.\.\. \[Diff truncated - too large to store\]$/);
  });
});
