import { SITE_FLAVOR_CONFIG } from "@/config/siteFlavor";
import { flavoredCopyKey, flavoredCopyText, getCopyByKeys } from "@server/next/copyBlocks";
import { HomeExperience } from "./HomeExperience";
import { buildHomeQuickLinks } from "./homeQuickLinks";

const quickLinks = buildHomeQuickLinks();

/**
 * The retained holding surface: the live homepage with every destination blocked.
 *
 * It renders only at `/under-construction`; the launched homepage cannot be replaced by
 * this retained inspection surface.
 *
 * Rendering the real homepage rather than a bespoke holding card is deliberate: visitors
 * see the site's appearance, while tiles answer "SOON" instead of navigating. The Theme
 * Lab is the one control the blocked surface withholds. See {@link HomeExperience}.
 */
export async function ConstructionLanding() {
  const copy = await getCopyByKeys([flavoredCopyKey("home-hero-tagline")]);

  return (
    <HomeExperience
      quickLinks={quickLinks}
      isConstructionMode
      copy={{
        tagline: flavoredCopyText(copy, "home-hero-tagline", SITE_FLAVOR_CONFIG.description),
      }}
    />
  );
}
