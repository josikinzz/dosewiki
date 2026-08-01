import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("ReviewExperience command bar responsiveness", () => {
  it("keeps the sticky command row single-line at every breakpoint", () => {
    const source = readFileSync(
      join(
        process.cwd(),
        "src/features/dev/tools/review-mode/ReviewExperience.tsx",
      ),
      "utf8",
    );
    const commandRow = source.match(
      /<div className="([^"]*max-w-\[1500px\][^"]*)">/,
    );

    expect(commandRow?.[1]).toContain("flex-nowrap");
    expect(commandRow?.[1]).not.toMatch(/(?:^|:)flex-wrap(?:\s|$)/);
  });
});
