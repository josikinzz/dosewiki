import { describe, expect, it } from "vitest";
import { getDevRouteDecision } from "@/lib/auth/roles";
import {
  buildRobotsPolicy,
  getLegacyRedirectTarget,
  getProtectedRouteRedirectTarget,
  getRouteLoadingLabel,
  getSignInCallbackUrl,
  getStatusRecoveryLink,
  getUnauthorizedFrom,
  noIndexRoutePolicies,
  routeLoadingLabels,
  STATUS_PAGE_PATHS,
} from "./statusRedirectPolicy";

describe("status and redirect policy", () => {
  it.each([
    ["home", "/substances"],
    ["data", "/about"],
    ["interactions", "/substances"],
  ] as const)("preserves the %s legacy redirect target", (route, expected) => {
    expect(getLegacyRedirectTarget(route)).toBe(expected);
  });

  it("preserves legacy effect redirects under the plural effects route", () => {
    expect(getLegacyRedirectTarget("legacy-effect", { effectSlug: "visual-drifting" })).toBe(
      "/effects/visual-drifting",
    );
  });

  it.each([
    [
      "unauthenticated /dev",
      getDevRouteDecision({ pathname: "/dev", email: undefined, role: undefined }),
      { type: "sign-in", href: "/sign-in?callbackUrl=%2Fdev", callbackUrl: "/dev" },
    ],
    [
      "unauthenticated /dev with search",
      getDevRouteDecision({ pathname: "/dev", search: "?tab=articles", email: undefined, role: undefined }),
      { type: "sign-in", href: "/sign-in?callbackUrl=%2Fdev%3Ftab%3Darticles", callbackUrl: "/dev?tab=articles" },
    ],
    [
      "unauthenticated /dev/profile",
      getDevRouteDecision({ pathname: "/dev/profile", email: undefined, role: undefined }),
      { type: "sign-in", href: "/sign-in?callbackUrl=%2Fdev%2Fprofile", callbackUrl: "/dev/profile" },
    ],
    [
      "non-editor /dev",
      getDevRouteDecision({ pathname: "/dev", email: "viewer@example.com", role: "viewer" }),
      { type: "unauthorized", href: "/unauthorized?from=%2Fdev", from: "/dev" },
    ],
    [
      "authenticated /dev/profile",
      getDevRouteDecision({ pathname: "/dev/profile", email: "viewer@example.com", role: "viewer" }),
      { type: "allow" },
    ],
  ] as const)("builds protected route redirects for %s", (_label, decision, expected) => {
    expect(getProtectedRouteRedirectTarget(decision)).toEqual(expected);
  });

  it("centralizes sign-in callback and unauthorized attempted-route fallbacks", () => {
    expect(getSignInCallbackUrl(undefined)).toBe(STATUS_PAGE_PATHS.dev);
    expect(getSignInCallbackUrl("/dev/profile")).toBe("/dev/profile");
    expect(getUnauthorizedFrom(undefined)).toBe(STATUS_PAGE_PATHS.dev);
    expect(getUnauthorizedFrom("/dev")).toBe("/dev");
  });

  it("keeps every no-index route in robots disallow policy", () => {
    const robots = buildRobotsPolicy();
    const rules = Array.isArray(robots.rules) ? robots.rules[0] : robots.rules;
    const disallow = Array.isArray(rules.disallow) ? rules.disallow : [rules.disallow];

    expect(robots.sitemap).toBe("https://dosewiki-admin.vercel.app/sitemap.xml");
    expect(disallow).toEqual(["/dev", "/sign-in", "/unauthorized", "/search"]);
    expect(noIndexRoutePolicies.every((policy) => disallow.includes(policy.robotsDisallow))).toBe(true);
  });

  it("serves a construction-safe robots policy on public launch hosts", () => {
    expect(buildRobotsPolicy({ publicConstructionHost: true })).toEqual({
      rules: {
        userAgent: "*",
        allow: "/$",
        disallow: "/",
      },
    });
  });

  it("snapshots status recovery link intents", () => {
    expect(
      (["substances", "effects", "reports"] as const).map((key) => getStatusRecoveryLink(key)),
    ).toEqual([
      {
        key: "substances",
        label: "Substances",
        href: "/substances",
        intent: { type: "substances" },
      },
      {
        key: "effects",
        label: "Effects",
        href: "/effects",
        intent: { type: "effects" },
      },
      {
        key: "reports",
        label: "Trip reports",
        href: "/reports",
        intent: { type: "reports" },
      },
    ]);
  });

  it("snapshots route-family loading labels", () => {
    expect(routeLoadingLabels).toEqual({
      page: "Loading page",
      substance: "Loading substance route",
      category: "Loading category route",
      effect: "Loading effect route",
      mechanism: "Loading mechanism route",
      report: "Loading trip report route",
      search: "Loading search results",
    });
    expect(getRouteLoadingLabel("effect")).toBe("Loading effect route");
  });
});
