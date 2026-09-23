// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  BUILD_CONCURRENCY_DEFAULTS,
  BUILD_CONCURRENCY_LIMITS,
  resolveBuildConcurrency,
} from "./buildConcurrency";

describe("resolveBuildConcurrency", () => {
  it("uses the laptop defaults when nothing is set", () => {
    expect(resolveBuildConcurrency({})).toEqual({ cpus: 4, staticGenerationMaxConcurrency: 1 });
    expect(resolveBuildConcurrency({})).toEqual(BUILD_CONCURRENCY_DEFAULTS);
  });

  it("reads valid overrides", () => {
    expect(
      resolveBuildConcurrency({ DOSEWIKI_BUILD_WORKERS: "8", DOSEWIKI_BUILD_PAGES_PER_WORKER: "2" }),
    ).toEqual({ cpus: 8, staticGenerationMaxConcurrency: 2 });
    expect(resolveBuildConcurrency({ DOSEWIKI_BUILD_WORKERS: " 6 " }).cpus).toBe(6);
  });

  it("falls back to the default for garbage, blank, fractional, and out-of-range values", () => {
    for (const value of ["", "  ", "many", "4.5", "0", "-2", "1e2", "NaN"]) {
      expect(resolveBuildConcurrency({ DOSEWIKI_BUILD_WORKERS: value }).cpus).toBe(4);
      expect(
        resolveBuildConcurrency({ DOSEWIKI_BUILD_PAGES_PER_WORKER: value }).staticGenerationMaxConcurrency,
      ).toBe(1);
    }
    expect(resolveBuildConcurrency({ DOSEWIKI_BUILD_WORKERS: String(BUILD_CONCURRENCY_LIMITS.cpus + 1) }).cpus).toBe(4);
    expect(
      resolveBuildConcurrency({
        DOSEWIKI_BUILD_PAGES_PER_WORKER: String(BUILD_CONCURRENCY_LIMITS.staticGenerationMaxConcurrency + 1),
      }).staticGenerationMaxConcurrency,
    ).toBe(1);
  });

  it("accepts the ceiling exactly", () => {
    expect(resolveBuildConcurrency({ DOSEWIKI_BUILD_WORKERS: String(BUILD_CONCURRENCY_LIMITS.cpus) }).cpus).toBe(
      BUILD_CONCURRENCY_LIMITS.cpus,
    );
  });
});
