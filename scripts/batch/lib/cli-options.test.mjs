import { describe, expect, it } from "vitest";

import { parseBatchCliArgs } from "./cli-options.mjs";

const CONFIG = {
  defaults: {
    all: false,
    dryRun: false,
    category: null,
    substances: [],
    concurrency: 2,
    limit: null,
  },
  booleanFlags: ["all", "dry-run"],
  stringFlags: ["category"],
  csvFlags: ["substances"],
  numberFlags: [
    { name: "concurrency", fallbackOnNaN: 2, bounds: { min: 1, max: 10 } },
    { name: "limit", fallbackOnNaN: null },
  ],
  aliases: {
    substance: "substances",
  },
};

describe("batch CLI option parsing", () => {
  it("normalizes booleans, aliases, CSV flags, and bounded numbers", () => {
    expect(
      parseBatchCliArgs(
        [
          "--all",
          "--dry-run",
          "--category=legality",
          "--substance=lsd, mdma",
          "--concurrency=99",
          "--limit=5",
        ],
        CONFIG,
      ),
    ).toEqual({
      all: true,
      dryRun: true,
      category: "legality",
      substances: ["lsd", "mdma"],
      concurrency: 10,
      limit: 5,
    });
  });

  it("fails closed for unknown flags instead of silently using defaults", () => {
    expect(() => parseBatchCliArgs(["--target=postgresql://localhost/prod"], CONFIG)).toThrow(
      /Unknown batch option: --target/,
    );
  });

  it("uses numeric fallbacks for invalid input", () => {
    expect(
      parseBatchCliArgs(["--concurrency=nope"], CONFIG),
    ).toEqual({
      ...CONFIG.defaults,
      concurrency: 2,
    });
  });

  it("sets help for both long and short help flags", () => {
    expect(parseBatchCliArgs(["--help"], CONFIG).help).toBe(true);
    expect(parseBatchCliArgs(["-h"], CONFIG).help).toBe(true);
  });
});
