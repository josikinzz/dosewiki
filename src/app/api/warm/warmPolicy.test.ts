import { describe, expect, it } from "vitest";
import { substanceRouteAliases } from "@server/next/substanceRouteAliases";
import {
  authorizeWarmRequest,
  parseWarmSearchParams,
  planWarmTargets,
  WARM_ROTATION_STEP,
  WARM_TICK_MS,
  warmRotationForTick,
} from "./warmPolicy";

describe("authorizeWarmRequest", () => {
  it("refuses to run when CRON_SECRET is unset", () => {
    expect(authorizeWarmRequest("Bearer anything", {})).toMatchObject({
      allowed: false,
      status: 503,
    });
  });

  it("requires the exact bearer secret", () => {
    const env = { CRON_SECRET: "s3cret" };
    expect(authorizeWarmRequest(null, env)).toMatchObject({ allowed: false, status: 401 });
    expect(authorizeWarmRequest("Bearer wrong", env)).toMatchObject({ allowed: false, status: 401 });
    expect(authorizeWarmRequest("s3cret", env)).toMatchObject({ allowed: false, status: 401 });
    expect(authorizeWarmRequest("Bearer s3cret", env)).toMatchObject({ allowed: true });
  });
});

describe("planWarmTargets", () => {
  const aliasSlug = Object.keys(substanceRouteAliases)[0];

  it("orders by priority on the public origin and skips low, alias, and duplicate slugs", () => {
    const targets = planWarmTargets(
      [
        { slug: "obscure", priority: "low" },
        { slug: "2c-b", priority: "normal" },
        { slug: aliasSlug, priority: "high" },
        { slug: "lsd", priority: "high" },
        { slug: "lsd", priority: "normal" },
        { slug: "", priority: "high" },
      ],
      "https://dose.wiki",
    );

    expect(targets).toEqual(["https://dose.wiki/lsd", "https://dose.wiki/2c-b"]);
  });

  it("puts the never-pre-rendered low tier first when asked", () => {
    const targets = planWarmTargets(
      [
        { slug: "lsd", priority: "high" },
        { slug: "obscure", priority: "low" },
      ],
      "https://effectindex.com/",
      { includeLow: true },
    );

    expect(targets).toEqual(["https://effectindex.com/obscure", "https://effectindex.com/lsd"]);
  });

  it("rotates the low tier by the offset and leaves the pre-rendered tiers alone", () => {
    const entries = [
      { slug: "a", priority: "low" as const },
      { slug: "b", priority: "low" as const },
      { slug: "c", priority: "low" as const },
      { slug: "2c-b", priority: "normal" as const },
      { slug: "lsd", priority: "high" as const },
    ];
    const slugs = (rotateBy: number) =>
      planWarmTargets(entries, "https://dose.wiki", { includeLow: true, rotateBy }).map((url) =>
        url.replace("https://dose.wiki/", ""),
      );

    expect(slugs(0)).toEqual(["a", "b", "c", "lsd", "2c-b"]);
    expect(slugs(1)).toEqual(["b", "c", "a", "lsd", "2c-b"]);
    expect(slugs(4)).toEqual(["b", "c", "a", "lsd", "2c-b"]);
    expect(slugs(-1)).toEqual(["c", "a", "b", "lsd", "2c-b"]);
    expect(planWarmTargets([entries[4]], "https://dose.wiki", { rotateBy: 7 })).toEqual([
      "https://dose.wiki/lsd",
    ]);
  });
});

describe("warmRotationForTick", () => {
  it("advances one step per cron tick", () => {
    expect(warmRotationForTick(0)).toBe(0);
    expect(warmRotationForTick(WARM_TICK_MS - 1)).toBe(0);
    expect(warmRotationForTick(WARM_TICK_MS)).toBe(WARM_ROTATION_STEP);
    expect(warmRotationForTick(WARM_TICK_MS * 3 + 5)).toBe(WARM_ROTATION_STEP * 3);
  });
});

describe("parseWarmSearchParams", () => {
  it("falls back to safe defaults and clamps overrides", () => {
    expect(parseWarmSearchParams(new URLSearchParams())).toEqual({
      concurrency: 4,
      budgetMs: 45_000,
      includeLow: true,
      rotate: null,
    });
    expect(parseWarmSearchParams(new URLSearchParams("includeLow=0"))).toMatchObject({
      includeLow: false,
    });
    expect(
      parseWarmSearchParams(new URLSearchParams("concurrency=99&budgetMs=10&includeLow=1")),
    ).toEqual({ concurrency: 8, budgetMs: 1_000, includeLow: true, rotate: null });
    expect(parseWarmSearchParams(new URLSearchParams("rotate=240"))).toMatchObject({ rotate: 240 });
    expect(parseWarmSearchParams(new URLSearchParams("rotate=-5"))).toMatchObject({ rotate: 0 });
    expect(parseWarmSearchParams(new URLSearchParams("concurrency=abc"))).toMatchObject({
      concurrency: 4,
    });
  });
});
