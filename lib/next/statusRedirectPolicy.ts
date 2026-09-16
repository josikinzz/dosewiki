import type { MetadataRoute } from "next";
import { buildPageMetadata } from "./metadata";
import { buildSiteUrl, PUBLIC_SITE, type PublicSiteIdentity } from "./publicSite";
import { getPublicHref } from "@/utils/publicHref";
import { PREVIEW_PATH_PREFIX } from "@/utils/previewPath";
import type { DevRouteDecision } from "@/lib/auth/roles";
import { safeAuthReturnPath } from "@/lib/auth/returnPath";
export {
  getRouteLoadingModel,
  getRouteLoadingLabel,
  getSectionLoadingModel,
  routeLoadingLabels,
  type LoadingRouteFamily,
  type RouteLoadingDensity,
  type RouteLoadingSection,
  type RouteLoadingViewModel,
} from "./routeLoadingPolicy";

export type LegacyRedirectRoute = "home" | "data" | "interactions" | "legacy-effect" | "legacy-chemical";

export function getLegacyRedirectTarget(
  route: Exclude<LegacyRedirectRoute, "legacy-effect" | "legacy-chemical">,
): string;
export function getLegacyRedirectTarget(route: "legacy-effect", params: { effectSlug: string }): string;
export function getLegacyRedirectTarget(route: "legacy-chemical", params: { classKey: string }): string;
export function getLegacyRedirectTarget(
  route: LegacyRedirectRoute,
  params?: { effectSlug?: string; classKey?: string },
): string {
  switch (route) {
    case "home":
    case "interactions":
      return getPublicHref({ type: "substances" });
    case "data":
      return "/about";
    case "legacy-effect":
      return getPublicHref({ type: "effect", slug: params?.effectSlug ?? "" });
    case "legacy-chemical":
      return getPublicHref({
        type: "classification",
        classification: "chemical",
        slugOrLabel: params?.classKey ?? "",
      });
  }
}

export const STATUS_PAGE_PATHS = {
  signIn: "/sign-in",
  unauthorized: "/unauthorized",
  dev: "/dev",
  review: "/review",
  search: "/search",
  invite: "/invite",
  resetPassword: "/reset-password",
} as const;

export type ProtectedRouteRedirectTarget =
  | { type: "allow" }
  | { type: "sign-in"; href: string; callbackUrl: string }
  | { type: "unauthorized"; href: string; from: string };

export function getProtectedRouteRedirectTarget(decision: DevRouteDecision): ProtectedRouteRedirectTarget {
  if (decision.type === "sign-in") {
    return {
      type: "sign-in",
      href: `${STATUS_PAGE_PATHS.signIn}?callbackUrl=${encodeURIComponent(decision.callbackUrl)}`,
      callbackUrl: decision.callbackUrl,
    };
  }

  if (decision.type === "unauthorized") {
    return {
      type: "unauthorized",
      href: `${STATUS_PAGE_PATHS.unauthorized}?from=${encodeURIComponent(decision.from)}`,
      from: decision.from,
    };
  }

  return { type: "allow" };
}

export function getSignInCallbackUrl(callbackUrl: string | undefined): string {
  return safeAuthReturnPath(callbackUrl);
}

export function getUnauthorizedFrom(from: string | undefined): string {
  return from ?? STATUS_PAGE_PATHS.dev;
}

export const noIndexRoutePolicies = [
  { pathname: STATUS_PAGE_PATHS.dev, robotsDisallow: STATUS_PAGE_PATHS.dev, reason: "Protected editor shell" },
  {
    pathname: STATUS_PAGE_PATHS.review,
    robotsDisallow: STATUS_PAGE_PATHS.review,
    reason: "Protected review workbench",
  },
  { pathname: STATUS_PAGE_PATHS.signIn, robotsDisallow: STATUS_PAGE_PATHS.signIn, reason: "Authentication status page" },
  {
    pathname: STATUS_PAGE_PATHS.unauthorized,
    robotsDisallow: STATUS_PAGE_PATHS.unauthorized,
    reason: "Authorization status page",
  },
  {
    pathname: STATUS_PAGE_PATHS.invite,
    robotsDisallow: STATUS_PAGE_PATHS.invite,
    reason: "Invite redemption page",
  },
  {
    pathname: STATUS_PAGE_PATHS.resetPassword,
    robotsDisallow: STATUS_PAGE_PATHS.resetPassword,
    reason: "Password reset page",
  },
  {
    pathname: STATUS_PAGE_PATHS.search,
    robotsDisallow: STATUS_PAGE_PATHS.search,
    reason: "Search results utility page",
  },
] as const;

export function buildNoIndexPageMetadata(input: {
  title: string;
  description: string;
  pathname: (typeof noIndexRoutePolicies)[number]["pathname"];
}) {
  return buildPageMetadata({ ...input, noIndex: true });
}

export function buildRobotsPolicy(
  options: {
    editorHost?: boolean;
    site?: PublicSiteIdentity;
  } = {},
): MetadataRoute.Robots {
  // The editor deployment mirrors the application for authenticated work and remains
  // closed to crawlers.
  if (options.editorHost) {
    return { rules: { userAgent: "*", disallow: "/" } };
  }

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        ...noIndexRoutePolicies.map((policy) => policy.robotsDisallow),
        // Retired preview links redirect permanently; keep crawlers away while old
        // pre-launch URLs age out of indexes.
        PREVIEW_PATH_PREFIX,
      ],
    },
    sitemap: buildSiteUrl("/sitemap.xml", options.site ?? PUBLIC_SITE),
  };
}

