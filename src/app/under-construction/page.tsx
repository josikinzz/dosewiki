import type { Metadata } from "next";
import { ConstructionLanding } from "../_components/ConstructionLanding";
import { SITE_FLAVOR_CONFIG } from "@/config/siteFlavor";

export const metadata: Metadata = {
  title: `${SITE_FLAVOR_CONFIG.name} — construction preview`,
  description: `Archived construction-state preview for ${SITE_FLAVOR_CONFIG.name}.`,
  robots: {
    index: false,
    follow: false,
  },
};

/** Direct route for inspecting the retained holding surface. */
export default function UnderConstructionPage() {
  return <ConstructionLanding />;
}
