import type { IconName } from "@/components/common/Icon";
import { SITE_FLAVOR_CONFIG, type SiteFlavorConfig, type SiteNavId } from "@/config/siteFlavor";
import { resolveRouteChromeIcon } from "@/utils/routeChromeIcons";

export interface HomeQuickLink {
  id: SiteNavId;
  href: string;
  label: string;
  icon: IconName;
}

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

export function buildHomeQuickLinks(
  config: SiteFlavorConfig = SITE_FLAVOR_CONFIG,
): readonly HomeQuickLink[] {
  return config.quickLinkIds.map((id) => QUICK_LINK_DEFINITIONS[id]);
}

export function balancedQuickLinkRowSizes(count: number): number[] {
  if (count <= 0) return [];
  const rowCount = Math.ceil(count / 3);
  const wideRows = count % rowCount;
  const narrowSize = Math.floor(count / rowCount);
  return Array.from({ length: rowCount }, (_, row) =>
    row < wideRows ? narrowSize + 1 : narrowSize,
  );
}

export function partitionQuickLinkRows<T>(items: readonly T[]): T[][] {
  const rows: T[][] = [];
  let start = 0;
  for (const size of balancedQuickLinkRowSizes(items.length)) {
    rows.push(items.slice(start, start + size));
    start += size;
  }
  return rows;
}

