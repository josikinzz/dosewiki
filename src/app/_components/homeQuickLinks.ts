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
 * file happens to list them in. dose.wiki runs Substances, Effects, Replications,
 * Reports, About; Effect Index leads with Effects and omits Substances from its tile
 * grid, though its header now links the section.
 */
export function buildHomeQuickLinks(
  config: SiteFlavorConfig = SITE_FLAVOR_CONFIG,
): readonly HomeQuickLink[] {
  return config.quickLinkIds.map((id) => QUICK_LINK_DEFINITIONS[id]);
}

/**
 * Balanced row sizes for the homepage tile grid, capped at three tiles per row:
 * k = ceil(n/3) rows, the first (n mod k) rows hold ceil(n/k) tiles, the rest floor(n/k).
 * So 5 → [3, 2], 4 → [2, 2], 7 → [3, 2, 2], 6 → [3, 3]. Pure — layout code centres each
 * row; this only decides how many tiles land in each.
 */
export function balancedQuickLinkRowSizes(count: number): number[] {
  if (count <= 0) return [];
  const rowCount = Math.ceil(count / 3);
  const wideRows = count % rowCount;
  const narrowSize = Math.floor(count / rowCount);
  return Array.from({ length: rowCount }, (_, row) =>
    row < wideRows ? narrowSize + 1 : narrowSize,
  );
}

/** Split items into the balanced rows {@link balancedQuickLinkRowSizes} prescribes. */
export function partitionQuickLinkRows<T>(items: readonly T[]): T[][] {
  const rows: T[][] = [];
  let start = 0;
  for (const size of balancedQuickLinkRowSizes(items.length)) {
    rows.push(items.slice(start, start + size));
    start += size;
  }
  return rows;
}

