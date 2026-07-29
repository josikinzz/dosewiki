import type { MetadataRoute } from "next";
import { SITE_FLAVOR_CONFIG, type SiteFlavorConfig } from "../../src/config/siteFlavor";

/**
 * Flavor-aware web app manifest. Served by `src/app/manifest.ts` at the same
 * `/manifest.webmanifest` path the former static `public/` file used.
 */
export function buildSiteManifest(
  config: SiteFlavorConfig = SITE_FLAVOR_CONFIG,
): MetadataRoute.Manifest {
  return {
    name: config.manifest.name,
    short_name: config.manifest.shortName,
    start_url: "/",
    display: "standalone",
    background_color: config.manifest.backgroundColor,
    theme_color: config.manifest.themeColor,
    icons: config.manifest.icons.map((icon) => ({
      src: icon.src,
      type: icon.type,
      sizes: icon.sizes,
    })),
  };
}
