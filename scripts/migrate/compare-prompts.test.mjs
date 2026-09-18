import { describe, expect, it } from "vitest";

import {
  collectDataPromptInventory,
  comparePromptInventories,
} from "../lib/prompt-drift-policy.mjs";
import { renderPromptDriftReport } from "./compare-prompts.mjs";

describe("compare-prompts CLI report", () => {
  it("renders deterministic dry comparison output from fake prompt records", () => {
    const source = new Map([
      ["generator", { key: "generator", kind: "generator", content: "local generator", file: "generator.md" }],
      ["section_base", { key: "section_base", kind: "section", content: "same", file: "base.md" }],
    ]);
    const target = collectDataPromptInventory([
      { key: "generator", content: "data generator", updatedAt: "2026-04-27T00:00:00.000Z", updatedBy: "tester" },
      { key: "section_base", content: "same", updatedAt: "2026-04-27T00:00:00.000Z", updatedBy: "tester" },
    ]);

    const report = renderPromptDriftReport(comparePromptInventories(source, target), {
      sourceCount: source.size,
      targetCount: target.size,
    });

    expect(report).toContain("COMPARISON RESULTS");
    expect(report).toContain("✓ IDENTICAL (1):");
    expect(report).toContain("- section_base");
    expect(report).toContain("≠ DIFFERENT (1):");
    expect(report).toContain("- generator");
    expect(report).toContain("Note: generator prompt drift is included in this comparison.");
  });
});
