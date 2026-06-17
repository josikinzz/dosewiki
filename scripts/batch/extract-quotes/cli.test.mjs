import { describe, expect, it } from "vitest";

import { CONFIG, parseArgs } from "./cli.mjs";

describe("batch quote extraction CLI", () => {
  it("parses Convex source/save and target options", () => {
    const originalArgv = process.argv;
    process.argv = [
      "bun",
      "scripts/batch/batch-extract-quotes.mjs",
      "--category=intro-text",
      "--source=convex",
      "--save=convex",
      "--source-url=https://source.convex.cloud",
      "--target-url=https://target.convex.cloud",
      "--reasoning-effort=high",
      "--overwrite",
      "--dry-run",
    ];

    try {
      expect(parseArgs()).toEqual({
        category: "intro-text",
        concurrency: CONFIG.concurrency,
        sequential: false,
        dryRun: true,
        resume: false,
        overwrite: true,
        source: "convex",
        save: "convex",
        sourceUrl: "https://source.convex.cloud",
        targetUrl: "https://target.convex.cloud",
        reasoningEffort: "high",
        slugs: null,
        limit: null,
        verbose: false,
        help: false,
      });
    } finally {
      process.argv = originalArgv;
    }
  });
});
