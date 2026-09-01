import { describe, expect, it } from "vitest";
import { substanceRouteAliases } from "@server/next/substanceRouteAliases";
import {
  authorizeWarmRequest,
  parseWarmSearchParams,
  planWarmTargets,
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

  it("appends the low tier last when asked", () => {
    const targets = planWarmTargets(
      [
        { slug: "obscure", priority: "low" },
        { slug: "lsd", priority: "high" },
      ],
      "https://effectindex.com/",
      { includeLow: true },
    );

    expect(targets).toEqual(["https://effectindex.com/lsd", "https://effectindex.com/obscure"]);
  });
});

describe("parseWarmSearchParams", () => {
  it("falls back to safe defaults and clamps overrides", () => {
    expect(parseWarmSearchParams(new URLSearchParams())).toEqual({
      concurrency: 4,
      budgetMs: 45_000,
      includeLow: false,
    });
    expect(
      parseWarmSearchParams(new URLSearchParams("concurrency=99&budgetMs=10&includeLow=1")),
    ).toEqual({ concurrency: 8, budgetMs: 1_000, includeLow: true });
    expect(parseWarmSearchParams(new URLSearchParams("concurrency=abc"))).toMatchObject({
      concurrency: 4,
    });
  });
});
