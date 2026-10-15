import {
  SITE_FLAVOR_CONFIG,
  isEffectIndex,
  isFlavorRouteEnabled,
  type FlavorGatedRoute,
  type SiteFlavorConfig,
} from "@/config/siteFlavor";

const FLAVOR_GATED_ROUTE_PREFIXES: readonly { route: FlavorGatedRoute; prefix: string }[] = [
  { route: "blog", prefix: "/blog" },
  { route: "donate", prefix: "/donate" },
  { route: "contact", prefix: "/contact" },
  { route: "discord", prefix: "/discord" },
  { route: "copyrightDisclaimer", prefix: "/copyright-disclaimer" },
  { route: "dev", prefix: "/dev" },
];

const EFFECT_INDEX_ONLY_ROUTE_PREFIXES: readonly string[] = ["/documentation-style-guide"];

export const FLAVOR_GATED_NOT_FOUND_PATH = "/_flavor-gated/not-found";

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function isFlavorGatedRequestPath(
  pathname: string,
  config: SiteFlavorConfig = SITE_FLAVOR_CONFIG,
): boolean {
  if (
    FLAVOR_GATED_ROUTE_PREFIXES.some(
      ({ route, prefix }) => matchesPrefix(pathname, prefix) && !isFlavorRouteEnabled(route, config),
    )
  ) {
    return true;
  }

  return (
    !isEffectIndex(config) &&
    EFFECT_INDEX_ONLY_ROUTE_PREFIXES.some((prefix) => matchesPrefix(pathname, prefix))
  );
}
