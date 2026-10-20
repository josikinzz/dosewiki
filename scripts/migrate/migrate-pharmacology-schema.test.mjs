import { describe, expect, it } from "vitest";
import { parseMigrationArgs } from "./migrate-pharmacology-schema.mjs";

describe("pharmacology migration scope", () => {
  it.each([[["--slug", "example-substance"]], [["--slug=example-substance"]]])("selects exactly one article for %j", (argv) => {
    expect(parseMigrationArgs(argv).slug).toBe("example-substance");
  });

  it("requires --all for the whole corpus", () => {
    expect(parseMigrationArgs(["--all"]).slug).toBeNull();
    expect(() => parseMigrationArgs([])).toThrow(/--all for the whole corpus/);
    expect(() => parseMigrationArgs(["--write", "--confirm-write=migrate-pharmacology-schema"])).toThrow(/Choose a scope/);
  });

  it.each([
    [["--slug"], /argument missing/],
    [["--slug="], /--slug requires a substance slug/],
    [["--slug", "--write"], /ambiguous/],
    [["--slug=example-substance", "--all"], /not both/],
    [["--slg=example-substance"], /Unknown option/],
    [["--all", "example-substance"], /Unexpected argument/],
    [["--all", "--confirm-write", "migrate-pharmacology-schema"], /--confirm-write=<value> as one argument/],
  ])("refuses %j before any read", (argv, pattern) => {
    expect(() => parseMigrationArgs(argv)).toThrow(pattern);
  });
});
