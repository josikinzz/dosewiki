import { buildPublicPageMetadata } from "@server/next/publicSite";
import { requireEffectIndexFlavor } from "@/config/siteFlavor";
import { CopyrightDisclaimerPage } from "@/features/effect-index/pages/CopyrightDisclaimerPage";

const METADATA = {
  title: "Copyright Disclaimer",
  description:
    "The licence covering Effect Index material, and how to request that artwork be removed or reattributed to its original creator.",
  route: { family: "copyrightDisclaimer" } as const,
};

export async function generateMetadata() {
  requireEffectIndexFlavor();

  return buildPublicPageMetadata(METADATA);
}

export default function CopyrightDisclaimerRoute() {
  // Flavor gate first: on the dose.wiki build this route does not exist.
  requireEffectIndexFlavor();

  return <CopyrightDisclaimerPage />;
}
