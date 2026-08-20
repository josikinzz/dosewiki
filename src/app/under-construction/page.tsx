import type { Metadata } from "next";
import { ConstructionLanding } from "../_components/ConstructionLanding";
import { SITE_FLAVOR_CONFIG } from "@/config/siteFlavor";

export const metadata: Metadata = {
  title: `${SITE_FLAVOR_CONFIG.name} is under construction`,
  description: SITE_FLAVOR_CONFIG.underConstructionDescription,
  robots: {
    index: false,
    follow: false,
  },
};

/**
 * The construction hosts' `/`. The middleware rewrites rather than redirects, so the
 * address bar still reads the bare origin; this route is what it serves there.
 */
export default function UnderConstructionPage() {
  return <ConstructionLanding />;
}
