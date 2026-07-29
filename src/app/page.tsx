import type { Metadata } from "next";
import { env } from "node:process";
import { SITE_FLAVOR_CONFIG } from "@/config/siteFlavor";
import { HomeExperience } from "./_components/HomeExperience";
import { buildHomeQuickLinks } from "./_components/homeQuickLinks";

// The homepage deliberately does not route through buildPublicPageMetadata: its Open
// Graph card is inherited from the root layout's flavored metadata block. Only the title
// and description are overridden here, and both come from the site flavor config.
export function generateMetadata(): Metadata {
  const isConstructionMode = env.NEXT_PUBLIC_HOME_CONSTRUCTION_MODE === "true";

  return {
    title: SITE_FLAVOR_CONFIG.homeTitle,
    description: SITE_FLAVOR_CONFIG.description,
    robots: isConstructionMode
      ? {
          index: false,
          follow: false,
        }
      : undefined,
  };
}

const quickLinks = buildHomeQuickLinks();

export default function HomePage() {
  const isConstructionMode = env.NEXT_PUBLIC_HOME_CONSTRUCTION_MODE === "true";

  return <HomeExperience quickLinks={quickLinks} isConstructionMode={isConstructionMode} />;
}
