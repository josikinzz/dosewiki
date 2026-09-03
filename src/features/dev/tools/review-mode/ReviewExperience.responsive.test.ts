import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("ReviewExperience command bar responsiveness", () => {
  it("keeps the sticky command row single-line at every breakpoint", () => {
    const source = readFileSync(
      join(
        process.cwd(),
        "src/features/dev/tools/review-mode/ReviewCommandBar.tsx",
      ),
      "utf8",
    );
    const commandRow = source.match(
      /<div className="([^"]*max-w-\[1500px\][^"]*)">/,
    );

    expect(commandRow?.[1]).toContain("flex-nowrap");
    expect(commandRow?.[1]).not.toMatch(/(?:^|:)flex-wrap(?:\s|$)/);
  });

  it("keeps the view tabs from stacking inside the bar", () => {
    const source = readFileSync(
      join(
        process.cwd(),
        "src/features/dev/tools/review-mode/ReviewCommandBar.tsx",
      ),
      "utf8",
    );

    // The bar's nowrap row cannot wrap, so a squeeze reappears as a second
    // row *inside* the tab list (its TabsList defaults to flex-wrap) unless
    // the bar instance pins it. The overflow sheet's instance may still wrap.
    expect(source).toContain('listClassName={nowrap ? "flex-nowrap" : undefined}');
    expect(source).toContain("{ labelsFrom2Xl: true, nowrap: true }");
  });
});
