import { describe, expect, it } from "vitest";

import { CONFIG, parseArgs } from "./cli.mjs";

describe("batch quote extraction CLI", () => {
  it("parses Postgres source/save and target options", () => {
    const originalArgv = process.argv;
    process.argv = [
      "bun",
      "scripts/batch/batch-extract-quotes.mjs",
      "--category=intro-text",
      "--source=postgres",
      "--save=postgres",
      "--source-url=postgresql://localhost/source",
      "--target=postgresql://localhost/target?application_name=quote-extraction&sslmode=disable",
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
        source: "postgres",
        save: "postgres",
        sourceUrl: "postgresql://localhost/source",
        targetUrl: "postgresql://localhost/target?application_name=quote-extraction&sslmode=disable",
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
