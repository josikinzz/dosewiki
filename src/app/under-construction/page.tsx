import type { Metadata } from "next";
import { ConstructionLanding } from "../_components/ConstructionLanding";
import { SITE_FLAVOR_CONFIG } from "@/config/siteFlavor";

export const metadata: Metadata = {
  // The browser tab is the same surface as the banner, so it says the same thing: not
  // that the site is being built, but when it opens.
  title: `${SITE_FLAVOR_CONFIG.name} — coming soon`,
  description: SITE_FLAVOR_CONFIG.underConstructionDescription,
  robots: {
    index: false,
    follow: false,
  },
};

/** Direct route for inspecting the retained holding surface. */
export default function UnderConstructionPage() {
  return <ConstructionLanding />;
}
