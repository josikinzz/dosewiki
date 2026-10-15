import { SITE_FLAVOR_CONFIG } from "@/config/siteFlavor";
import { flavoredCopyKey, flavoredCopyText, getCopyByKeys } from "@server/next/copyBlocks";
import { HomeExperience } from "./HomeExperience";
import { buildHomeQuickLinks } from "./homeQuickLinks";

const quickLinks = buildHomeQuickLinks();

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
