import { SITE_FLAVOR_CONFIG } from "@/config/siteFlavor";
import { flavoredCopyText, getCopy } from "@server/next/copyBlocks";
import { HomeExperience } from "./HomeExperience";
import { buildHomeQuickLinks } from "./homeQuickLinks";

const quickLinks = buildHomeQuickLinks();

/**
 * The retained holding surface: the live homepage with every destination blocked.
 *
 * It renders directly at `/under-construction`, and a whole deployment can additionally
 * put it at `/` with build-time `NEXT_PUBLIC_HOME_CONSTRUCTION_MODE`. The launched public
 * hosts do neither.
 *
 * Rendering the real homepage rather than a bespoke holding card is deliberate: visitors
 * see the site's appearance, while tiles answer "SOON" instead of navigating. The Theme
 * Lab is the one control the blocked surface withholds — see {@link HomeExperience}.
 */
export async function ConstructionLanding() {
  const copy = await getCopy();

  return (
    <HomeExperience
      quickLinks={quickLinks}
      isConstructionMode
      copy={{
        tagline: flavoredCopyText(copy, "home-hero-tagline", SITE_FLAVOR_CONFIG.description),
        constructionSubtitle: copy.text("home-construction-subtitle"),
      }}
    />
  );
}
