import { describe, expect, it } from "vitest";
import { getDevRouteDecision } from "@/lib/auth/roles";
import { safeAuthRedirect } from "@/lib/auth/returnPath";
import {
  buildRobotsPolicy,
  getLegacyRedirectTarget,
  getProtectedRouteRedirectTarget,
  getRouteLoadingLabel,
  getSignInCallbackUrl,
  getUnauthorizedFrom,
  noIndexRoutePolicies,
  routeLoadingLabels,
  STATUS_PAGE_PATHS,
} from "./statusRedirectPolicy";
import { getStatusRecoveryLink } from "./statusRecoveryLinks";
import { getPublicSite } from "./publicSite";
import { SITE_FLAVOR_CONFIGS } from "../../src/config/siteFlavor";

/** Pinned to dose.wiki so the assertions hold on an Effect Index build too. */
const DOSEWIKI_SITE = getPublicSite(SITE_FLAVOR_CONFIGS.dosewiki, {});

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

  it("preserves legacy chemical-class redirects under the curated route", () => {
    expect(getLegacyRedirectTarget("legacy-chemical", { classKey: "tryptamine" })).toBe(
      "/chemical-classes/tryptamine",
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
      "viewer /dev",
      getDevRouteDecision({ pathname: "/dev", email: "viewer@example.com", role: "viewer" }),
      { type: "unauthorized", href: "/unauthorized?from=%2Fdev", from: "/dev" },
    ],
    [
      "viewer /dev/profile",
      getDevRouteDecision({ pathname: "/dev/profile", email: "viewer@example.com", role: "viewer" }),
      { type: "unauthorized", href: "/unauthorized?from=%2Fdev%2Fprofile", from: "/dev/profile" },
    ],
    [
      "contributor /dev/profile",
      getDevRouteDecision({ pathname: "/dev/profile", email: "member@example.com", role: "contributor" }),
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

  it.each([
    "https://example.com/phishing",
    "//example.com/phishing",
    "/\\example.com/phishing",
    "javascript:alert(1)",
    "/%2fexample.com/phishing",
    "/%255cexample.com/phishing",
    "/%09/example.com",
    "/sign-in?callbackUrl=%2Fsign-in",
    "/ignored/../sign-in",
    "/api/auth/callback/credentials",
  ])("rejects the unsafe sign-in callback %s", (callbackUrl) => {
    expect(getSignInCallbackUrl(callbackUrl)).toBe(STATUS_PAGE_PATHS.dev);
  });

  it("preserves content query state only on the authenticated origin", () => {
    const path = "/replications?viewer=infinite-torus-space&type=video#details";
    expect(getSignInCallbackUrl(path)).toBe(path);
    expect(safeAuthRedirect(path, "https://dev.dose.wiki")).toBe(`https://dev.dose.wiki${path}`);
    expect(safeAuthRedirect(`https://dev.dose.wiki${path}`, "https://dev.dose.wiki")).toBe(`https://dev.dose.wiki${path}`);
    expect(safeAuthRedirect("https://dose.wiki/dev", "https://dev.dose.wiki")).toBe("https://dev.dose.wiki/dev");
    expect(safeAuthRedirect("//attacker.example/path", "https://dev.dose.wiki")).toBe("https://dev.dose.wiki/dev");
  });

  it("keeps every no-index route in robots disallow policy", () => {
    const robots = buildRobotsPolicy({ site: DOSEWIKI_SITE });
    const rules = Array.isArray(robots.rules) ? robots.rules[0] : robots.rules;
    const disallow = Array.isArray(rules.disallow) ? rules.disallow : [rules.disallow];

    expect(robots.sitemap).toBe("https://dose.wiki/sitemap.xml");
    // Retired `/preview` addresses redirect, but remain disallowed while old crawl records
    // age out.
    expect(disallow).toEqual([
      "/dev",
      "/review",
      "/sign-in",
      "/unauthorized",
      "/invite",
      "/reset-password",
      "/search",
      "/preview",
    ]);
    expect(noIndexRoutePolicies.every((policy) => disallow.includes(policy.robotsDisallow))).toBe(true);
  });


  it("closes the editor deployment to crawlers entirely", () => {
    expect(buildRobotsPolicy({ editorHost: true })).toEqual({
      rules: { userAgent: "*", disallow: "/" },
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
