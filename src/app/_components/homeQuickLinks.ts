import type { IconName } from "@/components/common/Icon";
import { SITE_FLAVOR_CONFIG, type SiteFlavorConfig, type SiteNavId } from "@/config/siteFlavor";
import { resolveRouteChromeIcon } from "@/utils/routeChromeIcons";

export interface HomeQuickLink {
  id: SiteNavId;
  href: string;
  label: string;
  icon: IconName;
}

// Icons resolve through the shared route-chrome map so the homepage nav stays in sync
// with the header/footer chrome and section pages — single source of truth.
const QUICK_LINK_DEFINITIONS: Record<SiteNavId, HomeQuickLink> = {
  substances: {
    id: "substances",
    href: "/substances",
    label: "Substances",
    icon: resolveRouteChromeIcon("substances"),
  },
  effects: {
    id: "effects",
    href: "/effects",
    label: "Effects",
    icon: resolveRouteChromeIcon("effects"),
  },
  replications: {
    id: "replications",
    href: "/replications",
    label: "Replications",
    icon: resolveRouteChromeIcon("replications"),
  },
  reports: {
    id: "reports",
    href: "/reports",
    label: "Reports",
    icon: resolveRouteChromeIcon("reports"),
  },
  about: {
    id: "about",
    href: "/about",
    label: "About",
    icon: resolveRouteChromeIcon("about"),
  },
};

/**
 * The homepage quick links, in the order the publication declares — not the order this
 * file happens to list them in. dose.wiki keeps Substances, Effects, Reports, About;
 * Effect Index leads with Effects.
 */
export function buildHomeQuickLinks(
  config: SiteFlavorConfig = SITE_FLAVOR_CONFIG,
): readonly HomeQuickLink[] {
  return config.quickLinkIds.map((id) => QUICK_LINK_DEFINITIONS[id]);
}
